import openai

client = openai.Client(api_key="sk-rc-kaOvOtIrCqnofSLNrhH0Ew", base_url="https://llm.research.computer")
# client = openai.Client(api_key="sk-rc-QWR6yqhyQI2bQewChIImMg", base_url="http://localhost:8080")

res = client.chat.completions.create(
    model="meta-llama/Meta-Llama-3.1-70B-Instruct",
    messages=[
        {
            "content": "This should bypass the tracking", 
            "role": "user",
        }
    ],
    # stream=False,
)
print(res)