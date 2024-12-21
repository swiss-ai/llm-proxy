window.onload = function () {
  const BASE_URL = "https://fmapi.swissai.cscs.ch";

  let chatHistory = []; // Persistent chat history
  
  const sendBtnElem = document.getElementById("sendBtn");
  const chatMessageElem = document.getElementById("chatMessage");
  const chatOutputElem = document.getElementById("chatOutput");
  const modelSelectElem = document.getElementById("modelSelect");

  // fetchModels();

  sendBtnElem.addEventListener("click", function () {
    const message = chatMessageElem.value;
    const selectedModel = modelSelectElem.value;

    if (!selectedModel) {
      alert("Please select a model.");
      return;
    }

    if (message) {
      generateUserChatBubble(message);
      sendMessage(message, selectedModel, generateAIChatBubble);
      chatMessageElem.value = "";
    } else {
      alert("Please enter a message.");
    }
  });

  function fetchModels() {
    fetch(`${BASE_URL}/models`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(`Error fetching models: ${response.status} ${response.statusText}`);
        }
        return response.json();
      })
      .then(data => {
        if (data.data && data.data.length > 0) {
          const models = data.data.map(model => model.id); // Extract model IDs
          modelSelectElem.innerHTML = models
            .map(model => `<option value="${model}">${model}</option>`)
            .join("");
        } else {
          alert("No models available.");
        }
      })
      .catch(error => {
        alert("Error fetching models from the API.");
        console.error(error);
      });
  }

  function generateUserChatBubble(message) {
    chatOutputElem.innerHTML += `<div class="container user-container"><p>${message}</p></div>`;
    chatOutputElem.scrollTop = chatOutputElem.scrollHeight;
  }

  function generateAIChatBubble() {
    chatOutputElem.innerHTML += `<div class="container darker"></div>`;
    chatOutputElem.scrollTop = chatOutputElem.scrollHeight;
    return chatOutputElem.lastElementChild;
  }

  async function sendMessage(message, model, onSuccessCallback) {
    chatHistory.push({ role: "user", content: message.trim() }); // Add user message to history

    const messageBody = {
      model: model,
      messages: chatHistory,
      stream: true, // Enable streaming
    };

    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messageBody),
    });

    if (!response.ok) {
      alert("Error communicating with the API.");
      console.error(response.statusText);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    const aiMessageElem = onSuccessCallback();

    let accumulatedText = ""

    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop(); // Keep incomplete chunk in the buffer

      for (const chunk of chunks) {
	if (!chunk.startsWith("data:")) continue;
	
        const data = chunk.slice(5).trim(); // Remove "data:" prefix
        if (data === "[DONE]") return;
	
	try {
	  const parsed = JSON.parse(data);
	  if (parsed?.choices?.[0]?.delta?.content) {
	    const partialText = parsed.choices[0].delta.content;
	    accumulatedText += partialText;
	    aiMessageElem.innerHTML = marked.parse(accumulatedText); 
	  }
	} catch (error) {
	  console.error("Error parsing streaming response:", error, data);
	}
      }
    }

    chatHistory.push({ role: "assistant", content: aiMessageElem.textContent });
  }
};
