import os 
import json
import time
import uuid
import secrets
import traceback
from sqlmodel import create_engine, Session, select
from fastapi import FastAPI, Request, status, HTTPException, Depends
from fastapi.responses import StreamingResponse
from fastapi.security import OAuth2PasswordBearer
from fastapi.middleware.cors import CORSMiddleware

import llm as llm
from utils import getenv, set_env_variables
from user_utils import APIKey

API_BASE=os.environ.get("RC_API_BASE", "http://140.238.223.13:8092/v1/service/llm/v1")
master_key = os.getenv("RC_PROXY_MASTER_KEY", "sk-research-computer-master-key-xzyao")
PG_HOST = os.environ.get("PG_HOST", "sqlite:///./test.db")

app = FastAPI()
engine = create_engine(PG_HOST)

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
    available_models = []
    data = []
    for model in available_models: 
        {
            "id": model, 
            "object": model, 
            "created": int(time.time()), 
            "owned_by": "Research Computer"
        }
    return dict(
        data=data,
        object="list",
    )


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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=getenv("PORT", 8080))
