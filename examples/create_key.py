import os
import requests

# endpoint = "https://llm.research.computer/key/new"
endpoint = "http://148.187.108.173:8080/key/new"

master_key = os.getenv("RC_MASTER_KEY")

res = requests.post(endpoint, headers={"Authorization": f"Bearer {master_key}"}, json={"budget": 1000}).json()
print(res)