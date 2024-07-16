import openai

client = openai.Client(api_key="sk-litellm-master-key", base_url="http://localhost:8080")

res = client.chat.completions.create(model="meta-llama/Meta-Llama-3-8B-Instruct", messages=[{"content": "what is YC?", "role": "user"}])

print(res)