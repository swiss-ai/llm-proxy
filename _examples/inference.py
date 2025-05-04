import openai

client = openai.Client(api_key="sk-rc", base_url="http://")

# client = openai.Client(api_key="sk-rc-QWR6yqhyQI2bQewChIImMg", base_url="http://localhost:8080")

res = client.chat.completions.create(
    model="meta-llama/Meta-Llama-3.1-8B-Instruct",
    messages=[
        {
            "content": "Hello from bristen", 
            "role": "user",
        }
    ],
    # stream=False,
)
print(res)