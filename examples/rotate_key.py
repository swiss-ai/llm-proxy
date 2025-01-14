import os
import requests

endpoint = "http://fmapi.swissai.cscs.ch/keys/rotation"

master_key = os.getenv("RC_API_KEY")

res = requests.get(endpoint, headers={"Authorization": "Bearer " + master_key})
print(res)