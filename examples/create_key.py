import requests

endpoint = "https://llm.research.computer/key/new"

res = requests.post(endpoint, headers={"Authorization": "Bearer LQiOGvSZ4Pjku84izoJwOOy7lnoHfrp1gbGu06wKpXz"}, json={"budget": 1000}).json()
print(res)