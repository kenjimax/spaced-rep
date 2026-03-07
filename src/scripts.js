// Import Claude API functions
import { 
    generateCardsWithClaude, 
    analyzeTextWithClaude,
    getStoredApiKeys,
    storeApiKeys,
    validateAnthropicApiKey,
    hasApiKeys
} from './claude-api.js';

// Quill.js is loaded globally from CDN

document.addEventListener('DOMContentLoaded', () => {
    // API Key Management
    const apiKeyModal = document.getElementById('apiKeyModal');
    const settingsButton = document.getElementById('settingsButton');
    const anthropicApiKeyInput = document.getElementById('anthropicApiKey');
    const storeLocallyCheckbox = document.getElementById('storeLocallyCheckbox');
    const apiKeySaveButton = document.getElementById('apiKeySave');
    const apiKeyCancelButton = document.getElementById('apiKeyCancel');
    const anthropicApiKeyError = document.getElementById('anthropicApiKeyError');
    
    // Dropdown Menu
    const menuButton = document.getElementById('menuButton');
    const dropdownMenu = document.getElementById('dropdown-menu');
    
    // Toggle dropdown menu when menu button is clicked
    menuButton.addEventListener('click', () => {
        const expanded = menuButton.getAttribute('aria-expanded') === 'true';
        
        if (expanded) {
            // Close dropdown
            dropdownMenu.classList.remove('show');
            menuButton.setAttribute('aria-expanded', 'false');
        } else {
            // Open dropdown
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
        // Pre-fill the form with stored keys (masked)
        anthropicApiKeyInput.value = storedKeys.anthropicApiKey;
    } else {
        // Show API key modal on startup if no API keys are stored
        showApiKeyModal();
    }
    
    // Settings button opens the API key modal
    settingsButton.addEventListener('click', showApiKeyModal);
    
    // Save button in API key modal
    apiKeySaveButton.addEventListener('click', () => {
        const anthropicKey = anthropicApiKeyInput.value.trim();
        const storeLocally = storeLocallyCheckbox.checked;

        // Validate the Anthropic API key
        if (!validateAnthropicApiKey(anthropicKey)) {
            anthropicApiKeyError.textContent = 'Required: Enter a valid Claude API key (starts with sk-ant-)';
            anthropicApiKeyInput.focus();
            return;
        }

        // Store the API key
        const saveSuccess = storeApiKeys(anthropicKey, storeLocally);

        if (saveSuccess) {
            // Close the modal
            apiKeyModal.style.display = 'none';

            // Show success notification
            showNotification('API keys saved successfully', 'success');
        } else {
            // Show error notification
            showNotification('Failed to save API keys', 'error');
        }
    });
    
    // Cancel button in API key modal
    apiKeyCancelButton.addEventListener('click', () => {
        // If we have an Anthropic API key stored, just close the modal
        const storedKeys = getStoredApiKeys();
        if (storedKeys.anthropicApiKey) {
            apiKeyModal.style.display = 'none';
        } else {
            // Otherwise, show a warning specifically about the required Claude API key
            if (confirm('Without a Claude API key, you won\'t be able to generate flashcards. Do you want to continue without setting up the API key?')) {
                apiKeyModal.style.display = 'none';
            }
        }
    });
    
    function showApiKeyModal() {
        // Reset error message
        anthropicApiKeyError.textContent = '';

        // Fill in the form with stored values if available
        const storedKeys = getStoredApiKeys();
        if (storedKeys.anthropicApiKey) {
            anthropicApiKeyInput.value = storedKeys.anthropicApiKey;
        }

        // Show the modal
        apiKeyModal.style.display = 'flex';
    }
    
    function updateUiForApiKeys() {
        // No dynamic updates needed; export button is always "Export as Markdown"
    }
    
    // Call this on startup to set up the UI correctly
    updateUiForApiKeys();
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
        editor: null
    };
    
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
    
    // Initialize deck state with defaults
    function fetchDecks() {
        state.decks = { "General": "general" };
        state.currentDeck = "General";
        return Promise.resolve();
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
    exportButton.addEventListener('click', exportAsMarkdown);
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
    
    // Initialize deck state on startup
    fetchDecks().catch(error => {
        console.error('Error initializing decks:', error);
        // Create a fallback deck selector in case of error
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
            showNotification('No decks available.', 'error');
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
        refreshButton.title = 'Refresh deck list';
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
