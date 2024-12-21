import os 
import json
import time
import uuid
import requests
from urllib.parse import urlparse
from sqlmodel import create_engine, Session, select
from fastapi import FastAPI, Request, status, HTTPException, Depends
from fastapi.responses import StreamingResponse, HTMLResponse, RedirectResponse
from fastapi.security import OAuth2PasswordBearer
from fastapi.middleware.cors import CORSMiddleware
from authlib.integrations.starlette_client import OAuth
from starlette.middleware.sessions import SessionMiddleware
from starlette.requests import Request as StarletteRequest
from fastapi.staticfiles import StaticFiles

import llm as llm
from utils import getenv, set_env_variables, get_all_models, get_online_models
from user_utils import APIKey, get_or_create_apikey
from fastapi.templating import Jinja2Templates
from fastapi.responses import PlainTextResponse


API_BASE=os.environ.get("RC_API_BASE", "http://140.238.223.13:8092/v1/service/llm/v1")
ENDPOINT = urlparse(API_BASE)
ENDPOINT = f"{ENDPOINT.scheme}://{ENDPOINT.netloc}/v1/dnt/table"
master_key = os.getenv("RC_PROXY_MASTER_KEY", "sk-research-computer-master-key-xzyao")
PG_HOST = os.environ.get("PG_HOST", "sqlite:///./test.db")

app = FastAPI()
app.add_middleware(SessionMiddleware, secret_key="some-random-string")
templates = Jinja2Templates(directory="templates")
engine = create_engine(PG_HOST)
app.mount("/static", StaticFiles(directory="static"), name="static")

known_keys = set()
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
    global known_keys
    if api_key == master_key:
        return
    if api_key in known_keys:
        return
    else:
        with Session(engine) as session:
            api_keys = session.exec(select(APIKey).where(APIKey.key == api_key)).all()
            known_keys.update([x.key for x in api_keys])
        if len(api_keys) == 0:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"error": "invalid user key"},
            )
        return

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
    response = llm.chat_completion(**data)
    if 'stream' in data and data['stream'] == True:
            return StreamingResponse(data_generator(response, response.generation), media_type='text/event-stream')
    return response


@app.post("/completions", dependencies=[Depends(user_api_key_auth)])
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
        if model not in [x['id'] for x in data]:
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

@app.get("/login")
async def login(request: Request):
    callback_addr = f"{request.base_url}users/callbacks"
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
    try:
        return response
    except Exception as e:
        return {"error": "error"}

@app.get("/api_key", response_class=HTMLResponse)
async def get_api_key(request: Request):
    # retrieve the users
    user_info = request.cookies.get("user")
    if not user_info:
        return RedirectResponse(url="/login")
    user_info = json.loads(user_info.replace("\'", "\""))
    if user_info['https://cilogon.org/idp_name'] in [
        'ETH Zurich', 
        'EPFL - EPF Lausanne', 
        'Universite de Lausanne', 
        'Universität Bern', 
        'University of Zurich'
    ]:
        user_key = get_or_create_apikey(engine=engine, owner_email=user_info['email']).key
    else:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"User not authenticated! Your IDP is {user_info['https://cilogon.org/idp_name']}")
    
    available_models = get_all_models(endpoint=ENDPOINT)
    response = templates.TemplateResponse("api_key.html", {"request": request, "api_key": user_key, "user": user_info, "models": available_models})
    response.set_cookie("rc_api_key", user_key)
    return response

@app.get("/metrics")
def get_aggregated_metrics(request: Request):
    online_models = get_online_models(endpoint=ENDPOINT)
    # Fetch metrics for each online model
    aggregated_metrics = []
    for model in online_models:
        try:
            metrics_response = requests.get(model["metrics_url"])
            if metrics_response.status_code == 200:
                metrics_response = metrics_response.text
                aggregated_metrics.append(metrics_response)
            else:
                print(f"err: {metrics_response.text}")
        except Exception as e:
            print(f"Error: {e}")
            #aggregated_metrics.append(f"# Metrics for model {model['model_name']} (ID: {model})\n# Failed to fetch metrics: {e}")
    
    # Combine metrics into a single response
    metrics_output = "".join(aggregated_metrics)
    return PlainTextResponse(
        metrics_output,
        media_type="text/plain",
    )

@app.get("/chat")
async def chat(request: Request):
    api_key = request.cookies.get("rc_api_key")
    available_models = get_all_models(endpoint=ENDPOINT)
    if not api_key:
        return RedirectResponse(url="/login")
    return templates.TemplateResponse("chat_gui.html", {"request": request, "apiKey": api_key, "models": available_models})

@app.get("/metrics")
def get_aggregated_metrics(request: Request):
    online_models = get_online_models(endpoint=ENDPOINT)
    # Fetch metrics for each online model
    aggregated_metrics = []
    for model in online_models:
        try:
            metrics_response = requests.get(model["metrics_url"])
            if metrics_response.status_code == 200:
                metrics_response = metrics_response.text
                aggregated_metrics.append(metrics_response)
            else:
                print(f"err: {metrics_response.text}")
        except Exception as e:
            print(f"Error: {e}")
            #aggregated_metrics.append(f"# Metrics for model {model['model_name']} (ID: {model})\n# Failed to fetch metrics: {e}")
    
    # Combine metrics into a single response
    metrics_output = "".join(aggregated_metrics)
    return PlainTextResponse(
        metrics_output,
        media_type="text/plain",
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=getenv("PORT", 8080))
