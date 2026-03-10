// Vercel serverless function for generating flashcards
const fetch = require('node-fetch');

// Import shared prompts and API configuration
const { API_CONFIG } = require('../prompts');

// Helper function to truncate text
function truncateText(text, maxLength = 8000) {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '... [truncated]';
}

// Vercel serverless function handler
module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only handle POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text, textContext, deckOptions, userApiKey } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    if (!userApiKey) {
      return res.status(400).json({ error: 'No API key provided. Please add your Claude API key in settings.' });
    }

    const truncatedText = truncateText(text, 8000);

    const userPrompt = `Please create spaced repetition flashcards from the SELECTED TEXT below.
Use the guidelines from the system prompt.

Available deck categories: ${deckOptions || "General"}

Remember to return ONLY a valid JSON array of flashcard objects matching the required format.

PRIMARY FOCUS - Selected Text (create cards from this):
${truncatedText}

${textContext ? `OPTIONAL BACKGROUND - Document Context (extract any relevant context from this to make your cards standalone):
${truncateText(textContext, 1500)}` : ''}`;

    const payload = {
      model: API_CONFIG.CLAUDE_MODEL,
      system: API_CONFIG.PROMPTS.CARDS,
      messages: [{ role: 'user', content: userPrompt }],
      max_tokens: 4000
    };

    // Call Claude API with AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9000); // 9s to fit within Vercel's 10s limit

    try {
      const response = await fetch(API_CONFIG.ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': userApiKey,
          'anthropic-version': API_CONFIG.ANTHROPIC_VERSION
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok) {
        return res.status(response.status).json({
          error: `Claude API Error: ${JSON.stringify(data)}`
        });
      }

      return res.status(200).json(data);
    } catch (apiError) {
      clearTimeout(timeoutId);

      if (apiError.name === 'AbortError') {
        return res.status(504).json({ error: 'Request to Claude API timed out. Try a smaller text selection.' });
      }

      return res.status(500).json({ error: `Error calling Claude API: ${apiError.message}` });
    }
  } catch (error) {
    console.error('Server error during card generation:', error);
    return res.status(500).json({ error: `Unexpected error: ${error.message}` });
  }
};
