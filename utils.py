import os
import functools
import requests
import json
from dotenv import load_dotenv

load_dotenv()


@functools.lru_cache(maxsize=None)
def getenv(key, default=0):
    return type(default)(os.getenv(key, default))


def set_env_variables(data):
    try:
        if "env_variables" in data:
            env_variables = data["env_variables"]
            for key in env_variables:
                os.environ[key] = env_variables[key]
            data.pop("env_variables")
    except:
        pass

def get_all_models(endpoint: str):
    available_models = []
    providers = requests.get(endpoint).json()
    for provider in providers.keys():
        services = providers[provider]['service']
        try:
            for svc in services:
                if svc['name'] == "llm":
                    # identity groups are in the form of "key=value", we split into tuples
                    identity_groups = [tuple(x.split("=")) for x in svc['identity_group']]
                    # filter out the tuple that has the key "model"
                    model = dict(filter(lambda x: x[0] == "model", identity_groups))['model']
                    available_models.append(model)
        except Exception as e:
            pass
    available_models = list(set(available_models))
    return available_models

def get_online_models(endpoint: str):
    online_models = []
    providers = requests.get(endpoint).json()
    for provider in providers.keys():
        services = providers[provider]['service']
        try:
            for svc in services:
                if svc['name'] == "llm" and svc['status'] == "online":
                    identity_groups = [tuple(x.split("=")) for x in svc['identity_group']]
                    model = dict(filter(lambda x: x[0] == "model", identity_groups))['model']
                    metrics_url = f"http://148.187.108.172:8092/v1/p2p/{providers["id"]}/v1/_service/llm/metrics" # TO CHANGE, USE VARIABLE INSTEAD OF IP

                    online_models.append({
                        "model_name": model,
                        "metrics_url": metrics_url,
                    })
        except Exception as e:
            pass

    return online_models
