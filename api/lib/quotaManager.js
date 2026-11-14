/**
 * Quota and cooldown manager for multi-provider AI integrations.
 * Tracks temporary cooldowns per provider with Retry-After header parsing.
 */

// In-memory cooldown tracking (survives warm serverless invocations and dev server)
const providerCooldowns = new Map();

/**
 * Checks if a provider is currently under an active cooldown.
 * @param {string} provider - 'openrouter' | 'gemini' | 'groq'
 * @returns {{ inCooldown: boolean, retryAfterSeconds: number, resetAt: number | null }}
 */
export function checkCooldown(provider) {
  const record = providerCooldowns.get(provider);
  if (!record) {
    return { inCooldown: false, retryAfterSeconds: 0, resetAt: null };
  }

  const now = Date.now();
  if (now >= record.resetAt) {
    providerCooldowns.delete(provider);
    return { inCooldown: false, retryAfterSeconds: 0, resetAt: null };
  }

  const remainingSecs = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
  return {
    inCooldown: true,
    retryAfterSeconds: remainingSecs,
    resetAt: record.resetAt,
  };
}

/**
 * Sets a cooldown on a provider based on HTTP headers or a default fallback.
 * @param {string} provider - 'openrouter' | 'gemini' | 'groq'
 * @param {Headers|Object} [headers] - Response headers
 * @param {number} [defaultSeconds=60] - Default cooldown duration if headers not present
 */
export function setCooldown(provider, headers = null, defaultSeconds = 60) {
  let seconds = defaultSeconds;

  if (headers) {
    const getHeader = (name) => {
      if (typeof headers.get === 'function') {
        return headers.get(name);
      }
      return headers[name] || headers[name.toLowerCase()];
    };

    const retryAfter = getHeader('retry-after');
    const xRateLimitReset = getHeader('x-ratelimit-reset');

    if (retryAfter) {
      const parsed = parseInt(retryAfter, 10);
      if (!isNaN(parsed) && parsed > 0) {
        seconds = parsed;
      } else {
        const dateMs = Date.parse(retryAfter);
        if (!isNaN(dateMs) && dateMs > Date.now()) {
          seconds = Math.ceil((dateMs - Date.now()) / 1000);
        }
      }
    } else if (xRateLimitReset) {
      // Could be unix timestamp or duration
      const parsed = parseFloat(xRateLimitReset);
      if (!isNaN(parsed)) {
        if (parsed > 1000000000) {
          // Absolute epoch seconds
          seconds = Math.max(1, Math.ceil(parsed - Date.now() / 1000));
        } else if (parsed > 0) {
          seconds = Math.ceil(parsed);
        }
      }
    }
  }

  // Cap cooldown between 5s and 600s for serverless resilience
  seconds = Math.max(5, Math.min(seconds, 600));
  const resetAt = Date.now() + seconds * 1000;

  providerCooldowns.set(provider, {
    resetAt,
    retryAfterSeconds: seconds,
  });

  console.warn(`[QuotaManager] Provider '${provider}' placed in cooldown for ${seconds}s until ${new Date(resetAt).toISOString()}`);
}

/**
 * Clears cooldown for a provider (e.g. after a successful response).
 * @param {string} provider
 */
export function clearCooldown(provider) {
  providerCooldowns.delete(provider);
}
