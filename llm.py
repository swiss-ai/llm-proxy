import os
import backoff
import threading
import uuid
from typing import Dict
from collections import defaultdict
from protocol import ModelResponse
from errors import RetryConstantError, RetryExpoError, UnknownLLMError
if os.getenv("DISABLE_TRACKING", "0") == "1":
    print("Tracking is disabled")
    disable_tracking = True
    import openai
else:
    from langfuse.openai import openai

cost_dict: Dict[str, Dict[str, float]] = defaultdict(dict)
cost_dict_lock = threading.Lock()
API_BASE=os.environ.get("RC_API_BASE", "http://140.238.223.13:8092/v1/service/llm/v1")

client = openai.OpenAI(
    api_key=os.getenv("RC_VLLM_API_KEY", "YOUR_API_KEY"),
    base_url=API_BASE,
)

def handle_llm_exception(e: Exception):
    if isinstance(
        e,
        (
            openai.APIError,
            openai.Timeout,
        ),
    ):
        raise RetryConstantError from e
    elif isinstance(e, openai.RateLimitError):
        raise RetryExpoError from e
    elif isinstance(
        e,
        (
            openai.APIConnectionError,
            openai.AuthenticationError,
        ),
    ):
        raise e
    else:
        raise UnknownLLMError from e

@backoff.on_exception(
    wait_gen=backoff.constant,
    exception=RetryConstantError,
    max_tries=3,
    interval=3,
)
@backoff.on_exception(
    wait_gen=backoff.expo,
    exception=RetryExpoError,
    jitter=backoff.full_jitter,
    max_value=100,
    factor=1.5,
)
def completion(**kwargs) -> ModelResponse:
    user_key = kwargs.pop("user_key")
    master_key = kwargs.pop("master_key")
    def _completion():
        try:
            kwargs['name']="chat-generation"
            if user_key == master_key:
                # use as admin of the server
                kwargs['user_id'] = user_key
                if disable_tracking:
                    kwargs.pop("trace_id", None)
                    kwargs.pop("user_id", None)
                    kwargs.pop("user_key", None)
                    kwargs.pop("session_id", None)
                    kwargs.pop("name", None)
                response = client.chat.completions.create(**kwargs)
            else:
                # for end user based rate limiting
                # todo: budget control here
                kwargs['user_id'] = user_key
                if disable_tracking:
                    kwargs.pop("trace_id", None)
                    kwargs.pop("user_id", None)
                    kwargs.pop("user_key", None)
                    kwargs.pop("session_id", None)
                    kwargs.pop("name", None)
                response = client.chat.completions.create(**kwargs)
            return response
        except Exception as e:
            handle_llm_exception(e) # this tries fallback requests
    try:
        return _completion()
    except Exception as e:
        raise e