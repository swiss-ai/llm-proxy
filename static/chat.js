
window.onload = function () {
  let chatHistory = []; // Persistent chat history
  
  const sendBtnElem = document.getElementById("sendBtn");
  const chatMessageElem = document.getElementById("chatMessage");
  const chatOutputElem = document.getElementById("chatOutput");
  const modelSelectElem = document.getElementById("modelSelect");

  // Call fetchModels when the page loads
  fetchModels();

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
    const BASE_URL = "https://fmapi.swissai.cscs.ch/models";

    fetch(BASE_URL, {
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
    const chatBubbleElem = document.createElement("div");
    chatBubbleElem.classList.add("container", "user-container");
    chatBubbleElem.innerHTML = `<p>${message}</p>`;
    chatOutputElem.appendChild(chatBubbleElem);
    chatOutputElem.scrollTop = chatOutputElem.scrollHeight;
  }

  function generateAIChatBubble() {
    const chatBubbleElem = document.createElement("div");
    chatBubbleElem.classList.add("container", "darker");
    const messageElem = document.createElement("p");
    chatBubbleElem.appendChild(messageElem);
    chatOutputElem.appendChild(chatBubbleElem);
    chatOutputElem.scrollTop = chatOutputElem.scrollHeight;

    return messageElem;
  }

  async function sendMessage(message, model, onSuccessCallback) {
    chatHistory.push({ role: "user", content: message.trim() }); // Add user message to history

    const BASE_URL = "https://fmapi.swissai.cscs.ch/chat/completions";

    const messageBody = {
      model: model,
      messages: chatHistory,
      stream: true, // Enable streaming
    };

    const response = await fetch(BASE_URL, {
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

    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop(); // Keep incomplete chunk in the buffer

      for (const chunk of chunks) {
        if (chunk.startsWith("data:")) {
          const data = chunk.slice(5).trim(); // Remove "data:" prefix
          if (data === "[DONE]") {
            return;
          }
	  
	  try {
	    const parsed = JSON.parse(data);
	    if (parsed.choices && parsed.choices.length > 0 && parsed.choices[0].delta && parsed.choices[0].delta.content) {
	      const partialText = parsed.choices[0].delta.content;
	      aiMessageElem.textContent += partialText; // Append to the AI chat bubble
	      chatOutputElem.scrollTop = chatOutputElem.scrollHeight;
	    }
	  } catch (error) {
	    console.error("Error parsing streaming response:", error, data);
	  }
        }
      }
    }

    chatHistory.push({ role: "assistant", content: aiMessageElem.textContent });
  }
};
