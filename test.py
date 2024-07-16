import openai

client = openai.Client(api_key="sk-research-computer-master-key-xzyao", base_url="http://localhost:8080")

res = client.chat.completions.create(model="meta-llama/Meta-Llama-3-8B-Instruct", messages=[{"content": "what is YC?", "role": "user"}], stream=True)

for chunk in res:
    print(chunk)
# import requests

# res = requests.post("http://localhost:8080/key/new", headers={"Authorization": "Bearer sk-research-computer-master-key-xzyao"}, json={"total_budget": 99999})
# print(res.json())