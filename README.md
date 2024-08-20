# LLM Serving Proxy

## Environment Variables

LANGFUSE_HOST="https://cloud.langfuse.com"
LANGFUSE_PUBLIC_KEY=""
LANGFUSE_SECRET_KEY=""

PG_HOST="postgresql://"
RC_API_BASE="http://ip_addr:8092/v1/service/llm/v1" # address of the global dispatcher
RC_PROXY_MASTER_KEY="" # master key, choose as you like, but keep it secret and use a strong one
RC_VLLM_API_KEY="" # key used when starting the vllm instances

```bash
docker run -it -p 8080:8080  
```