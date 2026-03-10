/**
 * Client API for Flash Card Generator
 * 
 * Handles client-side API key management and server API requests
 */

// Local storage key for API key
const API_KEY_STORAGE_KEY = "flashcard_generator_api_key";
const LEGACY_STORAGE_KEY = "mochi_card_generator_api_keys";

/**
 * Retrieves stored API key from local storage
 * Migrates from old Mochi-era key if needed
 * @returns {Object} Object containing API key
 */
function getStoredApiKeys() {
  try {
    const storedData = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (storedData) {
      return JSON.parse(storedData);
    }
    // Migrate from old key format
    const legacyData = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyData) {
      const parsed = JSON.parse(legacyData);
      if (parsed.anthropicApiKey) {
        storeApiKeys(parsed.anthropicApiKey, true);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        return { anthropicApiKey: parsed.anthropicApiKey };
      }
    }
  } catch (error) {
    console.error('Error reading stored API key:', error);
  }
  return { anthropicApiKey: null };
}

/**
 * Stores API key in local storage
 * @param {string} anthropicApiKey - Claude API key
 * @param {boolean} storeLocally - Whether to store key locally
 * @returns {boolean} Success status
 */
function storeApiKeys(anthropicApiKey, storeLocally = true) {
  if (storeLocally) {
    try {
      localStorage.setItem(API_KEY_STORAGE_KEY, JSON.stringify({
        anthropicApiKey
      }));
      return true;
    } catch (error) {
      console.error('Error storing API key:', error);
      return false;
    }
  } else {
    try {
      localStorage.removeItem(API_KEY_STORAGE_KEY);
    } catch (error) {
      console.error('Error clearing API key:', error);
    }
    return true;
  }
}

/**
 * Validates format of Anthropic API key
 * @param {string} key - API key to validate
 * @returns {boolean} Whether key appears valid
 */
function validateAnthropicApiKey(key) {
  return key && key.startsWith('sk-ant-') && key.length > 20;
}

/**
 * Checks if API keys are configured
 * @returns {boolean} Whether keys are available
 */
function hasApiKeys() {
  const keys = getStoredApiKeys();
  return !!keys.anthropicApiKey;
}

/**
 * Helper function to truncate text to a reasonable size
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
function truncateText(text, maxLength = 8000) {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '... [truncated]';
}

/**
 * Parses Claude's response to extract structured card data
 * @param {Object} responseData - Raw response from Claude API
 * @returns {Array} Array of card objects
 */
function parseClaudeResponse(responseData) {
  let responseText = '';
  
  // Extract text content from response
  if (responseData.content && Array.isArray(responseData.content)) {
    for (const item of responseData.content) {
      if (item.type === 'text') {
        responseText += item.text;
      }
    }
  } else if (responseData.content && responseData.content[0] && responseData.content[0].text) {
    responseText = responseData.content[0].text;
  } else {
    console.warn('Unexpected response format from Claude API');
    responseText = JSON.stringify(responseData);
  }
  
  // Try to parse as JSON
  try {
    // First, extract JSON if it's embedded in other text
    const jsonMatch = responseText.match(/(\[\s*\{.*\}\s*\])/s);
    const jsonText = jsonMatch ? jsonMatch[1] : responseText;
    
    const parsedCards = JSON.parse(jsonText);
    console.log('Successfully parsed JSON cards:', parsedCards);
    
    if (Array.isArray(parsedCards) && parsedCards.length > 0) {
      const validCards = parsedCards.filter(card => card.front && card.back)
        .map(card => ({
          front: card.front,
          back: card.back,
          deck: card.deck || "General"
        }));
      
      if (validCards.length > 0) {
        console.log('Returning valid JSON cards:', validCards);
        return validCards;
      }
    }
    console.warn('Parsed JSON did not contain valid cards');
  } catch (error) {
    console.warn('Failed to parse response as JSON:', error);
    
    // Try searching for JSON inside the text (sometimes Claude wraps JSON in backticks or other text)
    try {
      const jsonRegex = /```(?:json)?\s*(\[\s*\{[\s\S]*?\}\s*\])\s*```/;
      const match = responseText.match(jsonRegex);
      if (match && match[1]) {
        const extractedJson = match[1];
        const parsedCards = JSON.parse(extractedJson);
        
        if (Array.isArray(parsedCards) && parsedCards.length > 0) {
          const validCards = parsedCards.filter(card => card.front && card.back)
            .map(card => ({
              front: card.front,
              back: card.back,
              deck: card.deck || "General"
            }));
          
          if (validCards.length > 0) {
            console.log('Returning valid JSON cards (extracted from code block):', validCards);
            return validCards;
          }
        }
      }
    } catch (innerError) {
      console.warn('Failed to extract JSON from code blocks:', innerError);
    }
  }
  
  // Fallback: If JSON parsing fails, create a basic fallback card
  console.warn('Could not parse any cards from Claude response, using fallback');
  return [{
    front: "What are the key concepts from this text?",
    back: responseText.length > 300 
      ? responseText.substring(0, 300) + "..." 
      : responseText,
    deck: "General"
  }];
}

