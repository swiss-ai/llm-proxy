import requests

endpoint = "http://localhost:8080/key/new"

res = requests.post(endpoint, headers={"Authorization": "Bearer sk-research-computer-master-key-xzyao"}, json={"budget": 1000}).json()
print(res)