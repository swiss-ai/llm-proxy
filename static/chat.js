window.onload = function () {
  const BASE_URL = "https://fmapi.swissai.cscs.ch"; // OFFLINETEST
  // const BASE_URL = "https://api.openai.com/v1"; // OFFLINETEST

  // DOM Elements
  const sendBtnElem = document.getElementById("sendBtn");
  const chatMessageElem = document.getElementById("chatMessage");
  const chatOutputElem = document.getElementById("chatOutput");
  const modelSelectElem = document.getElementById("modelSelect");
  const clearHistoryBtn = document.getElementById("clearHistoryBtn");
  const chatHistoryListElem = document.getElementById("chatHistoryList");
  const parallelBtn = document.getElementById("parallelBtn");
  const appContainer = document.getElementById("appContainer");

  // State variables
  let chats = {}; // All chat conversations stored by ID
  let currentChatId = null; // Currently active chat ID
  let imageAttachments = []; // Current image attachments
  let parallelResponses = []; // For storing parallel responses
  let lastSentImages = []; // Store a copy of sent images for better UX
  let currentReader = null; // To track the current streaming reader
  let currentResponse = null; // To track the current response element
  
  // Initialize LaTeX rendering options
  if (window.renderMathInElement) {
    window.katexOptions = {
      delimiters: [
        {left: '$$', right: '$$', display: true},
        {left: '$', right: '$', display: false},
        {left: '\\(', right: '\\)', display: false},
        {left: '\\[', right: '\\]', display: true}
      ],
      throwOnError: false
    };
  }
  
  // Initialize
  // TEMPLATES 
  fetchModels();  // OFFLINETEST
  // setupTestModel(); // OFFLINETEST
  loadChatHistory();
  initEventListeners();
  
  // Setup close sidebar when clicking outside
  document.addEventListener("click", function(e) {
    const sidebar = document.getElementById("chatSidebar");
    const hamburger = document.getElementById("hamburgerMenu");
    
    if (window.innerWidth <= 768 && sidebar && hamburger) {
      if (sidebar.classList.contains("show") && 
          !sidebar.contains(e.target) && 
          e.target !== hamburger && 
          !hamburger.contains(e.target)) {
        sidebar.classList.remove("show");
      }
    }
  });

  // Setup keyboard event listeners for focusing on input field
  document.addEventListener('keydown', function(e) {
    // If a key a-zA-Z0-9 is pressed and not in an input field, focus on chat message input
    const key = e.key;
    const isAlphaNumeric = /^[a-zA-Z0-9]$/.test(key);
    const notInInput = !['INPUT', 'TEXTAREA', 'DIV'].includes(document.activeElement.tagName) || 
                       (document.activeElement.tagName === 'DIV' && document.activeElement.id !== 'chatMessage');
    const noModifiers = !(e.altKey || e.ctrlKey || e.metaKey || e.shiftKey);
    
    if (isAlphaNumeric && notInInput && noModifiers) {
      chatMessageElem.focus();
      
      // For contenteditable, we need to use selection and range
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(chatMessageElem);
      range.collapse(false); // Move to end
      selection.removeAllRanges();
      selection.addRange(range);
      
      // We don't add the typed character for contenteditable - it will happen naturally
      e.preventDefault();
    }
  });

  function initEventListeners() {
    // Send message button
    sendBtnElem.addEventListener("click", handleSendMessage);
    
    // Clear history button
    clearHistoryBtn.addEventListener("click", clearAllHistory);
    
    // Parallel responses button
    parallelBtn.addEventListener("click", getParallelResponses);
    
    // New chat button
    document.getElementById("newChatBtn").addEventListener("click", createNewChat);
    
    // Export chat button
    document.getElementById("exportChatBtn").addEventListener("click", exportCurrentChat);
    
    // Import chat button
    document.getElementById("importChatBtn").addEventListener("click", function() {
      document.getElementById("importChatInput").click();
    });
    
    // Import chat file input
    document.getElementById("importChatInput").addEventListener("change", importChat);
    
    // Refresh models button
    document.getElementById("refreshModelsBtn").addEventListener("click", fetchModels);
    
    // Model select change handler
    modelSelectElem.addEventListener("change", function() {
      if (currentChatId && chats[currentChatId]) {
        // Update current chat's model
        chats[currentChatId].modelName = this.value;
        updateModelIndicator();
        saveChatsToLocalStorage();
      }
    });
    
    // Image upload button
    const imageUploadBtn = document.getElementById("imageUploadBtn");
    const imageFileInput = document.getElementById("imageFileInput");
    
    imageUploadBtn.addEventListener("click", function() {
      imageFileInput.click();
    });
    
    imageFileInput.addEventListener("change", function(e) {
      if (this.files && this.files.length > 0) {
        handleFiles(this.files);
      }
    });
    
    // Setup form submission
    document.getElementById("chatForm").addEventListener("submit", function(e) {
      e.preventDefault();
      // Prevent double submissions by disabling the send button temporarily
      const sendBtn = document.getElementById("sendBtn");
      if (sendBtn.disabled) return;
      
      sendBtn.disabled = true;
      setTimeout(() => { sendBtn.disabled = false; }, 500);
      
      handleSendMessage();
    });

    // Setup drag and drop for images
    setupDragAndDrop();

    // Handle contenteditable div for chat input
    chatMessageElem.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      } else {
        adjustInputHeight();
      }
    });
    
    // Handle input and resize
    chatMessageElem.addEventListener('input', adjustInputHeight);
    
    // Initialize with single line height
    setTimeout(() => {
      adjustInputHeight();
    }, 0);
  }

  function setupDragAndDrop() {
    // Create drag area if it doesn't exist
    let dragArea = document.createElement('div');
    dragArea.className = 'drag-area';
    dragArea.innerHTML = '<div class="drag-area-content"><i class="fas fa-cloud-upload-alt"></i><p>Drop images here</p></div>';
    chatOutputElem.parentNode.insertBefore(dragArea, chatOutputElem);

    // Prevent default behavior to allow drop
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      appContainer.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
      e.preventDefault();
      e.stopPropagation();
    }

    // Use a debounced approach to reduce drag event frequency
    let dragTimeout;
    
    // Highlight drop area when item is dragged over
    ['dragenter', 'dragover'].forEach(eventName => {
      appContainer.addEventListener(eventName, function(e) {
        clearTimeout(dragTimeout);
        
        // Only respond to image files
        if (e.dataTransfer && e.dataTransfer.items) {
          let hasImageFile = false;
          for (let i = 0; i < e.dataTransfer.items.length; i++) {
            if (e.dataTransfer.items[i].kind === 'file' && 
                e.dataTransfer.items[i].type.startsWith('image/')) {
              hasImageFile = true;
              break;
            }
          }
          if (hasImageFile) {
            dragArea.classList.add('active');
          }
        }
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      appContainer.addEventListener(eventName, function() {
        dragTimeout = setTimeout(() => {
          dragArea.classList.remove('active');
        }, 50);
      }, false);
    });

    // Handle dropped files
    appContainer.addEventListener('drop', handleDrop, false);

    function handleDrop(e) {
      const dt = e.dataTransfer;
      const files = dt.files;
      
      handleFiles(files);
    }
  }
  
  function handleFiles(files) {
    if (files.length > 0) {
      console.log("Processing files:", files.length);
      
      // Clear previous image attachments
      imageAttachments = [];
      
      // Process only image files
      const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
      console.log("Image files found:", imageFiles.length);
      
      if (imageFiles.length === 0) return;
      
      // Generate a placeholder for user bubble
      const imageCount = imageFiles.length;
      const imagePlaceholderText = `[${imageCount} image${imageCount > 1 ? 's' : ''} attached]`;
      
      // Create a temporary container to show images
      const tempPreviewContainer = document.createElement('div');
      tempPreviewContainer.className = 'temp-image-preview';
      tempPreviewContainer.style.cssText = 'margin: 10px 0; padding: 10px; border-radius: 8px; background-color: #f8f9fa; max-width: 100%;';
      
      const imagePreviewsDiv = document.createElement('div');
      imagePreviewsDiv.className = 'image-previews';
      tempPreviewContainer.appendChild(imagePreviewsDiv);
      
      const infoText = document.createElement('div');
      infoText.style.cssText = 'margin-top: 5px; font-size: 14px; color: #6c757d;';
      infoText.textContent = 'Images will be sent with your next message';
      tempPreviewContainer.appendChild(infoText);
      
      // Add to input area before chat form
      const chatForm = document.getElementById('chatForm');
      chatForm.parentNode.insertBefore(tempPreviewContainer, chatForm);
      
      // Process each image file
      let filesProcessed = 0;
      
      imageFiles.forEach(file => {
        const reader = new FileReader();
        reader.onload = function(e) {
          const img = new Image();
          img.onload = function() {
            // Limit image dimensions to max 30px per side
            let width = img.width;
            let height = img.height;
            
            if (width > 30) {
              height = Math.floor(height * (30 / width));
              width = 30;
            }
            
            if (height > 30) {
              width = Math.floor(width * (30 / height));
              height = 30;
            }
            
            // Create canvas to resize the image
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            // Get resized image data
            const resizedImage = canvas.toDataURL(file.type);
            
          imageAttachments.push({
              data: resizedImage,
              type: file.type
            });
            
            console.log("Image processed, total attachments:", imageAttachments.length);
            
            // Create preview image with original dimensions for display
            const imgPreview = document.createElement('img');
            imgPreview.src = resizedImage;
            imgPreview.alt = 'User uploaded image';
            imgPreview.style.maxWidth = '30px';
            imgPreview.style.maxHeight = '30px';
            imagePreviewsDiv.appendChild(imgPreview);
          
          filesProcessed++;
          if (filesProcessed === imageFiles.length) {
              chatMessageElem.placeholder = `Type a message with ${imageCount} image${imageCount > 1 ? 's' : ''}...`;
              console.log("All images processed, ready to send");
          }
        };
          img.src = e.target.result;
        };
        reader.readAsDataURL(file);
      });
    }
  }

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
          const models = data.data.map(model => model.id);
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


  function loadChatHistory() {
    try {
      const savedChats = localStorage.getItem('chatHistory');
      if (savedChats) {
        const loadedChats = JSON.parse(savedChats);
        
        // Filter out any empty chats
        const nonEmptyChats = {};
        Object.keys(loadedChats).forEach(chatId => {
          if (loadedChats[chatId].messages && loadedChats[chatId].messages.length > 0) {
            nonEmptyChats[chatId] = loadedChats[chatId];
          }
        });
        
        chats = nonEmptyChats;
        updateChatHistoryList();
        
        // Load most recent chat if exists
        const chatIds = Object.keys(chats);
        if (chatIds.length > 0) {
          loadChat(chatIds[chatIds.length - 1]);
        } else {
          createNewChat();
        }
      } else {
        createNewChat();
      }
    } catch (e) {
      console.error('Error loading chat history:', e);
      createNewChat();
    }
  }

  function updateChatHistoryList() {
    chatHistoryListElem.innerHTML = '';
    
    // Sort chats by timestamp (newest first)
    const sortedChatIds = Object.keys(chats).sort((a, b) => {
      return new Date(chats[b].timestamp) - new Date(chats[a].timestamp);
    });
    
    sortedChatIds.forEach(chatId => {
      const chat = chats[chatId];
      const chatItem = document.createElement('div');
      chatItem.className = 'chat-history-item';
      if (chatId === currentChatId) {
        chatItem.classList.add('active');
      }
      
      // Get first message or use default title
      let chatTitle = 'New Chat';
      if (chat.messages.length > 0) {
        const firstUserMsg = chat.messages.find(msg => msg.role === 'user');
        if (firstUserMsg) {
          chatTitle = firstUserMsg.content.slice(0, 30) + (firstUserMsg.content.length > 30 ? '...' : '');
        }
      }
      
      const dateStr = new Date(chat.timestamp).toLocaleString();
      
      chatItem.innerHTML = `
        <div class="chat-item-content">
          <p>${chatTitle}</p>
          <div class="timestamp">${dateStr}</div>
        </div>
        <button class="delete-chat-btn" title="Delete this chat">
          <i class="fas fa-trash"></i>
        </button>
      `;
      
      chatItem.addEventListener('click', (e) => {
        // Only load chat if not clicking the delete button
        if (!e.target.closest('.delete-chat-btn')) {
          loadChat(chatId);
        }
      });

      // Add delete button handler
      const deleteBtn = chatItem.querySelector('.delete-chat-btn');
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent chat loading
        if (confirm('Are you sure you want to delete this chat?')) {
          deleteChat(chatId);
        }
      });
      
      chatHistoryListElem.appendChild(chatItem);
    });
  }

  function deleteChat(chatId) {
    // Remove chat from storage
    delete chats[chatId];
    
    // If we're deleting the current chat, create a new one
    if (chatId === currentChatId) {
      createNewChat();
    }
    
    // Save changes and update UI
    saveChatsToLocalStorage();
    updateChatHistoryList();
  }

  function createNewChat() {
    // Check if current chat is empty
    if (currentChatId && chats[currentChatId] && chats[currentChatId].messages.length === 0) {
      // Current chat is empty, just focus on input field
      chatMessageElem.focus();
      return currentChatId;
    }
    
    const chatId = 'chat_' + Date.now();
    currentChatId = chatId;
    
    chats[chatId] = {
      id: chatId,
      timestamp: new Date().toISOString(),
      dateCreated: new Date().toISOString(),
      modelName: modelSelectElem.value || "",
      messages: []
    };
        
    updateChatHistoryList();
    chatOutputElem.innerHTML = '';
    
    // Show model indicator for the new chat
    updateModelIndicator();
    
    imageAttachments = [];
    
    // Reset input
    chatMessageElem.innerHTML = "";
    adjustInputHeight();
    
    // Focus on input field
    chatMessageElem.focus();
    
    return chatId;
  }

  function loadChat(chatId) {
    if (chats[chatId]) {
      currentChatId = chatId;
      chatOutputElem.innerHTML = '';
      
      // Show model name at top of chat
      updateModelIndicator();
      
      // Display all messages in the chat
      chats[chatId].messages.forEach(message => {
        if (message.role === 'user') {
          // Check if message is an object or has image placeholder
          const hasImages = typeof message.content === 'string' && message.content.includes('[') && message.content.includes('image');
          generateUserChatBubble(message.content, hasImages);
        } else if (message.role === 'assistant') {
          const aiMessageElem = generateAIChatBubble();
          renderMarkdownWithLatex(aiMessageElem, message.content);
        }
      });
      
      // Update active state in history list
      updateChatHistoryList();
      
      // Reset input height
      chatMessageElem.innerHTML = "";
      adjustInputHeight();
      
      // Update model selector to match the chat's model if it exists
      if (chats[chatId].modelName) {
        // First check if the model exists in the dropdown
        const modelExists = Array.from(modelSelectElem.options).some(option => option.value === chats[chatId].modelName);
        if (modelExists) {
          modelSelectElem.value = chats[chatId].modelName;
        }
      }
    }
  }

  // Update model indicator with current model
  function updateModelIndicator() {
    // Remove any existing model indicator
    const existingIndicator = chatOutputElem.querySelector('.model-indicator');
    if (existingIndicator) {
      existingIndicator.remove();
    }
    
    if (!currentChatId) return;
    
    // Get model name and create indicator
    const modelName = getModelNameForChat(chats[currentChatId]);
    const modelIndicator = document.createElement('div');
    modelIndicator.className = 'model-indicator';
    modelIndicator.textContent = `Model: ${modelName}`;
    
    // Add to beginning of chat
    if (chatOutputElem.firstChild) {
      chatOutputElem.insertBefore(modelIndicator, chatOutputElem.firstChild);
    } else {
      chatOutputElem.appendChild(modelIndicator);
    }
  }

  function saveChatsToLocalStorage() {
    // Save chats without image data to local storage
    const chatsToSave = {};
    
    Object.keys(chats).forEach(chatId => {
      const chat = chats[chatId];
      
      // Skip empty chats (ones with no messages)
      if (!chat.messages || chat.messages.length === 0) {
        return;
      }
      
      chatsToSave[chatId] = {
        ...chat,
        // Filter out image data from messages but keep other properties
        messages: chat.messages.map(msg => ({
          role: msg.role,
          content: msg.content,
          model: msg.model // Keep model info
        }))
      };
    });
    
    localStorage.setItem('chatHistory', JSON.stringify(chatsToSave));
  }

  function clearAllHistory() {
    if (confirm('Are you sure you want to delete all chat history? This cannot be undone.')) {
      localStorage.removeItem('chatHistory');
      chats = {};
      createNewChat();
    }
  }

  function handleSendMessage() {
    // Get message from contenteditable div instead of textarea
    const message = chatMessageElem.innerHTML.trim();
    if (!message && imageAttachments.length === 0) return;
    
    // Check if there are parallel responses in progress
    if (document.querySelector('.parallel-container')) {
      window.selectResponse(0);
      return; // Return as selection will trigger a new message
    }
    
    // Check if a chat is active, if not create a new one
    if (!currentChatId) {
      currentChatId = createNewChat();
    }
    
    // Get the selected model
    const selectedModel = modelSelectElem.value;
    
    // If no model is selected, alert the user
    if (!selectedModel) {
      alert("Please select a model first.");
      return;
    }
    
    // Update the chat's model name
    chats[currentChatId].modelName = selectedModel;
    updateModelIndicator();
    
    // Convert <div><br></div> to proper line breaks before display
    const processedMessage = message.replace(/<div><br><\/div>/g, '\n').replace(/<div>/g, '\n').replace(/<br>/g, '\n').replace(/<\/div>/g, '');
    const textMessage = processedMessage.replace(/<[^>]*>/g, '');
    
    // Add the user message to chat
    generateUserChatBubble(textMessage, imageAttachments.length > 0);
    
    // Clear the input field
    chatMessageElem.innerHTML = "";
    // Reset height to default
    adjustInputHeight();
    
    // Add the message to the chat history
    chats[currentChatId].messages.push({ role: 'user', content: textMessage.trim() });
    chats[currentChatId].timestamp = new Date().toISOString();
    
    // Save chats to localStorage
    saveChatsToLocalStorage();
    
    // Add/update the chat in the history list
    updateChatHistoryList();
    
    // Create AI response message and save the element
    const aiMessageElem = generateAIChatBubble();
    
    // Scroll to the bottom of the chat
    chatOutputElem.scrollTop = chatOutputElem.scrollHeight;

    // Send the message to the API and process the response
    sendMessage(textMessage, selectedModel, function() { return aiMessageElem; });
    
    // Clear any image attachments
    imageAttachments = [];
    
    // Remove temporary preview container if it exists
    const tempPreviewContainer = document.querySelector('.temp-image-preview');
    if (tempPreviewContainer) {
      tempPreviewContainer.remove();
    }
  }

  function generateUserChatBubble(message, withImages = false) {
    // Create container
    const container = document.createElement('div');
    container.className = 'container user-container';
    
    // If we have images, add them
    if (withImages) {
      const imagePreviewsDiv = document.createElement('div');
      imagePreviewsDiv.className = 'image-previews';
      
      // If we have current image attachments, show them
      if (imageAttachments.length > 0) {
        // Add each image from current attachments
        imageAttachments.forEach(img => {
          const imgElement = document.createElement('img');
          imgElement.src = img.data;
          imgElement.alt = 'User uploaded image';
          imagePreviewsDiv.appendChild(imgElement);
        });
      } 
      // If we have lastSentImages, use them (for newly sent messages)
      else if (lastSentImages.length > 0) {
        // Add each image from last sent
        lastSentImages.forEach(img => {
          const imgElement = document.createElement('img');
          imgElement.src = img.data;
          imgElement.alt = 'User uploaded image';
          imagePreviewsDiv.appendChild(imgElement);
        });
        // Clear lastSentImages after using them
        lastSentImages = [];
      }
      
      container.appendChild(imagePreviewsDiv);
    }
    
    // Add text content if there's any message
    if (message) {
      let messageText = message;
      
      // Handle array/object content (from OpenAI vision API format)
      if (typeof message === 'object') {
        if (Array.isArray(message)) {
          // Extract text content from array
          messageText = message.find(item => item.type === 'text')?.text || '';
        } else {
          // Extract text from object
          messageText = message.content || message.text || '';
        }
      }
      
      // Convert to string if needed
      messageText = String(messageText);
      
      // Remove image placeholders from display text
      const cleanMessage = messageText.replace(/\[\d+ images? attached\]/g, '').trim();
      
      if (cleanMessage) {
        // Split message by newlines and create paragraphs for each line
        const lines = cleanMessage.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.trim() || i < lines.length - 1) {  // Display empty lines except last one
            const paragraph = document.createElement('p');
            paragraph.textContent = line;
            container.appendChild(paragraph);
          }
        }
      }
    }
    
    // Add to chat output
    chatOutputElem.appendChild(container);
    chatOutputElem.scrollTop = chatOutputElem.scrollHeight;
    
    // Remove any temporary image preview
    const tempPreview = document.querySelector('.temp-image-preview');
    if (tempPreview) {
      tempPreview.remove();
    }
  }

  function generateUserImagePreview(imageData) {
    // Add the image preview to the chat
    chatOutputElem.innerHTML += `
      <div class="container user-container">
        <img src="${imageData}" alt="User uploaded image" style="max-width: 100%; max-height: 300px;">
      </div>
    `;
    chatOutputElem.scrollTop = chatOutputElem.scrollHeight;
    
    // Don't add image data to chat history - we handle this in handleSendMessage with placeholders
  }

  function generateAIChatBubble() {
    const container = document.createElement('div');
    container.className = 'container darker';
    chatOutputElem.appendChild(container);
    chatOutputElem.scrollTop = chatOutputElem.scrollHeight;
    return container;
  }

  // Function to render markdown, LaTeX, and highlight code
  function renderMarkdownWithLatex(element, text) {
    // First render markdown
    element.innerHTML = marked.parse(text);
    
    // Then render LaTeX in the resulting HTML
    renderMathInCurrentElement(element);
    
    // Then highlight code blocks
    if (window.Prism) {
      Prism.highlightAllUnder(element);
    }
  }
  
  // Function to render LaTeX in an element
  function renderMathInCurrentElement(element) {
    if (window.renderMathInElement) {
      try {
        window.renderMathInElement(element, window.katexOptions || {
          delimiters: [
            {left: '$$', right: '$$', display: true},
            {left: '$', right: '$', display: false},
            {left: '\\(', right: '\\)', display: false},
            {left: '\\[', right: '\\]', display: true}
          ],
          throwOnError: false
        });
      } catch (e) {
        console.warn("Error rendering LaTeX:", e);
      }
    }
  }

  async function sendMessage(message, model, onSuccessCallback, isParallelRequest = false) {
    if (typeof onSuccessCallback !== 'function') {
      console.error("onSuccessCallback is not a function", onSuccessCallback);
      return;
    }

    // Stop any ongoing streaming
    if (currentReader) {
      try {
        await currentReader.cancel();
        currentReader = null;
      } catch (e) {
        console.error("Error canceling reader:", e);
      }
    }

    // Create message body
    const currentMessages = [...chats[currentChatId].messages.filter(msg => !msg.isParallel)];
    const messageBody = {
      model: model,
      messages: currentMessages,
      stream: true,
    };
    
    // Add images if present
    if (imageAttachments.length > 0 && !isParallelRequest) {
      messageBody.messages[messageBody.messages.length - 1].content = [
        { type: "text", text: message.trim() },
        ...imageAttachments.map(img => ({
          type: "image_url",
          image_url: {
            url: img.data,
            detail: "auto"
          }
        }))
      ];
    }

    try {
      const response = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messageBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`API Error: ${response.status} ${response.statusText}`, errorText);
        
        // Create error message with retry button
        const errorContainer = document.createElement('div');
        errorContainer.className = 'error-message';
        errorContainer.innerHTML = `
          <div class="error-content">
            <p>Error: ${response.status} ${response.statusText}</p>
            <p class="error-details">${errorText}</p>
            <button class="retry-btn">Retry</button>
          </div>
        `;
        
        // Add retry button handler
        const retryBtn = errorContainer.querySelector('.retry-btn');
        retryBtn.addEventListener('click', () => {
          errorContainer.remove();
          sendMessage(message, model, onSuccessCallback, isParallelRequest);
        });
        
        // Add error message to chat
        chatOutputElem.appendChild(errorContainer);
        return; // Return early without sending the message
      }

      const reader = response.body.getReader();
      currentReader = reader;
      const decoder = new TextDecoder("utf-8");
      
      // Call onSuccessCallback to get the message element 
      const aiMessageElem = onSuccessCallback();
      if (!aiMessageElem) {
        throw new Error("onSuccessCallback did not return a valid element");
      }
      currentResponse = aiMessageElem;
  
      let accumulatedText = "";
      let buffer = "";
      let lastRenderTime = 0;
      const renderDebounceTime = 150; // ms - increased to reduce flickering
      
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
  
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop();
  
        for (const chunk of chunks) {
          if (!chunk.startsWith("data:")) continue;
          
          const data = chunk.slice(5).trim();
          if (data === "[DONE]") break;
          
          try {
            const parsed = JSON.parse(data);
            if (parsed?.choices?.[0]?.delta?.content) {
              const partialText = parsed.choices[0].delta.content;
              accumulatedText += partialText;
              
              // Debounce rendering to avoid excessive DOM updates
              const now = Date.now();
              if (now - lastRenderTime > renderDebounceTime) {
                // Just do basic markdown during streaming for performance
                aiMessageElem.innerHTML = marked.parse(accumulatedText);
                lastRenderTime = now;
              }
            }
          } catch (error) {
            console.error("Error parsing streaming response:", error, data);
          }
        }
      }
      
      // Final render with complete text and full rendering
      renderMarkdownWithLatex(aiMessageElem, accumulatedText);
      
      // Handle completed response
      if (isParallelRequest) {
        parallelResponses.push({ 
          text: accumulatedText,
          element: aiMessageElem
        });
        
        if (parallelResponses.length === 2) {
          addPreferenceButtons();
        }
      } else {
        // Store model used with the message
        chats[currentChatId].messages.push({ 
          role: 'assistant', 
          content: accumulatedText,
          model: model 
        });
        
        // Store model name for the chat
        chats[currentChatId].modelName = model;
        
        saveChatsToLocalStorage();
        updateChatHistoryList();
      }
      
    } catch (error) {
      console.error("API request error:", error);
      
      // Only call if it's a function
      const aiMessageElem = onSuccessCallback();
      if (aiMessageElem) {
        const errorMessage = `Error: Could not get a response from the API. ${error.message}`;
        renderMarkdownWithLatex(aiMessageElem, errorMessage);
        
        if (isParallelRequest) {
          parallelResponses.push({ text: errorMessage, element: aiMessageElem });
          if (parallelResponses.length === 2) addPreferenceButtons();
        } else {
          chats[currentChatId].messages.push({ role: 'assistant', content: errorMessage });
          saveChatsToLocalStorage();
          updateChatHistoryList();
        }
      }
    } finally {
      currentReader = null;
      currentResponse = null;
    }
  }

  async function getParallelResponses() {
    // Get message from contenteditable div with HTML
    const message = chatMessageElem.innerHTML.trim();
    if (!message) return;
    
    // Process message to preserve line breaks
    const processedMessage = message.replace(/<div><br><\/div>/g, '\n').replace(/<div>/g, '\n').replace(/<br>/g, '\n').replace(/<\/div>/g, '');
    const textMessage = processedMessage.replace(/<[^>]*>/g, '');
    
    // Check if a chat is active, if not create a new one
    if (!currentChatId) {
      currentChatId = createNewChat();
    }
    
    // Get the selected model
    const selectedModel = modelSelectElem.value;
    
    // Early return if no model is selected
    if (!selectedModel) {
      alert("Please select a model first.");
      return;
    }
    
    // Update the model name
    chats[currentChatId].modelName = selectedModel;
    updateModelIndicator();
    
    // If there are already parallel responses in progress, select the first one
    const existingParallelContainer = document.querySelector('.parallel-container');
    if (existingParallelContainer) {
      window.selectResponse(0);
      return;
    }
    
    // Add the user message to chat
    generateUserChatBubble(textMessage);
    chatMessageElem.innerHTML = "";
    adjustInputHeight();
    
    // Save to chat history
    chats[currentChatId].messages.push({ role: 'user', content: textMessage.trim() });
    chats[currentChatId].timestamp = new Date().toISOString();
    saveChatsToLocalStorage();
    updateChatHistoryList();
    
    // Clear any existing parallel responses
    parallelResponses = [];
    
    try {
      // Create a container for parallel responses
      const parallelContainer = document.createElement('div');
      parallelContainer.className = 'parallel-container';
      chatOutputElem.appendChild(parallelContainer);
      
      // Create two response elements
      const responseElem1 = document.createElement('div');
      responseElem1.className = 'parallel-response';
      responseElem1.innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div>';
      
      const responseElem2 = document.createElement('div');
      responseElem2.className = 'parallel-response';
      responseElem2.innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div>';
      
      // Add them to the container
      parallelContainer.appendChild(responseElem1);
      parallelContainer.appendChild(responseElem2);
      
      // Add preference buttons right away
      addPreferenceButtons();
      
      // Expose select response function globally
      window.selectResponse = function(index) {
        const containers = document.querySelectorAll('.parallel-response');
        if (containers.length >= 2) {
          // Get content from the selected response
          const selectedContainer = containers[index];
          const messageElem = selectedContainer.querySelector('div:not(.preference-btn-container):not(.loading-dots)');
          
          if (messageElem) {
            // If we have content, use it
            const responseText = messageElem.innerHTML;
            selectParallelResponse(index, document.querySelector('.parallel-container'), responseText);
          } else if (parallelResponses[index] && parallelResponses[index].text) {
            // If content is being streamed, use the current text
            selectParallelResponse(index, document.querySelector('.parallel-container'), parallelResponses[index].text);
          } else {
            // Fallback to empty response
            selectParallelResponse(index, document.querySelector('.parallel-container'), "...");
          }
        }
      };
      
      // Function to create AI message element for parallel response
      const createParallelResponseElement = (container) => {
        // Remove loading indicator
        const loadingDots = container.querySelector('.loading-dots');
        if (loadingDots) {
          loadingDots.remove();
        }
        
        const elem = document.createElement('div');
        container.insertBefore(elem, container.querySelector('.preference-btn-container'));
        return elem;
      };
      
      // Make two parallel API calls
      await Promise.all([
        sendMessage(textMessage, selectedModel, 
          () => createParallelResponseElement(responseElem1), 
          true),
        sendMessage(textMessage, selectedModel, 
          () => createParallelResponseElement(responseElem2), 
          true)
      ]);
      
      // Scroll to see responses
      chatOutputElem.scrollTop = chatOutputElem.scrollHeight;
      
    } catch (error) {
      console.error("Error generating parallel responses:", error);
    }
  }

  function addPreferenceButtons() {
    // Find the parallel container
    const parallelContainer = document.querySelector('.parallel-container');
    if (!parallelContainer) {
      console.error("No parallel container found");
      return;
    }
    
    // Get the parallel responses directly from the DOM
    const responseElements = parallelContainer.querySelectorAll('.parallel-response');
    if (responseElements.length !== 2) {
      console.error("Expected 2 parallel responses, found", responseElements.length);
      return;
    }

    // Check if buttons already exist
    if (responseElements[0].querySelector('.preference-btn-container')) {
      return; // Buttons already added
    }
    
    // Add preference button to each response container
    responseElements.forEach((responseElem, index) => {
      // Create button container for each response
      const btnContainer = document.createElement('div');
      btnContainer.className = 'preference-btn-container';
      btnContainer.style.marginTop = '10px';
      btnContainer.style.textAlign = 'center';
      
      // Create the preference button
      const btn = document.createElement('button');
      btn.className = 'preference-btn';
      btn.textContent = 'I prefer this response';
      btn.onclick = function() {
        window.selectResponse(index);
      };
      
      btnContainer.appendChild(btn);
      responseElem.appendChild(btnContainer);
    });
  }

  function selectParallelResponse(index, parallelContainer, responseText) {
    console.log("Selecting response:", index);
    
    // Add chosen response to chat history
    chats[currentChatId].messages.push({ 
      role: 'assistant', 
      content: responseText,
      model: modelSelectElem.value // Store model used
    });
    saveChatsToLocalStorage();
    
    // Create a standalone response with the chosen content
    const container = document.createElement('div');
    container.className = 'container darker';
    renderMarkdownWithLatex(container, responseText);
    
    // Remove the parallel container and replace with the chosen response
    if (parallelContainer && parallelContainer.parentNode) {
      parallelContainer.parentNode.replaceChild(container, parallelContainer);
    } else {
      console.error("Could not replace parallel container");
    }
    
    // Clear parallel responses
    parallelResponses = [];
    
    // Scroll to see the chosen response
    chatOutputElem.scrollTop = chatOutputElem.scrollHeight;
  }

  // Export current chat as JSON file
  function exportCurrentChat() {
    if (!currentChatId || !chats[currentChatId]) {
      alert("No chat selected or chat is empty");
      return;
    }
    
    const chat = chats[currentChatId];
    
    // Check if the chat is empty (no messages)
    if (!chat.messages || chat.messages.length === 0) {
      return; // Do nothing if chat history is empty
    }
    
    // Get the first user message for title
    let title = "Untitled Chat";
    if (chat.messages && chat.messages.length > 0) {
      const firstUserMsg = chat.messages.find(msg => msg.role === 'user');
      if (firstUserMsg) {
        title = firstUserMsg.content.slice(0, 30) + (firstUserMsg.content.length > 30 ? '...' : '');
      }
    }
    
    // Get current timestamp for filename
    const timestamp = new Date().toISOString().split('T')[0];
    
    // Create export data with required fields
    const exportData = {
      title: title,
      dateCreated: chat.dateCreated || new Date().toISOString(),
      modelName: chat.modelName || modelSelectElem.value || "Unknown model",
      messages: chat.messages || []
    };
    
    // Convert to JSON string
    const dataStr = JSON.stringify(exportData, null, 2);
    
    // Create a safe filename (handle title safely)
    let safeTitle = "chat";
    try {
      safeTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    } catch (e) {
      console.warn("Error creating safe title:", e);
    }
    
    const exportFileDefaultName = `${safeTitle}_${timestamp}.json`;
    
    // Create a temporary link element and trigger download
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr));
    linkElement.setAttribute('download', exportFileDefaultName);
    document.body.appendChild(linkElement);
    linkElement.click();
    document.body.removeChild(linkElement);
  }
  
  // Get model name for a chat
  function getModelNameForChat(chat) {
    // If chat has a stored modelName, use it
    if (chat.modelName) {
      return chat.modelName;
    }
    
    // Try to get model name from first assistant message
    if (chat.messages && chat.messages.length > 0) {
      // Check if any message has model info
      for (const msg of chat.messages) {
        if (msg.model) {
          return msg.model;
        }
      }
    }
    
    // Fallback to current model selection
    return modelSelectElem.value || "Unknown model";
  }
  
  // Import chat from JSON file
  function importChat(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    
    reader.onload = function(e) {
      try {
        const importedData = JSON.parse(e.target.result);
        
        // Validate required fields
        if (!importedData.messages || !Array.isArray(importedData.messages)) {
          throw new Error("Invalid chat file format: missing messages array");
        }
        
        // Generate a new chat ID
        const newChatId = 'chat_' + Date.now();
        
        // Get title from first user message if not provided
        let title = importedData.title;
        if (!title && importedData.messages.length > 0) {
          const firstUserMsg = importedData.messages.find(msg => msg.role === 'user');
          if (firstUserMsg) {
            title = firstUserMsg.content.slice(0, 30) + (firstUserMsg.content.length > 30 ? '...' : '');
          }
        }
        
        // Ensure valid date or use current date
        let dateCreated;
        try {
          dateCreated = importedData.dateCreated ? new Date(importedData.dateCreated).toISOString() : new Date().toISOString();
        } catch (e) {
          console.warn("Invalid date format in imported chat, using current date");
          dateCreated = new Date().toISOString();
        }
        
        // Create the new chat object
        chats[newChatId] = {
          id: newChatId,
          title: title || "Imported Chat",
          dateCreated: dateCreated,
          modelName: importedData.modelName || modelSelectElem.value || "Unknown model",
          timestamp: new Date().toISOString(),
          messages: importedData.messages
        };
        
        // Save to local storage
        saveChatsToLocalStorage();
        
        // Update the chat history list
        updateChatHistoryList();
        
        // Load the imported chat
        loadChat(newChatId);
        
        // Reset the file input
        event.target.value = '';
        
      } catch (error) {
        console.error("Error importing chat:", error);
        alert("Failed to import chat: " + error.message);
        event.target.value = '';
      }
    };
    
    reader.readAsText(file);
  }

  // Function to adjust input height
  function adjustInputHeight() {
    // Get the input element
    const input = document.getElementById('chatMessage');
    
    // Reset any inline height first
    input.style.height = 'auto';
    
    // Set height based on scrollHeight, with min and max constraints
    const newHeight = Math.min(Math.max(input.scrollHeight, 25), 150);
    input.style.height = newHeight + 'px';
    
    // Also adjust the container height if needed
    const wrapper = input.closest('.message-input-wrapper');
    if (wrapper) {
      wrapper.style.height = 'auto';
    }
  }

  // Get message text from contenteditable div
  function getMessageText() {
    return chatMessageElem.innerText.trim();
  }

  // Clear message input
  function clearMessageInput() {
    chatMessageElem.innerHTML = '';
    setTimeout(adjustInputHeight, 0);
  }
};
