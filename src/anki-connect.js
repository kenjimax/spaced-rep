/**
 * AnkiConnect client module
 * Wraps the AnkiConnect JSON-RPC API (localhost:8765)
 * https://foosoft.net/projects/anki-connect/
 */

const ANKI_CONNECT_URL = 'http://127.0.0.1:8765';

async function ankiRequest(action, params = {}) {
    const response = await fetch(ANKI_CONNECT_URL, {
        method: 'POST',
        body: JSON.stringify({ action, version: 6, params })
    });
    const result = await response.json();
    if (result.error) {
        throw new Error(result.error);
    }
    return result.result;
}

/**
 * Check if Anki is running and AnkiConnect is available.
 * Returns { connected: true } or { connected: false, reason: string }
 */
export async function checkConnection() {
    try {
        const version = await ankiRequest('version');
        return version >= 6;
    } catch (err) {
        // Detect CORS / network errors and surface a helpful reason
        if (err instanceof TypeError && err.message.includes('Failed to fetch')) {
            return false;
        }
        return false;
    }
}

/**
 * Attempt to update AnkiConnect's CORS config to allow the current origin.
 * Requires AnkiConnect 6.30+ and an existing permissive config.
 * Returns true if successful.
 */
export async function requestPermission() {
    try {
        const result = await ankiRequest('requestPermission');
        return result && result.permission === 'granted';
    } catch {
        return false;
    }
}

/**
 * Get all deck names
 * @returns {Promise<string[]>}
 */
export async function getDeckNames() {
    return ankiRequest('deckNames');
}

/**
 * Get all note type (model) names
 * @returns {Promise<string[]>}
 */
export async function getModelNames() {
    return ankiRequest('modelNames');
}

/**
 * Get field names for a given note type
 * @param {string} modelName
 * @returns {Promise<string[]>}
 */
export async function getModelFieldNames(modelName) {
    return ankiRequest('modelFieldNames', { modelName });
}

/**
 * Batch add notes to Anki
 * @param {Array<{deckName: string, modelName: string, fields: Object, tags?: string[]}>} notes
 * @returns {Promise<Array<number|null>>} Array of note IDs (null for failures)
 */
export async function addNotes(notes) {
    return ankiRequest('addNotes', { notes });
}

/**
 * Trigger Anki sync
 * @returns {Promise<void>}
 */
export async function sync() {
    return ankiRequest('sync');
}
