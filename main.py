import os 
import json
import secrets
import traceback
import time
import litellm.proxy
import litellm.proxy.proxy_server
import llm as llm
from utils import getenv, set_env_variables
import litellm
from litellm import BudgetManager
from fastapi import FastAPI, Request, status, HTTPException, Depends
from fastapi.responses import StreamingResponse
from fastapi.security import OAuth2PasswordBearer
from fastapi.middleware.cors import CORSMiddleware

litellm.max_budget = 1000 

budget_manager = BudgetManager(project_name=os.getenv("PROJECT_NAME", "research-computer"), client_type="local")
API_BASE=os.environ.get("RC_API_BASE", "http://140.238.223.13:8092/v1/service/llm/v1")
litellm.success_callback = ["helicone"]

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
master_key = os.getenv("RC_PROXY_MASTER_KEY", "sk-research-computer-master-key-xzyao")
user_api_keys = set(budget_manager.get_users())
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

os.environ['OPENAI_API_KEY'] = "YOUR_API_KEY"

######## AUTH UTILITIES ################

def user_api_key_auth(api_key: str = Depends(oauth2_scheme)):
    if api_key == master_key:
        return
    if api_key not in user_api_keys:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "invalid user key"},
            # TODO: this will be {'detail': {'error': 'something'}}
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
def data_generator(response):
    for chunk in response:
        print(f"chunk: {chunk}")
        yield f"data: {json.dumps(chunk.to_dict())}\n\n"

# for completion
@app.post("/chat/completions", dependencies=[Depends(user_api_key_auth)])
async def completion(request: Request):
    key = request.headers.get("Authorization").replace("Bearer ", "")  # type: ignore
    data = await request.json()
    print(f"received request data: {data}")
    data["user_key"] = key
    data["budget_manager"] = budget_manager
    data["master_key"] = master_key
    set_env_variables(data)
    # handle how users send streaming
    if 'stream' in data:
        if type(data['stream']) == str: # if users send stream as str convert to bool
            # convert to bool
            if data['stream'].lower() == "true":
                data['stream'] = True # convert to boolean
    
    response = llm.completion(**data)
    if 'stream' in data and data['stream'] == True: # use generate_responses to stream responses
            return StreamingResponse(data_generator(response), media_type='text/event-stream')
    return response

@app.get("/models") # if project requires model list 
def model_list(): 
    available_models = litellm.utils.get_valid_models()
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

@app.get("/key/cost", dependencies=[Depends(user_api_key_auth)])
async def report_current(request: Request):
    key = request.headers.get("Authorization").replace("Bearer ", "")  # type: ignore
    return budget_manager.get_model_cost(key)


@app.post("/key/new", dependencies=[Depends(key_auth)])
async def generate_key(request: Request):
    try:
        data = await request.json()
        data.get("total_budget")
    except:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST)

    total_budget = data["total_budget"]

    api_key = f"sk-rc-{secrets.token_urlsafe(16)}"

    try:
        budget_manager.create_budget(
            total_budget=total_budget, user=api_key, duration="monthly"
        )
        user_api_keys.add(api_key)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)

    return {"api_key": api_key, "total_budget": total_budget, "duration": "monthly"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=getenv("PORT", 8080))
