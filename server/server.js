/**
 * Flash Cards Generator API Server
 *
 * Provides endpoints for generating flashcards using Claude API
 */

// Load .env file if present (for local development only)
try {
  require('dotenv').config();
} catch (e) {
  console.log('dotenv not installed, continuing without it');
}

// Note: This application uses client-side API keys passed with each request
// rather than storing them in environment variables

const express = require('express');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');

// Import shared prompts and API configuration
const { API_CONFIG } = require('../prompts');

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
 * Helper to call Claude API with consistent options
 * @param {string} systemPrompt - System prompt
 * @param {string} userPrompt - User prompt
 * @param {string} apiKey - Claude API key
 * @param {number} maxTokens - Maximum tokens for response
 * @returns {Promise<Object>} Claude API response
 */
async function callClaudeApi(systemPrompt, userPrompt, apiKey, maxTokens = 4000) {
  if (!apiKey) {
    throw new Error('API key not configured. Please provide a Claude API key.');
  }

  const payload = {
    model: API_CONFIG.CLAUDE_MODEL,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    max_tokens: maxTokens
  };

  // Log the request for debugging
  console.log(`\n===== CLAUDE API REQUEST =====`);
  console.log('SYSTEM:', systemPrompt.substring(0, 100) + '...');
  console.log('USER PROMPT:', userPrompt.substring(0, 100) + '...');
  console.log('==============================\n');

  // Set timeout for Vercel serverless functions (10 seconds)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); 

  try {
    const response = await fetch(API_CONFIG.ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': API_CONFIG.ANTHROPIC_VERSION
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorMessage = 'Unknown Claude API error';
      try {
        const errorData = await response.json();
        errorMessage = errorData.error?.message || 'Unknown Claude API error';
      } catch (e) {
        errorMessage = await response.text() || 'Could not parse error response';
      }
      throw new Error(`Claude API Error: ${errorMessage}`);
    }

    return response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Claude API request timed out. Try again or use a smaller text selection.');
    }
    throw error;
  }
}

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Configure middleware
app.use(cors({
  origin: [
    'http://localhost:3000', 
    'https://spaced-rep.vercel.app',
    'https://spaced-rep-ten.vercel.app',
    'https://pod-prep.com',
    'https://www.generateflash.cards',
    'https://generateflash.cards',
    new RegExp(/https:\/\/.*\.vercel\.app/)
  ],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, '../src')));

// Add middleware for request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// CLAUDE API ENDPOINTS

// API endpoint for text analysis
app.post('/api/analyze-text', async (req, res) => {
  try {
    const { text, userApiKey } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }
    
    // Use user-provided API key only
    const apiKey = userApiKey;
    
    if (!apiKey) {
      return res.status(400).json({ error: 'No API key provided. Please add your API key in settings.' });
    }
    
    const truncatedText = truncateText(text, 10000);
    
    const userPrompt = `Please analyze this text and provide a concise contextual summary (1-2 paragraphs maximum):

${truncatedText}`;
    
    const claudeResponse = await callClaudeApi(
      API_CONFIG.PROMPTS.ANALYSIS, 
      userPrompt, 
      apiKey, 
      1000
    );
    
    res.json(claudeResponse);
  } catch (error) {
    console.error('Server error during text analysis:', error);
    res.status(500).json({ 
      error: error.message
    });
  }
});

// API endpoint for generating flashcards
app.post('/api/generate-cards', async (req, res) => {
  try {
    const { text, textContext, deckOptions, userApiKey } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }
    
    // Use user-provided API key only
    const apiKey = userApiKey;
    
    if (!apiKey) {
      return res.status(400).json({ error: 'No API key provided. Please add your API key in settings.' });
    }
    
    const userPrompt = `Please create spaced repetition flashcards from the SELECTED TEXT below.
Use the guidelines from the system prompt.

Available deck categories: ${deckOptions || Object.keys(req.body.deckMap || {}).join(', ') || "General"}

Remember to return ONLY a valid JSON array of flashcard objects matching the required format.

PRIMARY FOCUS - Selected Text (create cards from this):
${truncateText(text)}

${textContext ? `OPTIONAL BACKGROUND - Document Context (extract any relevant context from this to make your cards standalone):
${textContext}` : ''}`;
    
    const claudeResponse = await callClaudeApi(
      API_CONFIG.PROMPTS.CARDS, 
      userPrompt, 
      apiKey, 
      4000
    );
    
    // Log the response for debugging
    console.log('Claude API response structure:', Object.keys(claudeResponse));
    if (claudeResponse.content) {
      console.log('Content types:', claudeResponse.content.map(item => item.type).join(', '));
    }
    
    res.json(claudeResponse);
  } catch (error) {
    console.error('Server error during card generation:', error);
    res.status(500).json({ 
      error: error.message
    });
  }
});


// MOCHI API ENDPOINTS

