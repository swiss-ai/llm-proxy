import os 
import json
import time
import uuid
import secrets
import traceback
from urllib.parse import urlparse

from sqlmodel import create_engine, Session, select
from fastapi import FastAPI, Request, status, HTTPException, Depends
from fastapi.responses import StreamingResponse, HTMLResponse, RedirectResponse
from fastapi.security import OAuth2PasswordBearer
from fastapi.middleware.cors import CORSMiddleware
from authlib.integrations.starlette_client import OAuth
from starlette.middleware.sessions import SessionMiddleware
from starlette.requests import Request as StarletteRequest
import llm as llm
from utils import getenv, set_env_variables, get_all_models
from user_utils import APIKey
from fastapi.templating import Jinja2Templates


API_BASE=os.environ.get("RC_API_BASE", "http://140.238.223.13:8092/v1/service/llm/v1")
ENDPOINT = urlparse(API_BASE)

ENDPOINT = f"{ENDPOINT.scheme}://{ENDPOINT.netloc}/v1/dnt/table"
master_key = os.getenv("RC_PROXY_MASTER_KEY", "sk-research-computer-master-key-xzyao")
PG_HOST = os.environ.get("PG_HOST", "sqlite:///./test.db")

app = FastAPI()
app.add_middleware(SessionMiddleware, secret_key="some-random-string")
templates = Jinja2Templates(directory="templates")
engine = create_engine(PG_HOST)

oauth = OAuth()

oauth.register(
    "auth0",
    client_id=os.environ.get("AUTH0_CLIENT_ID"),
    client_secret=os.environ.get("AUTH0_CLIENT_SECRET"),
    client_kwargs={
        "scope": "openid profile email",
    },
    server_metadata_url=f'https://{os.environ.get("AUTH0_DOMAIN")}/.well-known/openid-configuration'
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")
os.environ['OPENAI_API_KEY'] = "YOUR_API_KEY"

######## AUTH UTILITIES ################

def user_api_key_auth(api_key: str = Depends(oauth2_scheme)):
    if api_key == master_key:
        return
    with Session(engine) as session:
        api_keys = session.exec(select(APIKey).where(APIKey.key == api_key)).all()
    if len(api_keys) == 0:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "invalid user key"},
        )

def key_auth(api_key: str = Depends(oauth2_scheme)):
    if api_key != master_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "invalid admin key"},
            # TODO: this will be {'detail': {'error': 'something'}}
        )

######## CHAT COMPLETIONS ################
# for streaming
def data_generator(response, generation):
    for chunk in response:
        data = chunk.to_dict()
        if data.get("usage", None) is not None:
            generation.update(usage={
                "promptTokens": data["usage"]["prompt_tokens"],
                "completionTokens": data["usage"]["completion_tokens"],
            })
        yield f"data: {json.dumps(data)}\n\n"

# for completion
@app.post("/chat/completions", dependencies=[Depends(user_api_key_auth)])
async def completion(request: Request):
    key = request.headers.get("Authorization").replace("Bearer ", "")
    data = await request.json()
    data["user_key"] = key
    data["master_key"] = master_key
    if not os.getenv("DISABLE_TRACKING", "0") == "1":
        data['trace_id'] = str(uuid.uuid4())
    set_env_variables(data)
    if 'stream' not in data:
        data['stream'] = False
    if type(data['stream']) == str:
        if data['stream'].lower() == "true":
            data['stream'] = True # convert to boolean
    if data['stream']:
        data['stream_options'] = {"include_usage": True}
    response = llm.completion(**data)
    if 'stream' in data and data['stream'] == True:
            return StreamingResponse(data_generator(response, response.generation), media_type='text/event-stream')
    return response

@app.get("/models")
def model_list(): 
    available_models = get_all_models(endpoint=ENDPOINT)
    data = []
    for model in available_models: 
        data.append({
            "id": model, 
            "object": "model", 
            "created": int(time.time()), 
            "owned_by": "0x00"
        })
    return dict(
        data=data,
        object="list",
    )
    
@app.get("/", response_class=HTMLResponse)
async def terms_of_use(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/health")
async def health():
    return {"status": "ok"}

######## KEY MANAGEMENT ################

@app.post("/key/new", dependencies=[Depends(key_auth)])
async def generate_key(request: Request):
    try:
        data = await request.json()
        data.get("budget")
    except:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST)

    budget = data["budget"]
    api_key = f"sk-rc-{secrets.token_urlsafe(16)}"
    user_key = APIKey(key=api_key, budget=budget)
    try:
        with Session(engine) as session:
            session.add(user_key)
            session.commit()
            session.refresh(user_key)
            
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)

    return user_key

@app.post("/keys", dependencies=[Depends(key_auth)])
async def import_keys(request: Request):
    try:
        data = await request.json()
        keys = data.get("keys")
    except:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST)

    for key in keys:
        user_key = APIKey(key=key["key"], budget=key["budget"])
        try:
            with Session(engine) as session:
                session.add(user_key)
                session.commit()
                session.refresh(user_key)
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)

    return {"status": "ok"}

@app.get("/login")
async def login(request: Request):
    callback_addr = str(request.base_url)+"users/callbacks"
    print(callback_addr)
    return await oauth.auth0.authorize_redirect(
        request=request,
        redirect_uri=callback_addr,
    )

@app.get("/users/callbacks")
async def callback(request: StarletteRequest):
    user = await oauth.auth0.authorize_access_token(request=request)
    request.session['user'] = user
    response = RedirectResponse(url="/api_key")
    response.set_cookie("user", user['userinfo'])
    return response

@app.get("/api_key", response_class=HTMLResponse)
async def get_api_key(request: Request):
    # retrieve the users
    user_info = request.cookies.get("user")
    user_info = user_info.replace("\'", "\"")
    user_info = json.loads(user_info)
    if user_info['https://cilogon.org/idp_name'] in ['ETH Zurich', 'EPFL - EPF Lausanne']:
        api_key = f"sk-rc-{secrets.token_urlsafe(16)}"
        user_key = APIKey(key=api_key, budget=1000)
        try:
            with Session(engine) as session:
                session.add(user_key)
                session.commit()
                session.refresh(user_key)
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)
    else:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not authenticated!")

    return templates.TemplateResponse("api_key.html", {"request": request, "api_key": api_key, "user": user_info})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=getenv("PORT", 8080))
