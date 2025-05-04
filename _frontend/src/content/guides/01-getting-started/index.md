---
title: "Getting Started"
description: "Getting Started"
date: "Mar 18 2024"
---

### Step 1: Fetch A Key

You can fetch a key from here: https://fmapi.swissai.cscs.ch.

### Step 3: Check which models are available

...by visiting https://fmapi.swissai.cscs.ch.

### Step 3: Access the API from Python

```
import requests
import base64
import json
from openai import OpenAI

json_schema = json.dumps(
    {
        "type": "object",
        "properties": {
            "name": {"type": "string", "pattern": "^[\\w]+$"},
            "population": {"type": "integer"},
        },
        "required": ["name", "population"],
    }
)
prompt = "What is in this image?"
img_url = "https://images.unsplash.com/photo-1692350914621-f0ca2d206368?q=80&w=3000&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
stream = True


def end_to_end(args):
    if args.multi_modal:
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {"url": img_url},
                    },
                ],
            }
        ]
    else:
        messages = [
            {
                "role": "user",
                "content": prompt,
            }
        ]

    client = OpenAI(
        base_url="https://fmapi.swissai.cscs.ch",
        api_key="sk-rc-...", # replace with your own key
    )
    if args.constrained:
        response_format = {
            "type": "json_schema",
            "json_schema": {"name": "foo", "schema": json.loads(json_schema)},
        }
    else:
        response_format = None

    response = client.chat.completions.create(
        model=args.model,
        messages=messages,
        response_format=response_format,
        stream=args.stream,
    )
    if args.stream:
        for chunk in response:
            if len(chunk.choices) > 0 and chunk.choices[0].delta.content:
                print(chunk.choices[0].delta.content, end="", flush=True)
    else:
        print(response.choices[0].message.content)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--model", type=str, default="meta-llama/Llama-3.2-90B-Vision-Instruct"
    )
    parser.add_argument("--stream", action="store_true", default=False)
    parser.add_argument("--constrained", action="store_true", default=False)
    parser.add_argument("--multi-modal", action="store_true", default=False)
    args = parser.parse_args()
    end_to_end(args)
```


**Caveats**

- When the serving backend is restarting (e.g., due to the time limit of the slurm job), the frontend may show that the model is available, but the backend is not ready to serve requests yet. In this case, you will receive an error. Please wait a few minutes and try again.