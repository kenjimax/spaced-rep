// Import Claude API functions
import {
    generateCardsWithClaude,
    analyzeTextWithClaude,
    getStoredApiKeys,
    storeApiKeys,
    validateAnthropicApiKey,
    hasApiKeys
} from './claude-api.js';

// Import AnkiConnect client
import {
    checkConnection as ankiCheckConnection,
    requestPermission as ankiRequestPermission,
    getDeckNames as ankiGetDeckNames,
    getModelNames as ankiGetModelNames,
    getModelFieldNames as ankiGetModelFieldNames,
    addNotes as ankiAddNotes,
    sync as ankiSync
} from './anki-connect.js';

// Quill.js is loaded globally from CDN

document.addEventListener('DOMContentLoaded', () => {
    // Settings Modal
    const apiKeyModal = document.getElementById('apiKeyModal');
    const settingsButton = document.getElementById('settingsButton');
    const anthropicApiKeyInput = document.getElementById('anthropicApiKey');
    const storeLocallyCheckbox = document.getElementById('storeLocallyCheckbox');
    const apiKeySaveButton = document.getElementById('apiKeySave');
    const apiKeyCancelButton = document.getElementById('apiKeyCancel');
    const anthropicApiKeyError = document.getElementById('anthropicApiKeyError');
    const ankiStatusEl = document.getElementById('ankiStatus');
    const ankiReconnectButton = document.getElementById('ankiReconnect');

    // Dropdown Menu
    const menuButton = document.getElementById('menuButton');
    const dropdownMenu = document.getElementById('dropdown-menu');

    // Toggle dropdown menu when menu button is clicked
    menuButton.addEventListener('click', () => {
        const expanded = menuButton.getAttribute('aria-expanded') === 'true';

        if (expanded) {
            dropdownMenu.classList.remove('show');
            menuButton.setAttribute('aria-expanded', 'false');
        } else {
            dropdownMenu.classList.add('show');
            menuButton.setAttribute('aria-expanded', 'true');
        }
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (event) => {
        if (!menuButton.contains(event.target) && !dropdownMenu.contains(event.target)) {
            dropdownMenu.classList.remove('show');
            menuButton.setAttribute('aria-expanded', 'false');
        }
    });

    // Check for stored API keys on startup
    const storedKeys = getStoredApiKeys();
    if (storedKeys.anthropicApiKey) {
        anthropicApiKeyInput.value = storedKeys.anthropicApiKey;
    } else {
        showApiKeyModal();
    }

    // Check Anki connection on startup
    refreshAnkiStatus();

    // Settings button opens the modal
    settingsButton.addEventListener('click', showApiKeyModal);

    // Reconnect button
    ankiReconnectButton.addEventListener('click', refreshAnkiStatus);

    // Save button in settings modal
    apiKeySaveButton.addEventListener('click', async () => {
        const anthropicKey = anthropicApiKeyInput.value.trim();
        const storeLocally = storeLocallyCheckbox.checked;

        if (!validateAnthropicApiKey(anthropicKey)) {
            anthropicApiKeyError.textContent = 'Required: Enter a valid Claude API key (starts with sk-ant-)';
            anthropicApiKeyInput.focus();
            return;
        }

        const saveSuccess = storeApiKeys(anthropicKey, storeLocally);

        if (saveSuccess) {
            apiKeyModal.style.display = 'none';
            updateUiForAnki();
            showNotification('Settings saved', 'success');
        } else {
            showNotification('Failed to save settings', 'error');
        }
    });

    // Cancel button in settings modal
    apiKeyCancelButton.addEventListener('click', () => {
        const storedKeys = getStoredApiKeys();
        if (storedKeys.anthropicApiKey) {
            apiKeyModal.style.display = 'none';
        } else {
            if (confirm('Without a Claude API key, you won\'t be able to generate flashcards. Continue without it?')) {
                apiKeyModal.style.display = 'none';
            }
        }
    });

    function showApiKeyModal() {
        anthropicApiKeyError.textContent = '';
        const storedKeys = getStoredApiKeys();
        if (storedKeys.anthropicApiKey) {
            anthropicApiKeyInput.value = storedKeys.anthropicApiKey;
        }
        refreshAnkiStatus();
        apiKeyModal.style.display = 'flex';
    }

    async function refreshAnkiStatus() {
        ankiStatusEl.textContent = 'Checking...';
        ankiStatusEl.className = 'anki-status disconnected';
        hideAnkiCorsHelp();

        // First try requestPermission (AnkiConnect 6.30+), which prompts the
        // user inside Anki to grant access for this origin.
        let connected = await ankiCheckConnection();

        if (!connected) {
            // Try requestPermission in case AnkiConnect is running but blocking this origin
            const granted = await ankiRequestPermission();
            if (granted) {
                connected = await ankiCheckConnection();
            }
        }

        state.ankiConnected = connected;
        if (connected) {
            ankiStatusEl.textContent = 'Connected';
            ankiStatusEl.className = 'anki-status connected';
            // Load decks and models
            try {
                const [decks, models] = await Promise.all([
                    ankiGetDeckNames(),
                    ankiGetModelNames()
                ]);
                state.ankiDecks = decks.filter(d => d !== 'Default');
                state.ankiModels = models;
                if (state.ankiModels.length > 0 && !state.currentModel) {
                    state.currentModel = state.ankiModels.includes('Basic') ? 'Basic' : state.ankiModels[0];
                }
            } catch (err) {
                console.error('Error loading Anki data:', err);
            }
        } else {
            ankiStatusEl.textContent = 'Disconnected';
            ankiStatusEl.className = 'anki-status disconnected';
            showAnkiCorsHelp();
        }
        updateUiForAnki();
    }

    function showAnkiCorsHelp() {
        if (document.getElementById('anki-cors-help')) return;
        const helpEl = document.createElement('div');
        helpEl.id = 'anki-cors-help';
        helpEl.className = 'api-key-help anki-cors-help';
        helpEl.innerHTML =
            '<strong>Can\'t connect?</strong> If Anki and AnkiConnect are running, you may need to allow this site in AnkiConnect\'s CORS settings:<br>' +
            '1. In Anki, go to <em>Tools > Add-ons > AnkiConnect > Config</em><br>' +
            '2. Add <code>"' + window.location.origin + '"</code> to the <code>webCorsOriginList</code> array (or set it to <code>["*"]</code>)<br>' +
            '3. Click OK, restart Anki, then click Reconnect above.';
        const container = ankiStatusEl.closest('.api-key-input-group');
        if (container) container.appendChild(helpEl);
    }

    function hideAnkiCorsHelp() {
        const el = document.getElementById('anki-cors-help');
        if (el) el.remove();
    }

    function updateUiForAnki() {
        const exportButton = document.getElementById('exportButton');
        if (state.ankiConnected) {
            exportButton.textContent = 'Export to Anki';
        } else {
            exportButton.textContent = 'Export as Markdown';
        }
    }

    // DOM Elements
    const textInput = document.getElementById('textInput');
    const generateButton = document.getElementById('generateButton');
    const cardsContainer = document.getElementById('cardsContainer');
    const exportButton = document.getElementById('exportButton');
    const clearCardsButton = document.getElementById('clearCardsButton');
    const splitterHandle = document.getElementById('splitterHandle');
    const editorPanel = document.getElementById('editorPanel');
    const outputPanel = document.getElementById('outputPanel');
    
    // App State
    const state = {
        cards: [],
        selectedText: '',
        currentDeck: null,
        decks: {},
        documentContext: '',
        isAnalyzing: false,
        fromPaste: false,
        editor: null,
        ankiConnected: false,
        ankiDecks: [],
        ankiModels: [],
        currentModel: null
    };

    // Set initial UI state for Anki
    updateUiForAnki();

    // Initialize Quill Editor
    function initQuillEditor() {
        try {
            // Configure Quill with the modules and formats we want
            const toolbarOptions = [
                [{ 'header': [1, 2, 3, false] }],
                ['bold', 'italic'],
                [{ 'list': 'ordered'}, { 'list': 'bullet' }]
            ];
            
            // Create a new Quill editor instance
            state.editor = new Quill('#textInput', {
                modules: {
                    toolbar: toolbarOptions
                },
                placeholder: 'Paste or type your text here, then highlight sections to generate cards...',
                theme: 'snow'
            });
            
            // Handle text change events
            state.editor.on('text-change', function() {
                // Clear any existing timeout
                if (textChangeTimeout) {
                    clearTimeout(textChangeTimeout);
                }
                
                // Set a new timeout to analyze text after typing stops
                textChangeTimeout = setTimeout(() => {
                    // Get text content from the editor
                    const fullText = state.editor.getText();
                    if (fullText.trim().length > 100 && !state.isAnalyzing) {
                        analyzeDocumentContext(fullText);
                    }
                }, 1500);
            });
            
            // Handle selection change events
            state.editor.on('selection-change', function(range) {
                if (range) {
                    if (range.length > 0) {
                        // We have a selection
                        const selectedText = state.editor.getText(range.index, range.length);
                        
                        // Store selected text in state
                        state.selectedText = selectedText.trim();
                        
                        // Enable generate button
                        generateButton.disabled = false;
                        
                        // Show visual indication
                        textInput.classList.add('has-selection');
                    } else {
                        // Cursor changed position but no selection
                        state.selectedText = '';
                        generateButton.disabled = true;
                        textInput.classList.remove('has-selection');
                    }
                } else {
                    // Editor lost focus
                    state.selectedText = '';
                    textInput.classList.remove('has-selection');
                }
            });
            
            console.log('Quill editor initialized');
        } catch (error) {
            console.error('Error initializing Quill editor:', error);
        }
    }
    
    // Handle selection for fallback editor
    function handleEditorSelection() {
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();
        
        // Store selected text in state
        state.selectedText = selectedText;
        
        // Enable/disable buttons based on selection
        const hasSelection = selectedText.length > 0;
        generateButton.disabled = !hasSelection;
        
        // Show a visual indication of selection
        if (hasSelection) {
            textInput.classList.add('has-selection');
        } else {
            textInput.classList.remove('has-selection');
        }
    }
    
    // Fetch decks from AnkiConnect
    async function fetchDecks() {
        try {
            const connected = await ankiCheckConnection();
            state.ankiConnected = connected;

            if (!connected) {
                state.decks = { "General": "general" };
                state.currentDeck = "General";
                updateUiForAnki();
                return;
            }

            const [decks, models] = await Promise.all([
                ankiGetDeckNames(),
                ankiGetModelNames()
            ]);

            state.ankiDecks = decks.filter(d => d !== 'Default');
            state.ankiModels = models;

            // Build decks map (name -> name for Anki, no IDs needed)
            state.decks = {};
            state.ankiDecks.forEach(d => { state.decks[d] = d; });
            if (Object.keys(state.decks).length === 0) {
                state.decks = { "Default": "Default" };
            }
            state.currentDeck = Object.keys(state.decks)[0];

            if (!state.currentModel) {
                state.currentModel = models.includes('Basic') ? 'Basic' : models[0];
            }

            updateUiForAnki();
        } catch (error) {
            console.error('Error fetching Anki decks:', error);
            state.decks = { "General": "general" };
            state.currentDeck = "General";
            createDeckSelector();
        }
    }
    
    // Function to show status notifications
    function showNotification(message, type = 'info', duration = 3000) {
        // Remove any existing notification
        const existingNotification = document.querySelector('.status-notification');
        if (existingNotification) {
            existingNotification.remove();
        }
        
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `status-notification ${type}`;
        
        // Add icon
        const icon = document.createElement('span');
        icon.className = 'icon';
        notification.appendChild(icon);
        
        // Add message
        const messageEl = document.createElement('span');
        messageEl.textContent = message;
        notification.appendChild(messageEl);
        
        // Add to document
        document.body.appendChild(notification);
        
        // Show notification with animation
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        // Hide after duration
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, duration);
        
        return notification;
    }
    
    // Event Listeners
    generateButton.addEventListener('click', generateCardsFromSelection);
    exportButton.addEventListener('click', exportToAnki);
    clearCardsButton.addEventListener('click', clearAllCards);
    
    // Initialize Quill editor
    let textChangeTimeout = null;
    try {
        // Initialize the Quill editor
        initQuillEditor();
        
        // Quill handles paste events automatically
        // We'll analyze text after paste in the text-change handler
    } catch (error) {
        console.error('Failed to initialize Quill editor, falling back to basic contenteditable', error);
        // Fallback to basic contenteditable if Quill fails
        textInput.setAttribute('contenteditable', 'true');
        textInput.setAttribute('placeholder', 'Paste or type your text here, then highlight sections to generate cards...');
        
        // Add basic event listeners
        textInput.addEventListener('mouseup', handleEditorSelection);
        textInput.addEventListener('keyup', handleEditorSelection);
        textInput.addEventListener('input', () => {
            // Clear any existing timeout
            if (textChangeTimeout) {
                clearTimeout(textChangeTimeout);
            }
            
            // Set a new timeout to analyze text after typing stops
            textChangeTimeout = setTimeout(() => {
                const fullText = textInput.textContent || '';
                if (fullText.trim().length > 100 && !state.isAnalyzing) {
                    analyzeDocumentContext(fullText);
                }
            }, 1500);
        });
        
        // Add plain text paste handler for fallback
        textInput.addEventListener('paste', async function(e) {
            // Prevent the default paste behavior
            e.preventDefault();
            
            // Get plain text from clipboard
            const text = e.clipboardData.getData('text/plain');
            
            // Insert it at the cursor position using the standard command
            document.execCommand('insertText', false, text);
            
            // If text is long enough, analyze it immediately
            if (text.length > 100) {
                state.fromPaste = true;
                await analyzeDocumentContext(text);
            }
        });
    }
    
    // Enable the button if there's already text in the selection (Quill handles this now)
    // handleTextSelection() is now replaced by Quill's selection-change event
    
    // Initialize UI and fetch decks
    updateButtonStates();
    
    // Fetch decks from Anki on startup
    fetchDecks().catch(error => {
        console.error('Error initializing decks:', error);
        createDeckSelector();
    });
    
    // We no longer need a deck selector in the main UI - we'll only show it when editing a card
    function createDeckSelector() {
        // Simply set the default current deck if none is set yet
        if (!state.currentDeck && Object.keys(state.decks).length > 0) {
            state.currentDeck = Object.keys(state.decks)[0];
        }
        // No UI elements to create here anymore
    }
    
    // Set up the resizable splitter
    let isResizing = false;
    let startY, startHeight;
    
    splitterHandle.addEventListener('mousedown', (e) => {
        isResizing = true;
        startY = e.clientY;
        startHeight = editorPanel.offsetHeight;
        
        document.documentElement.style.cursor = 'row-resize';
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', stopResize);
        e.preventDefault();
    });
    
    function handleMouseMove(e) {
        if (!isResizing) return;
        
        const container = document.querySelector('.dynamic-container');
        const containerHeight = container.offsetHeight;
        const deltaY = e.clientY - startY;
        const newEditorHeight = startHeight + deltaY;
        
        // Calculate editor height as percentage of container
        const editorHeightPercentage = (newEditorHeight / containerHeight) * 100;
        
        // Don't allow editor to be smaller than 20% or larger than 80% of container
        const minHeightPercentage = 20;
        const maxHeightPercentage = 80;
        
        if (editorHeightPercentage > minHeightPercentage && editorHeightPercentage < maxHeightPercentage) {
            // Use percentage for responsive sizing
            editorPanel.style.height = `${editorHeightPercentage}%`;
            
            // Calculate output panel height as the remaining percentage
            const outputHeightPercentage = 100 - editorHeightPercentage;
            outputPanel.style.height = `${outputHeightPercentage}%`;
        }
    }
    
    function stopResize() {
        if (isResizing) {
            isResizing = false;
            document.documentElement.style.cursor = '';
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', stopResize);
        }
    }
    
    // Prevent scrolling the page when mouse wheel is used over the text input
    textInput.addEventListener('wheel', function(e) {
        const contentHeight = this.scrollHeight;
        const visibleHeight = this.clientHeight;
        const scrollTop = this.scrollTop;
        
        // Check if we're at the top or bottom boundary
        const isAtTop = scrollTop === 0;
        const isAtBottom = scrollTop + visibleHeight >= contentHeight - 1;
        
        // If we're at a boundary and trying to scroll further in that direction, 
        // let the page scroll normally
        if ((isAtTop && e.deltaY < 0) || (isAtBottom && e.deltaY > 0)) {
            return;
        }
        
        // Otherwise, scroll the text input and prevent page scrolling
        e.preventDefault();
        this.scrollTop += e.deltaY;
    }, { passive: false });
    
    // Functions
    // Analyze text to extract context summary when text is pasted
    async function analyzeDocumentContext(text) {
        if (!text || text.trim().length < 100 || state.isAnalyzing) {
            return; // Skip short texts or if already analyzing
        }
        
        try {
            // Set analyzing state flag
            state.isAnalyzing = true;
            
            // Only disable the button if there's no selection
            if (!state.selectedText || state.selectedText.length === 0) {
                generateButton.disabled = true;
            }
            
            // Call Claude API to get document context
            const contextSummary = await analyzeTextWithClaude(text);
            
            if (contextSummary) {
                // Store in state for later use
                state.documentContext = contextSummary;
                
                // Show a subtle visual indicator that context is available
                document.body.classList.add('has-document-context');
                
                // Show a non-disruptive notification that analysis is complete
                showNotification('Text analysis complete. Card quality will be improved.', 'success', 4000);
            }
            
            state.fromPaste = false;
        } catch (error) {
            console.error('Error analyzing document:', error);
        } finally {
            // Reset analyzing state
            state.isAnalyzing = false;
            
            // Re-enable button if there's a selection
            const hasSelection = state.selectedText && state.selectedText.length > 0;
            generateButton.disabled = !hasSelection;
        }
    }
    
    // Function to clear all highlights - adapted for Quill
    function clearAllHighlights() {
        // Remove the selection class
        textInput.classList.remove('has-selection');
        
        // Clear any selection in Quill or fall back to window selection
        if (state.editor && state.editor.setSelection) {
            // Clear Quill selection
            state.editor.setSelection(null);
        } else {
            // Fallback to window selection
            window.getSelection().removeAllRanges();
        }
    }
    
    async function generateCardsFromSelection() {
        const selectedText = state.selectedText;
        
        if (!selectedText) {
            showNotification('Please select some text first.', 'error');
            return;
        }
        
        try {
            // Update UI to show processing state
            generateButton.disabled = true;
            generateButton.textContent = 'Generating...';
            
            // Get cards from Claude API
            const cards = await generateCardsWithClaude(
                selectedText,
                Object.keys(state.decks).join(', '),
                state.documentContext
            );
            
            // Add generated cards to state
            state.cards = [...state.cards, ...cards];
            
            // Update UI
            renderCards();
            updateButtonStates();
            
            showNotification(`${cards.length} cards created successfully`, 'success');
        } catch (error) {
            console.error('Error generating cards:', error);
            
            // Provide a more specific message for timeout errors
            if (error.message && error.message.includes('FUNCTION_INVOCATION_TIMEOUT')) {
                showNotification('The request timed out. Please select a smaller portion of text and try again.', 'error');
            } else if (error.message && error.message.includes('timed out')) {
                showNotification('The request timed out. Please select a smaller portion of text and try again.', 'error');
            } else {
                showNotification('Error generating cards: ' + (error.message || 'Please try again.'), 'error');
            }
        } finally {
            generateButton.disabled = false;
            generateButton.textContent = 'Create Cards';
        }
    }
    
    function renderCards() {
        cardsContainer.innerHTML = '';
        
        // Show or hide the cards section based on whether there are cards
        if (state.cards.length > 0) {
            // Show the output panel and splitter if they're hidden
            if (outputPanel.style.display === 'none') {
                // Show the splitter handle with animation
                splitterHandle.style.display = 'flex';
                splitterHandle.classList.add('animate-in');
                
                // Show the output panel
                outputPanel.style.display = 'flex';
                
                // Set the editor panel to 50% height
                editorPanel.style.height = '50%';
            }
            
            // Render each card
            state.cards.forEach((card, index) => {
                const cardElement = createCardElement(card, index);
                cardsContainer.appendChild(cardElement);
            });
        } else {
            // Hide the output panel and splitter if there are no cards
            splitterHandle.style.display = 'none';
            outputPanel.style.display = 'none';
            
            // Reset the editor panel to full height
            editorPanel.style.height = '100%';
        }
    }
    
    // renderQuestions function removed
    
    function createCardElement(card, index) {
        const cardDiv = document.createElement('div');
        cardDiv.className = 'card';
        
        // Sanitize the card data to ensure it's rendered properly
        const sanitizeHtml = (text) => {
            // Create a temporary div
            const tempDiv = document.createElement('div');
            // Set the text content (this escapes HTML)
            tempDiv.textContent = text;
            // Return the sanitized HTML
            return tempDiv.innerHTML;
        };
        
        // Ensure the content is properly formatted strings, not JSON objects
        const front = typeof card.front === 'string' ? sanitizeHtml(card.front) : sanitizeHtml(JSON.stringify(card.front));
        const back = typeof card.back === 'string' ? sanitizeHtml(card.back) : sanitizeHtml(JSON.stringify(card.back));
        const deck = typeof card.deck === 'string' ? sanitizeHtml(card.deck) : sanitizeHtml(JSON.stringify(card.deck));
        
        cardDiv.innerHTML = `
            <div class="card-header">
                <div class="card-header-left">
                    <span class="card-deck" title="Click to change deck">${deck}</span>
                </div>
                <div class="card-header-right">
                    <button class="delete-button" data-index="${index}" title="Delete Card">×</button>
                </div>
            </div>
            <div class="card-content">
                <div class="card-front">
                    <div class="card-text" contenteditable="true">${front}</div>
                </div>
                <div class="card-back">
                    <div class="card-text" contenteditable="true">${back}</div>
                </div>
            </div>
        `;
        
        // Add event listeners
        const deleteButton = cardDiv.querySelector('.delete-button');
        deleteButton.addEventListener('click', () => deleteCard(index));
        
        const deckLabel = cardDiv.querySelector('.card-deck');
        deckLabel.addEventListener('click', () => editCardDeck(index));
        
        // Make card content editable
        const frontText = cardDiv.querySelector('.card-front .card-text');
        const backText = cardDiv.querySelector('.card-back .card-text');
        
        frontText.addEventListener('blur', () => {
            // Get text content instead of innerHTML to avoid HTML injection
            state.cards[index].front = frontText.textContent;
        });
        
        backText.addEventListener('blur', () => {
            // Get text content instead of innerHTML to avoid HTML injection
            state.cards[index].back = backText.textContent;
        });
        
        return cardDiv;
    }
    
    // createQuestionElement function removed
    
    function deleteCard(index) {
        state.cards.splice(index, 1);
        renderCards();
        updateButtonStates();
    }
    
    // deleteQuestion function removed
    
    function editCardDeck(index) {
        const card = state.cards[index];
        const deckNames = Object.keys(state.decks);
        
        if (deckNames.length === 0) {
            showNotification('No decks available. Please check Anki connection.', 'error');
            return;
        }
        
        // Create an improved modal dialog with a dropdown
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'modal-overlay';
        
        const modalContent = document.createElement('div');
        modalContent.className = 'modal-content';
        
        const modalHeader = document.createElement('h3');
        modalHeader.textContent = 'Select Deck';
        
        const modalSubHeader = document.createElement('p');
        modalSubHeader.className = 'modal-subheader';
        modalSubHeader.textContent = 'Choose a deck for this card:';
        
        // Create a styled select element
        const selectContainer = document.createElement('div');
        selectContainer.className = 'modal-select-container';
        
        const deckSelect = document.createElement('select');
        deckSelect.className = 'deck-select';
        
        // Add a refresh button
        const refreshButton = document.createElement('button');
        refreshButton.className = 'modal-refresh-button';
        refreshButton.title = 'Refresh deck list from Anki';
        refreshButton.innerHTML = '↻';
        refreshButton.addEventListener('click', () => {
            refreshButton.disabled = true;
            
            fetchDecks().then(() => {
                // Update the select options
                deckSelect.innerHTML = '';
                const updatedDeckNames = Object.keys(state.decks).sort((a, b) => 
                    a.localeCompare(b, undefined, { sensitivity: 'base' })
                );
                
                updatedDeckNames.forEach(deckName => {
                    const option = document.createElement('option');
                    option.value = deckName;
                    option.textContent = deckName;
                    if (deckName === card.deck) {
                        option.selected = true;
                    }
                    deckSelect.appendChild(option);
                });
                
                // Show confirmation
                refreshButton.innerHTML = '✓';
                setTimeout(() => {
                    refreshButton.innerHTML = '↻';
                    refreshButton.disabled = false;
                }, 1500);
                
                showNotification(`${updatedDeckNames.length} decks loaded`, 'success');
            }).catch(error => {
                console.error('Error refreshing decks:', error);
                refreshButton.innerHTML = '✗';
                setTimeout(() => {
                    refreshButton.innerHTML = '↻';
                    refreshButton.disabled = false;
                }, 1500);
                
                showNotification('Failed to refresh decks', 'error');
            });
        });
        
        // Get deck names and sort them alphabetically
        const sortedDeckNames = deckNames.sort((a, b) => 
            a.localeCompare(b, undefined, { sensitivity: 'base' })
        );
        
        // Add options based on available decks
        sortedDeckNames.forEach(deckName => {
            const option = document.createElement('option');
            option.value = deckName;
            option.textContent = deckName;
            if (deckName === card.deck) {
                option.selected = true;
            }
            deckSelect.appendChild(option);
        });
        
        selectContainer.appendChild(deckSelect);
        selectContainer.appendChild(refreshButton);
        
        // Create button container
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'modal-buttons';
        
        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancel';
        cancelButton.className = 'modal-cancel';
        cancelButton.addEventListener('click', () => {
            document.body.removeChild(modalOverlay);
        });
        
        const saveButton = document.createElement('button');
        saveButton.textContent = 'Update Deck';
        saveButton.className = 'modal-save';
        saveButton.addEventListener('click', () => {
            const oldDeck = card.deck;
            card.deck = deckSelect.value;
            renderCards();
            document.body.removeChild(modalOverlay);
            
            if (oldDeck !== card.deck) {
                showNotification(`Card moved to "${card.deck}" deck`, 'success');
            }
        });
        
        buttonContainer.appendChild(cancelButton);
        buttonContainer.appendChild(saveButton);
        
        // Assemble the modal
        modalContent.appendChild(modalHeader);
        modalContent.appendChild(modalSubHeader);
        modalContent.appendChild(selectContainer);
        modalContent.appendChild(buttonContainer);
        
        modalOverlay.appendChild(modalContent);
        document.body.appendChild(modalOverlay);
    }
    
    function updateButtonStates() {
        // Update card-related buttons based on whether cards exist
        const hasCards = state.cards.length > 0;
        exportButton.disabled = !hasCards;
        clearCardsButton.disabled = !hasCards;
        
        // Update create cards button based on text selection
        const hasSelection = state.selectedText && state.selectedText.length > 0;
        generateButton.disabled = !hasSelection;
    }
    
    function clearAllCards() {
        // Simply clear all cards without confirmation
        state.cards = [];
        renderCards(); // This will hide the output panel and restore full height to editor
        updateButtonStates();
        showNotification('All cards cleared', 'info');
    }
    
    // clearAllQuestions function removed
    
    
    async function exportToAnki() {
        if (state.cards.length === 0) {
            showNotification('No cards to export', 'info');
            return;
        }

        // Check Anki connection
        const connected = await ankiCheckConnection();
        state.ankiConnected = connected;

        if (!connected) {
            showNotification('Anki not connected. Exporting as markdown instead.', 'info');
            exportAsMarkdown();
            return;
        }

        // Refresh deck/model list
        try {
            const [decks, models] = await Promise.all([
                ankiGetDeckNames(),
                ankiGetModelNames()
            ]);
            state.ankiDecks = decks.filter(d => d !== 'Default');
            state.ankiModels = models;
        } catch (err) {
            console.error('Error loading Anki data:', err);
            showNotification('Could not load Anki data. Exporting as markdown.', 'error');
            exportAsMarkdown();
            return;
        }

        // Show deck + note type selection modal
        showAnkiExportModal();
    }

    function resolveFieldMapping(fields) {
        const lower = fields.map(f => f.toLowerCase());
        let frontField = fields[0];
        let backField = fields.length > 1 ? fields[1] : fields[0];

        for (let i = 0; i < lower.length; i++) {
            if (lower[i] === 'front' || lower[i] === 'question') {
                frontField = fields[i];
            }
            if (lower[i] === 'back' || lower[i] === 'answer') {
                backField = fields[i];
            }
        }

        return { frontField, backField };
    }

    async function showAnkiExportModal() {
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'modal-overlay';

        const modalContent = document.createElement('div');
        modalContent.className = 'modal-content';

        const header = document.createElement('h3');
        header.textContent = 'Export to Anki';

        const form = document.createElement('div');
        form.className = 'anki-export-form';

        // Deck selector
        const deckLabel = document.createElement('label');
        deckLabel.textContent = 'Deck';
        const deckSelect = document.createElement('select');
        state.ankiDecks.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        state.ankiDecks.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d;
            opt.textContent = d;
            deckSelect.appendChild(opt);
        });
        if (state.currentDeck && state.ankiDecks.includes(state.currentDeck)) {
            deckSelect.value = state.currentDeck;
        }

        // Note type selector
        const modelLabel = document.createElement('label');
        modelLabel.textContent = 'Note Type';
        const modelSelect = document.createElement('select');
        state.ankiModels.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            modelSelect.appendChild(opt);
        });
        if (state.currentModel) {
            modelSelect.value = state.currentModel;
        }

        // Field mapping preview
        const mappingPreview = document.createElement('div');
        mappingPreview.className = 'field-mapping-preview';

        async function updateMappingPreview() {
            const modelName = modelSelect.value;
            try {
                const fields = await ankiGetModelFieldNames(modelName);
                const { frontField, backField } = resolveFieldMapping(fields);
                mappingPreview.innerHTML = '';

                const title = document.createElement('div');
                title.style.fontWeight = '600';
                title.style.marginBottom = '6px';
                title.textContent = 'Field Mapping';
                mappingPreview.appendChild(title);

                [['Card Front', frontField], ['Card Back', backField]].forEach(([src, tgt]) => {
                    const row = document.createElement('div');
                    row.className = 'mapping-row';
                    row.innerHTML = `<span class="mapping-source">${src}</span><span class="mapping-arrow">\u2192</span><span class="mapping-target">${tgt}</span>`;
                    mappingPreview.appendChild(row);
                });
            } catch (err) {
                mappingPreview.textContent = 'Could not load fields for this note type.';
            }
        }

        modelSelect.addEventListener('change', updateMappingPreview);
        await updateMappingPreview();

        // Card count
        const cardCount = document.createElement('p');
        cardCount.className = 'modal-subheader';
        cardCount.textContent = `${state.cards.length} card${state.cards.length !== 1 ? 's' : ''} will be exported.`;

        // Buttons
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'modal-buttons';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.className = 'modal-cancel';
        cancelBtn.addEventListener('click', () => document.body.removeChild(modalOverlay));

        const exportBtn = document.createElement('button');
        exportBtn.textContent = 'Export';
        exportBtn.className = 'modal-save';
        exportBtn.addEventListener('click', async () => {
            exportBtn.disabled = true;
            exportBtn.textContent = 'Exporting...';
            try {
                await performAnkiExport(deckSelect.value, modelSelect.value);
                document.body.removeChild(modalOverlay);
            } catch (err) {
                console.error('Anki export failed:', err);
                showNotification('Anki export failed: ' + err.message, 'error');
                exportBtn.disabled = false;
                exportBtn.textContent = 'Export';
            }
        });

        buttonContainer.appendChild(cancelBtn);
        buttonContainer.appendChild(exportBtn);

        form.appendChild(deckLabel);
        form.appendChild(deckSelect);
        form.appendChild(modelLabel);
        form.appendChild(modelSelect);
        form.appendChild(mappingPreview);
        form.appendChild(cardCount);

        modalContent.appendChild(header);
        modalContent.appendChild(form);
        modalContent.appendChild(buttonContainer);
        modalOverlay.appendChild(modalContent);
        document.body.appendChild(modalOverlay);
    }

    async function performAnkiExport(deckName, modelName) {
        const fields = await ankiGetModelFieldNames(modelName);
        const { frontField, backField } = resolveFieldMapping(fields);

        const notes = state.cards.map(card => ({
            deckName,
            modelName,
            fields: {
                [frontField]: card.front,
                [backField]: card.back
            },
            options: {
                allowDuplicate: false
            },
            tags: ['flashcard-generator']
        }));

        const results = await ankiAddNotes(notes);
        const successCount = results.filter(id => id !== null).length;
        const failCount = results.length - successCount;

        // Remember selections
        state.currentDeck = deckName;
        state.currentModel = modelName;

        // Trigger sync
        try {
            await ankiSync();
        } catch {
            // Sync failure is non-critical
        }

        if (failCount > 0) {
            showNotification(`${successCount} cards added, ${failCount} failed (possibly duplicates)`, 'info');
        } else {
            showNotification(`${successCount} cards added to Anki!`, 'success');
        }
    }
    
    function exportAsMarkdown() {
        if (state.cards.length === 0) {
            showNotification('No cards to export', 'info');
            return;
        }
        
        // Format cards as markdown
        let markdown = `# Flashcards - ${new Date().toLocaleDateString()}\n\n`;
        
        // Group cards by deck
        const deckGroups = {};
        
        state.cards.forEach(card => {
            const deckName = card.deck || 'General';
            if (!deckGroups[deckName]) {
                deckGroups[deckName] = [];
            }
            deckGroups[deckName].push(card);
        });
        
        // Add each deck's cards to the markdown
        for (const [deckName, cards] of Object.entries(deckGroups)) {
            markdown += `## ${deckName}\n\n`;
            
            cards.forEach((card, index) => {
                markdown += `### Card ${index + 1}\n\n`;
                markdown += `**Question:** ${card.front}\n\n`;
                markdown += `---\n\n`;
                markdown += `**Answer:** ${card.back}\n\n`;
            });
        }
        
        try {
            // Download the markdown file
            const blob = new Blob([markdown], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `flashcards-${new Date().toISOString().slice(0, 10)}.md`;
            a.style.display = 'none'; // Hide the element
            document.body.appendChild(a);
            a.click();
            
            // Cleanup
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);
            
            showNotification(`${state.cards.length} cards exported as markdown`, 'success');
        } catch (error) {
            console.error('Error exporting markdown:', error);
            
            // Alternative method for environments where the download might be blocked
            const textarea = document.createElement('textarea');
            textarea.value = markdown;
            document.body.appendChild(textarea);
            textarea.select();
            
            try {
                document.execCommand('copy');
                showNotification('Export copied to clipboard instead (download failed)', 'warning');
            } catch (clipboardError) {
                console.error('Clipboard copy failed:', clipboardError);
                showNotification('Export failed. Check console for markdown content', 'error');
                console.log('MARKDOWN CONTENT:');
                console.log(markdown);
            }
            
            document.body.removeChild(textarea);
        }
    }
    
    // exportQuestions function removed
    
    function downloadExport(data, filename) {
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 0);
    }
});
