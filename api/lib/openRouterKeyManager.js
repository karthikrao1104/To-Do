/**
 * OpenRouter Key Manager
 * Supports OPENROUTER_API_KEYS (comma-separated) and backward-compatible OPENROUTER_API_KEY.
 * Employs round-robin rotation for credential management.
 * Never logs actual keys or exposes them to the frontend.
 */

let rotationIndex = 0;

/**
 * Parses and returns all available OpenRouter API keys.
 * @returns {string[]} Valid keys
 */
export function getOpenRouterKeys() {
  const multiKeys = process.env.OPENROUTER_API_KEYS || '';
  const singleKey = process.env.OPENROUTER_API_KEY || '';

  const parsedKeys = [
    ...multiKeys.split(','),
    singleKey,
  ]
    .map((k) => k.trim())
    .filter(Boolean);

  // Remove duplicates while preserving insertion order
  return [...new Set(parsedKeys)];
}

/**
 * Returns the next OpenRouter key in round-robin order.
 * @returns {string|null} The API key or null if none configured
 */
export function getNextOpenRouterKey() {
  const keys = getOpenRouterKeys();
  if (keys.length === 0) {
    return null;
  }

  const key = keys[rotationIndex % keys.length];
  rotationIndex = (rotationIndex + 1) % keys.length;
  return key;
}

/**
 * Returns the number of configured OpenRouter keys without exposing them.
 * @returns {number}
 */
export function getKeyCount() {
  return getOpenRouterKeys().length;
}
