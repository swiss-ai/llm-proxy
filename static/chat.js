window.onload = function () {
    const sendBtnElem = document.getElementById("sendBtn");
    const chatMessageElem = document.getElementById("chatMessage");
    const chatOutputElem = document.getElementById("chatOutput");
    const loadingContainerElem = document.getElementById("loadingContainer");
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
            loadingContainerElem.classList.remove("invisible");
            sendChatGPTMessage(message, selectedModel, generateAIChatBubble);
            chatMessageElem.value = "";
        } else {
            alert("Please enter a message.");
        }
    });

    function fetchModels() {
        fetch('https://fmapi.swissai.cscs.ch/models')  // Ensure this is the correct path
            .then(response => response.json())
            .then(data => {
                console.log(data.data)
                if (data.data && data.data.length > 0) {
                    let models = data.data.map(model => model.id);
                    // Populate models into the dropdown
                    modelSelectElem.innerHTML = models.map(model => `<option value="${model}">${model}</option>`).join("");
                } else {
                    alert("No models available online");
                }
            })
            .catch(() => {
                alert("Error fetching models from the server.");
            });
    }

    function generateUserChatBubble(message) {
        const chatMessageDiv = document.createElement("div");
        chatMessageDiv.className = "flex items-start space-x-3 mb-3";
        const userAvatar = document.createElement("img");

        try {
            let user = document.cookie.split(';').find((cookie) => cookie.includes('user')).split('=')[1];
            user = JSON.parse(decodeURIComponent(user)).user;
            let userEmailHash = CryptoJS.MD5("test@test.com");
            userAvatar.src = `https://www.gravatar.com/avatar/${userEmailHash}?s=48&d=identicon`;
        }
        catch (error) {
            userAvatar.src = "/static/images/user_avatar.png"; // Make sure this image exists
            console.error("Error parsing user cookie:", error);
        }
        
        userAvatar.alt = "User Avatar";
        userAvatar.className = "w-8 h-8 rounded-full";

        const messageDiv = document.createElement("div");
        messageDiv.className = "bg-blue-100 text-gray-800 px-4 py-2 rounded-lg max-w-md break-words";
        messageDiv.innerHTML = `<md-block>${message}</md-block>`;

        chatMessageDiv.appendChild(userAvatar);
        chatMessageDiv.appendChild(messageDiv);

        chatOutputElem.appendChild(chatMessageDiv);
        chatOutputElem.scrollTop = chatOutputElem.scrollHeight;
    }

    function generateAIChatBubble(message) {
        const chatMessageDiv = document.createElement("div");
        chatMessageDiv.className = "flex items-start space-x-3 mb-3";

        const modelAvatar = document.createElement("img");
        modelAvatar.src = "/static/images/model_avatar.png"; // Make sure this image exists
        modelAvatar.alt = "Model Avatar";
        modelAvatar.className = "w-8 h-8 rounded-full";

        const messageDiv = document.createElement("div");
        messageDiv.className = "bg-green-100 text-gray-800 px-4 py-2 rounded-lg max-w-md break-words";
        messageDiv.innerHTML = `<md-block>${message}</md-block>`;

        chatMessageDiv.appendChild(modelAvatar);
        chatMessageDiv.appendChild(messageDiv);

        chatOutputElem.appendChild(chatMessageDiv);
        chatOutputElem.scrollTop = chatOutputElem.scrollHeight;
        loadingContainerElem.classList.add("invisible");
        return messageDiv;
    }

    async function sendChatGPTMessage(message, model, onSuccessCallback) {
        const chatHistory = [{ role: "user", content: message.trim() }];
        const BASE_URL = "https://fmapi.swissai.cscs.ch/chat/completions";
        const API_KEY = document.getElementById("apiKey").value;
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
        aiMessageElem.textContent = ""
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
                        if (parsed.choices && parsed.choices[0].delta.content) {
                            const partialText = parsed.choices[0].delta.content;
                            // if partitialText is not undefined
                            
                            if (partialText) {
                                aiMessageElem.textContent += partialText; // Append to the AI chat bubble
                                chatOutputElem.scrollTop = chatOutputElem.scrollHeight;
                            }
                        }
                    } catch (error) {
                        console.error("Error parsing streaming response:", error);
                    }
                }
            }
        }
    }
};