/**
 * Analyzes text to extract key context information
 * Returns a concise summary of the document's main points and author
 * 
 * @param {string} text - The full text to analyze
 * @returns {Promise<string>} - Context summary
 */
async function analyzeTextWithClaude(text) {
  try {
    // Get stored API key
    const { anthropicApiKey } = getStoredApiKeys();
    
    // Check if we have an API key
    if (!anthropicApiKey) {
      throw new Error('No Claude API key available. Please add your API key in settings.');
    }
    
    // Call the server endpoint
    let response;
    try {
      response = await fetch('/api/analyze-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: truncateText(text, 10000),
          userApiKey: anthropicApiKey || null
        })
      });
    } catch (fetchError) {
      throw new Error(`Network error: Could not connect to the API server. ${fetchError.message}`);
    }

    // Read the response once as text
    const responseText = await response.text();
    
    if (!response.ok) {
      try {
        // Try to parse as JSON
        const errorData = JSON.parse(responseText);
        throw new Error(`API Error: ${errorData.error || 'Unknown server error'}`);
      } catch (e) {
        // If parsing fails, use the text directly
        throw new Error(`API Error: ${responseText.substring(0, 100)}`);
      }
    }

    // Parse the already-read text as JSON
    const data = JSON.parse(responseText);
    
    // Extract the context summary from Claude's response
    let contextSummary = '';
    if (data.content && Array.isArray(data.content)) {
      for (const item of data.content) {
        if (item.type === 'text') {
          contextSummary += item.text;
        }
      }
    }
    
    return contextSummary;
  } catch (error) {
    console.error('Error analyzing text:', error);
    
    // Provide more user-friendly error messages
    if (error.message.includes('No API key provided')) {
      throw new Error('Please add your Claude API key in the settings (gear icon).');
    } else if (error.message.includes('Network error')) {
      throw new Error('Connection to server failed. Please check your internet connection and try again.');
    }
    
    throw error;
  }
}

/**
 * Calls Claude API to generate flashcards from text
 * Uses server-side proxy with user-provided API key
 * 
 * @param {string} text - The highlighted text selection to create cards from
 * @param {string} deckOptions - Comma-separated list of available deck options
 * @param {string} textContext - Optional context summary for the document
 * @returns {Promise<Array>} - Array of card objects with front, back, and deck properties
 */
async function generateCardsWithClaude(text, deckOptions = '', textContext = '') {
  try {
    // Get stored API key
    const { anthropicApiKey } = getStoredApiKeys();
    
    // Check if we have an API key
    if (!anthropicApiKey) {
      throw new Error('No Claude API key available. Please add your API key in settings.');
    }
    
    // Call the server endpoint with timeout control
    let response;
    try {
      // Create an AbortController to handle timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second client-side timeout
      
      response = await fetch('/api/generate-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: truncateText(text),
          textContext,
          deckOptions,
          userApiKey: anthropicApiKey || null
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
    } catch (fetchError) {
      if (fetchError.name === 'AbortError') {
        throw new Error(`Request timed out. Please select a smaller portion of text and try again.`);
      }
      throw new Error(`Network error: Could not connect to the API server. ${fetchError.message}`);
    }

    // Read the response once as text
    const responseText = await response.text();
    
    if (!response.ok) {
      try {
        // Try to parse as JSON
        const errorData = JSON.parse(responseText);
        throw new Error(`API Error: ${errorData.error || 'Unknown server error'}`);
      } catch (e) {
        // If parsing fails, use the text directly
        throw new Error(`API Error: ${responseText.substring(0, 100)}`);
      }
    }

    // Parse the already-read text as JSON
    const responseData = JSON.parse(responseText);
    return parseClaudeResponse(responseData);
  } catch (error) {
    console.error('Error calling API:', error);
    
    // Provide more user-friendly error messages
    if (error.message.includes('No API key provided')) {
      throw new Error('Please add your Claude API key in the settings (gear icon).');
    } else if (error.message.includes('Network error') || error.message.includes('Failed to fetch')) {
      throw new Error('Connection to server failed. Please check your internet connection and try again.');
    } else if (error.message.includes('API Error') && error.message.length > 200) {
      // Truncate very long error messages
      throw new Error(error.message.substring(0, 200) + '...');
    }
    
    throw error;
  }
}

export { 
  generateCardsWithClaude,
  analyzeTextWithClaude,
  getStoredApiKeys,
  storeApiKeys,
  validateAnthropicApiKey,
  hasApiKeys
};