// API endpoint to fetch decks from Mochi
app.get('/api/mochi-decks', async (req, res) => {
  try {
    // Get Mochi API key from query parameter only
    const mochiApiKey = req.query.userMochiKey;
    if (!mochiApiKey) {
      return res.status(400).json({ 
        error: 'No Mochi API key provided. Please add your API key in settings.',
        fallbackDecks: { "General": "general" }
      });
    }
    
    // Mochi uses HTTP Basic Auth with API key followed by colon
    const base64ApiKey = Buffer.from(`${mochiApiKey}:`).toString('base64');
    const authToken = `Basic ${base64ApiKey}`;
    
    // Set timeout for Vercel serverless functions (5 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); 
    
    try {
      // Fetch decks from Mochi API
      const response = await fetch('https://app.mochi.cards/api/decks/', {
        method: 'GET',
        headers: {
          'Authorization': authToken
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
    
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Mochi API Error: ${errorText}`);
      }
      
      const decksData = await response.json();
    
    // Transform data for client use
    const formattedDecks = {};
    
    // Filter out trashed and archived decks
    const activeDeckCount = decksData.docs.length;
    let activeDecksCount = 0;
    
    decksData.docs.forEach(deck => {
      // Skip decks that are in trash or archived
      if (deck['trashed?'] || deck['archived?']) {
        return; // Skip this deck
      }
      
      // Only include active decks
      activeDecksCount++;
      
      // Remove [[ ]] if present in the ID
      const cleanId = deck.id.replace(/\[\[|\]\]/g, '');
      formattedDecks[deck.name] = cleanId;
    });
    
    console.log(`Loaded ${activeDecksCount} active decks out of ${activeDeckCount} total decks from Mochi API`);
    
    res.json({
      success: true,
      decks: formattedDecks,
      deckCount: activeDecksCount
    });
    
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Mochi API request timed out. Please try again.');
      }
      throw error;
    }
    
  } catch (error) {
    console.error('Error fetching Mochi decks:', error);
    res.status(500).json({ 
      error: error.message,
      fallbackDecks: {
        "General": "general"
      }
    });
  }
});

// API endpoint to check server status
app.get('/api/server-status', (req, res) => {
  res.json({
    status: 'ok',
    clientKeys: true, // This app uses client-side keys, not server environment variables
    timestamp: new Date().toISOString()
  });
});

// API endpoint for direct Mochi integration
app.post('/api/upload-to-mochi', async (req, res) => {
  try {
    const { cards, userMochiKey } = req.body;
    
    if (!cards || !Array.isArray(cards)) {
      return res.status(400).json({ error: 'Cards array is required' });
    }
    
    // Get Mochi API key from request only
    const mochiApiKey = userMochiKey;
    if (!mochiApiKey) {
      return res.status(400).json({ error: 'No Mochi API key provided. Please add your API key in settings.' });
    }
    
    console.log('Starting Mochi API upload');
    
    // Mochi uses HTTP Basic Auth with API key followed by colon
    const base64ApiKey = Buffer.from(`${mochiApiKey}:`).toString('base64');
    const authToken = `Basic ${base64ApiKey}`;
    
    // Upload each card to Mochi
    const results = [];
    
    for (const card of cards) {
      try {
        console.log('Uploading card to Mochi:', JSON.stringify({
          'content': card.content.substring(0, 20) + '...',
          'deck-id': card['deck-id']
        }));
        
        // Use HTTP Basic Auth header format
        const response = await fetch('https://app.mochi.cards/api/cards/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authToken
          },
          body: JSON.stringify({
            'content': card.content,
            'deck-id': card['deck-id']
          })
        });
        
        const responseText = await response.text();
        console.log('Mochi API response:', response.status, responseText.substring(0, 100));
        
        if (response.ok) {
          let responseData;
          try {
            responseData = JSON.parse(responseText);
            results.push({ success: true, id: responseData.id });
          } catch (jsonError) {
            console.error('Error parsing JSON response:', jsonError);
            results.push({ success: true, response: responseText });
          }
        } else {
          results.push({ success: false, error: responseText, status: response.status });
        }
      } catch (cardError) {
        console.error('Error uploading to Mochi:', cardError);
        results.push({ success: false, error: cardError.message });
      }
    }
    
    res.json({
      success: true,
      results: results,
      totalSuccess: results.filter(r => r.success).length,
      totalCards: cards.length
    });
    
  } catch (error) {
    console.error('Server error during Mochi upload:', error);
    res.status(500).json({ error: error.message });
  }
});

// UTILITY ENDPOINTS

// Health check route for Vercel
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    message: 'API server is running. Remember to add your API keys in the settings.'
  });
});

// Serve the main app
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../src/index.html'));
});

// Start server if not in Vercel serverless environment
if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Export the Express API for Vercel serverless deployment
module.exports = app;