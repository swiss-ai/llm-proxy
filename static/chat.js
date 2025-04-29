// window.onload = function () {
  const BASE_URL = "https://fmapi.swissai.cscs.ch"; // OFFLINETEST
  // const BASE_URL = "https://api.openai.com/v1"; // OFFLINETEST

  // Model management module
  const modelManager = {
    availableModels: [],
    
    // Fetch models from API
    fetchModels: function(callback) {      
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
            this.availableModels = data.data.map(model => model.id);
            
            // Update center model select if it exists
            this.updateCenterModelUI();
            
            // Pass models to callback if provided
            if (typeof callback === 'function') {
              callback(this.availableModels);
            }
          } else {
            alert("No models available.");
            disableInputWithMessage("No models available. Please try again later.");
          }
        })
        .catch(error => {
          alert("Error fetching models from the API.");
          console.error(error);
          disableInputWithMessage("Error fetching models. Please try again later.");
        });
    },
    
    // Update center model UI with available models
    updateCenterModelUI: function() {
      const centerModelSelect = document.getElementById('centerModelSelect');
      
      if (centerModelSelect) {
        const previousCenterValue = centerModelSelect.value;
        centerModelSelect.innerHTML = this.availableModels
          .map(model => `<option value="${model}">${model}</option>`)
          .join("");
        
        // Restore previous selection if possible
        if (previousCenterValue && this.availableModels.includes(previousCenterValue)) {
          centerModelSelect.value = previousCenterValue;
        } else if (this.availableModels.length > 0) {
          // Set first available model if previous selection not available
          centerModelSelect.value = this.availableModels[0];
          currentModel = this.availableModels[0];
        }
      }
    },
    
    // Check if a model is available
    isModelAvailable: function(modelName) {
      return this.availableModels.includes(modelName);
    }
  };

  // DOM Elements
  const sendBtnElem = document.getElementById("sendBtn");
  const chatMessageElem = document.getElementById("chatMessage");
  const chatOutputElem = document.getElementById("chatOutput");
  const clearHistoryBtn = document.getElementById("clearHistoryBtn");
  const chatHistoryListElem = document.getElementById("chatHistoryList");
  const appContainer = document.getElementById("appContainer");

  // State variables
  let chats = {}; // All chat conversations stored by ID
  let currentChatId = null; // Currently active chat ID
  let imageAttachments = []; // Current image attachments
  let lastSentImages = []; // Store a copy of sent images for better UX
  let currentReader = null; // To track the current streaming reader
  let currentModel = ""; // Current model for the active chat
  
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
  modelManager.fetchModels();  // OFFLINETEST
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
    
    // Check if user is not already focused on an input element
    const activeElement = document.activeElement;
    const notInInput = 
      !['INPUT', 'TEXTAREA'].includes(activeElement.tagName) && 
      !(activeElement.tagName === 'DIV' && activeElement.getAttribute('contenteditable') === 'true');
    
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
      
      // Add the typed character to the contenteditable div
      const character = e.key;
      document.execCommand('insertText', false, character);
      
      // Prevent the default action to avoid double characters
      e.preventDefault();
    }
  });

  function initEventListeners() {
    // Send message button
    sendBtnElem.addEventListener("click", handleSendMessage);
    
    // Clear history button
    clearHistoryBtn.addEventListener("click", clearAllHistory);
    
    // New chat button
    document.getElementById("newChatBtn").addEventListener("click", showModelSelection);
    
    // Export chat button
    document.getElementById("exportChatBtn").addEventListener("click", exportCurrentChat);
    
    // Import chat button
    document.getElementById("importChatBtn").addEventListener("click", function() {
      document.getElementById("importChatInput").click();
    });
    
    // Import chat file input
    document.getElementById("importChatInput").addEventListener("change", importChat);
       
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
      // Check for Enter (without shift) or Ctrl+Enter
      if ((e.key === 'Enter' && !e.shiftKey) || (e.key === 'Enter' && e.ctrlKey)) {
        e.preventDefault();
        e.stopPropagation();
        handleSendMessage();
      }
    });
    
    // Handle paste event to strip HTML formatting
    chatMessageElem.addEventListener('paste', function(e) {
      // Prevent the default paste behavior
      e.preventDefault();
      
      // Get plain text from clipboard
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');
      
      // Insert plain text at cursor position
      document.execCommand('insertText', false, text);
    });
    
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
            // Add image to attachments
            imageAttachments.push({
              data: e.target.result,
              type: file.type
            });
            
            console.log("Image processed, total attachments:", imageAttachments.length);
            
            // Create preview image for display
            const imgPreview = document.createElement('img');
            imgPreview.src = e.target.result;
            imgPreview.alt = 'User uploaded image';
            imgPreview.className = 'image-preview';
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
          
          // Update center model select if it exists
          const centerModelSelect = document.getElementById('centerModelSelect');
          if (centerModelSelect) {
            const previousCenterValue = centerModelSelect.value;
            centerModelSelect.innerHTML = models
              .map(model => `<option value="${model}">${model}</option>`)
              .join("");
            
            // Restore previous selection if possible
            if (previousCenterValue && models.includes(previousCenterValue)) {
              centerModelSelect.value = previousCenterValue;
            }
          }
        } else {
          alert("No models available.");
          disableInputWithMessage("No models available. Please try again later.");
        }
      })
      .catch(error => {
        alert("Error fetching models from the API.");
        console.error(error);
        disableInputWithMessage("Error fetching models. Please try again later.");
      });
  }

  // Function to disable input with a message
  // can be improved!
  function disableInputWithMessage(message) {
    const inputContainer = document.querySelector('.input-container');
    
    // Add disabled class to container
    inputContainer.classList.add('disabled');
    
    // Set message text
    chatMessageElem.setAttribute("contenteditable", "false");
    chatMessageElem.innerHTML = message;
    
    // Add overlay to block interaction (replaces individual disabling)
    const overlay = document.createElement('div');
    overlay.className = 'input-overlay';
    overlay.style.cssText = 'position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.1); display: flex; align-items: center; justify-content: center; z-index: 10; cursor: not-allowed;';
    inputContainer.appendChild(overlay);
  }

  // Function to enable input
  // can be improved!
  function enableInput() {
    const inputContainer = document.querySelector('.input-container');
    // Remove disabled class
    inputContainer.classList.remove('disabled');
    
    // Enable input
    chatMessageElem.setAttribute("contenteditable", "true");
    chatMessageElem.innerHTML = "";
    
    // Remove overlay
    const overlay = inputContainer.querySelector('.input-overlay');
    if (overlay) {
      overlay.remove();
    }
  }

  function loadChatHistory() {
    try {
      const savedChats = localStorage.getItem('chatHistory');
      if (!savedChats) {
        createNewChat();
        return;
      }
    
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
      if (chat.messages && chat.messages.length > 0) {
        const firstUserMsg = chat.messages.find(msg => msg.role === 'user');
        if (firstUserMsg) {
          chatTitle = firstUserMsg.content.slice(0, 30) + (firstUserMsg.content.length > 30 ? '...' : '');
        }
      }
      
      // Format date in shorter format - just month and day
      const date = new Date(chat.timestamp);
      const dateStr = date.toLocaleString('en-US', { 
        month: 'short', 
        day: 'numeric'
      });
      
      // Include model name in chat item
      const modelName = chat.modelName || '';
      
      chatItem.innerHTML = `
        <div class="chat-item-content">
          <p>${chatTitle}</p>
          <div class="chat-item-info">
            <span class="model-name">${modelName}</span>
            <span class="timestamp">${dateStr}</span>
          </div>
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

  // Function to show model selection without creating a new chat
  function showModelSelection() {
    // Refresh models 
    modelManager.fetchModels(() => {
      // Clear chat area
      chatOutputElem.innerHTML = '';
      
      // Create centered model selection UI
      createCenteredModelUI();
      
      // Create a new chat ID
      createNewChat();
      
      // Enable input
      enableInput();
      
      // Focus on input field
      chatMessageElem.focus();
    });
  }

  function createNewChat() {
    const chatId = 'chat_' + Date.now();
    currentChatId = chatId;
    
    chats[chatId] = {
      id: chatId,
      timestamp: new Date().toISOString(),
      dateCreated: new Date().toISOString(),
      modelName: currentModel || "",
      messages: []
    };
    
    // Update chat history list (will mark current chat as active)
    updateChatHistoryList();
    
    return chatId;
  }

  function loadChat(chatId) {
    if (chats[chatId]) {
      // First, cancel any ongoing streaming
      if (currentReader) {
        try {
          // Use cancel without await since this is not an async function
          currentReader.cancel();
          currentReader = null;
          currentResponse = null;
        } catch (e) {
          console.error("Error canceling reader:", e);
        }
      }
      
      // Set current chat ID and clear output
      currentChatId = chatId;
      chatOutputElem.innerHTML = '';
      
      // Fetch latest models to check if the chat model is available
      modelManager.fetchModels(() => {
        // Only show model indicator if chat has messages
        if (chats[chatId].messages && chats[chatId].messages.length > 0) {
          updateModelIndicator(true); // Force display
        }
        
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
        
        // Reset input
        chatMessageElem.innerHTML = "";
        
        // Check if the model exists in the available models
        let modelIsAvailable = false;
        if (chats[chatId].modelName) {
          modelIsAvailable = modelManager.isModelAvailable(chats[chatId].modelName);
          if (modelIsAvailable) {
            currentModel = chats[chatId].modelName;
          }
        }
        
        // If chat has no messages, show model selection UI instead of model indicator
        if (!chats[chatId].messages || chats[chatId].messages.length === 0) {
          createCenteredModelUI();
          enableInput();
        } else if (!modelIsAvailable && chats[chatId].modelName) {
          // Model is unavailable and chat has messages
          disableInputWithMessage(`The model "${chats[chatId].modelName}" is currently unavailable. You can start a new chat.`);
        } else {
          // Model is available and chat has messages
          enableInput();
        }
      });
    }
  }

  // Function to create centered model UI
  function createCenteredModelUI() {
    // Create centered model selection UI
    const modelSelectionContainer = document.createElement('div');
    modelSelectionContainer.className = 'centered-model-ui';
    modelSelectionContainer.id = 'centeredModelUI';
    
    const modelHeader = document.createElement('h2');
    modelHeader.textContent = 'Select a Model';
    modelSelectionContainer.appendChild(modelHeader);
    
    // Clone the model selector for center display
    const modelSelectorClone = document.createElement('div');
    modelSelectorClone.className = 'model-selector';
    
    const modelDropdownClone = document.createElement('div');
    modelDropdownClone.className = 'custom-dropdown';
    
    const selectElem = document.createElement('select');
    selectElem.id = 'centerModelSelect';
    
    // Add models from modelManager
    modelManager.availableModels.forEach(model => {
      const option = document.createElement('option');
      option.value = model;
      option.text = model;
      selectElem.appendChild(option);
    });
    
    // Add change event listener to update currentModel
    selectElem.addEventListener('change', function() {
      currentModel = this.value;
    });
    
    modelDropdownClone.appendChild(selectElem);
    modelSelectorClone.appendChild(modelDropdownClone);
    modelSelectionContainer.appendChild(modelSelectorClone);
    
    chatOutputElem.appendChild(modelSelectionContainer);
  }

  // Update model indicator with current model
  function updateModelIndicator(forceDisplay = false) {
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
    
    // Force display if parameter is true or if chat has messages
    if (forceDisplay || (chats[currentChatId].messages && chats[currentChatId].messages.length > 0)) {
      modelIndicator.style.display = 'inline-block';
    }
    
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
          content: msg.content
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

  async function sendMessage(message, model, onSuccessCallback) {
    if (typeof onSuccessCallback !== 'function') {
      console.error("onSuccessCallback is not a function", onSuccessCallback);
      return;
    }

    // Stop any ongoing streaming and completely reset the connection
    if (currentReader) {
      try {
        await currentReader.cancel();
        currentReader = null;
        // Also reset the current response element to prevent continuation
        currentResponse = null;
      } catch (e) {
        console.error("Error canceling reader:", e);
      }
    }

    // Update the chat's model at the top level instead of per message
    chats[currentChatId].modelName = model;
    currentModel = model;

    // Create message body
    const currentMessages = [...chats[currentChatId].messages];
    const messageBody = {
      model: model,
      messages: currentMessages,
      stream: true,
    };
    
    // Add images if present
    if (imageAttachments.length > 0) {
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
          sendMessage(message, model, onSuccessCallback);
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
      
      // Store assistant message (without model)
      chats[currentChatId].messages.push({ 
        role: 'assistant', 
        content: accumulatedText
      });
      
      // Save to local storage to ensure message order is preserved when returning to chat
      saveChatsToLocalStorage();
      updateChatHistoryList();
      
    } catch (error) {
      console.error("API request error:", error);
      
      // Only call if it's a function
      const aiMessageElem = onSuccessCallback();
      if (aiMessageElem) {
        const errorMessage = `Error: Could not get a response from the API. ${error.message}`;
        renderMarkdownWithLatex(aiMessageElem, errorMessage);
        
        chats[currentChatId].messages.push({ role: 'assistant', content: errorMessage });
        saveChatsToLocalStorage();
        updateChatHistoryList();
      }
    } finally {
      currentReader = null;
      currentResponse = null;
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
      
      // // Convert to string if needed
      // messageText = String(messageText);
      
      // // Remove image placeholders from display text
      // const cleanMessage = messageText.replace(/\[\d+ images? attached\]/g, '').trim();
      const cleanMessage = String(messageText);
      

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

  // Get model name for a chat
  function getModelNameForChat(chat) {
    if (!chat) return "Unknown";
    
    // Return the chat's model name
    return chat.modelName || "Unknown";
  }
  
  // Import chat from JSON file
  function importChat(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const chatData = JSON.parse(e.target.result);
        
        // Validate imported chat structure
        if (!chatData.messages || !Array.isArray(chatData.messages)) {
          throw new Error("Invalid chat format: missing messages array");
        }
        
        if (chatData.messages.length === 0) {
          throw new Error("Chat has no messages");
        }
        
        if (!chatData.messages.every(msg => msg.role && msg.content)) {
          throw new Error("Invalid message format in imported chat");
        }
        
        // Check if the model is available
        const modelName = chatData.modelName || "";
        let modelAvailable = true;
        
        if (modelName && !modelManager.isModelAvailable(modelName)) {
          if (!confirm(`The model "${modelName}" may not be available. Import anyway?`)) {
            return;
          }
          modelAvailable = false;
        }
        
        // Create a new chat entry with only the necessary message data
        const chatId = 'chat_' + Date.now();
        chats[chatId] = {
          id: chatId,
          timestamp: new Date().toISOString(),
          dateCreated: chatData.dateCreated || new Date().toISOString(),
          modelName: modelName,
          messages: chatData.messages.map(msg => ({
            role: msg.role,
            content: msg.content
          }))
        };
        
        // Save to local storage and update UI
        saveChatsToLocalStorage();
        updateChatHistoryList();
        
        // Load the imported chat
        loadChat(chatId);
        
        // If model isn't available, show warning
        if (!modelAvailable) {
          disableInputWithMessage(`The model "${modelName}" is currently unavailable. You can start a new chat.`);
        }
        
        alert("Chat imported successfully!");
        
      } catch (error) {
        console.error("Error importing chat:", error);
        alert(`Error importing chat: ${error.message}`);
      }
      
      // Reset the file input
      event.target.value = "";
    };
    reader.readAsText(file);
  }

  // Get message text from contenteditable div
  function getMessageText() {
    // Handle div with HTML content (strip HTML and keep text)
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = chatMessageElem.innerHTML;
    return tempDiv.textContent.trim();
  }

  // Clear message input
  function clearMessageInput() {
    chatMessageElem.innerHTML = "";
  }

  function handleSendMessage() {
    // Get message from contenteditable div instead of textarea
    const message = chatMessageElem.innerHTML.trim();
    const textMessage = getMessageText();
    
    if (!textMessage && imageAttachments.length === 0) return;
    
    // Get the selected model from the center UI or use current model
    const centerModelSelect = document.getElementById('centerModelSelect');
    let selectedModel = currentModel;
    
    if (centerModelSelect) {
      selectedModel = centerModelSelect.value;
      currentModel = selectedModel;  // Update current model right away
    }
    
    // If no model is selected, alert the user
    if (!selectedModel) {
      alert("Please select a model first.");
      return;
    }
    
    // Check if the selected model is available
    if (!modelManager.isModelAvailable(selectedModel)) {
      alert(`The model "${selectedModel}" is currently unavailable. Please select another model.`);
      return;
    }
    
    // Create a new chat if needed
    if (!currentChatId || !chats[currentChatId]) {
      createNewChat();
    }
    
    // Remove the centered model UI if it exists
    const centeredUI = document.getElementById('centeredModelUI');
    if (centeredUI) {
      centeredUI.remove();
    }
    
    // Update model indicator and make it visible
    updateModelIndicator(true); 
    
    // Create user bubble with message
    generateUserChatBubble(textMessage, imageAttachments.length > 0);
    
    // Prepare message content (either string or structured content with images)
    let messageContent = textMessage;
    
    // Save sent images for reference
    lastSentImages = [...imageAttachments];
    
    // Create AI response bubble
    const aiMessageElem = generateAIChatBubble();
    
    // Store user message in chat history
    chats[currentChatId].messages.push({ 
      role: 'user', 
      content: messageContent
    });
    
    // Update chat timestamp
    chats[currentChatId].timestamp = new Date().toISOString();
    
    // Save to local storage
    saveChatsToLocalStorage();
    
    // Update chat history list to show latest message
    updateChatHistoryList();
    
    // Send to API
    sendMessage(messageContent, selectedModel, () => {
      return aiMessageElem;
    });
    
    // Clear message input and image attachments
    clearMessageInput();
    imageAttachments = [];
  }
