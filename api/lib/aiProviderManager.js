import { callOpenRouter } from './openRouterProvider.js';
import { callGemini } from './geminiProvider.js';
import { callGroq } from './groqProvider.js';
import { checkCooldown } from './quotaManager.js';

/**
 * Extract a valid JSON object or array from AI response text.
 * Handles Markdown fences and additional text surrounding JSON.
 */
export function extractJSON(content) {
  if (!content || typeof content !== 'string') {
    return null;
  }

  let text = content.trim();

  // Remove Markdown code fences.
  text = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  // First attempt: direct JSON parsing.
  try {
    return JSON.parse(text);
  } catch {
    // Continue with extraction.
  }

  // Find the first JSON object or array.
  const start = text.search(/[[{]/);

  if (start === -1) {
    return null;
  }

  const stack = [];
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{' || char === '[') {
      stack.push(char);
      continue;
    }

    if (char === '}' || char === ']') {
      const last = stack.pop();

      if (
        (char === '}' && last !== '{') ||
        (char === ']' && last !== '[')
      ) {
        return null;
      }

      if (stack.length === 0) {
        const jsonText = text.slice(start, i + 1);
        try {
          return JSON.parse(jsonText);
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

/**
 * Orchestrates multi-provider execution with automatic fallback.
 * Provider Priority:
 * 1. OpenRouter (free models & round-robin keys)
 * 2. Google Gemini
 * 3. Groq
 *
 * @param {Object} params
 * @param {string} params.systemPrompt
 * @param {string} params.userPrompt
 * @param {Function} params.validator - Function that validates parsed JSON and returns normalized results or null
 * @returns {Promise<{ results: any, modelUsed: string, providerUsed: string }>}
 */
export async function executeWithFallback({ systemPrompt, userPrompt, validator }) {
  const attempts = [];
  const providers = [
    { name: 'OpenRouter', fn: callOpenRouter, key: 'openrouter' },
    { name: 'Google Gemini', fn: callGemini, key: 'gemini' },
    { name: 'Groq', fn: callGroq, key: 'groq' },
  ];

  let minRetryAfter = null;

  for (const provider of providers) {
    const cooldownInfo = checkCooldown(provider.key);
    if (cooldownInfo.inCooldown) {
      console.warn(`[AIProviderManager] Skipping ${provider.name} (active cooldown: ${cooldownInfo.retryAfterSeconds}s)`);
      if (minRetryAfter === null || cooldownInfo.retryAfterSeconds < minRetryAfter) {
        minRetryAfter = cooldownInfo.retryAfterSeconds;
      }
      attempts.push({ provider: provider.name, error: `In cooldown for ${cooldownInfo.retryAfterSeconds}s` });
      continue;
    }

    try {
      console.log(`[AIProviderManager] Attempting provider: ${provider.name}`);
      const rawResult = await provider.fn({ systemPrompt, userPrompt });

      // Parse JSON from provider text
      const parsed = extractJSON(rawResult.content);
      if (!parsed) {
        throw new Error(`${provider.name} returned unparseable or non-JSON output.`);
      }

      // Validate structure according to the feature's requirements
      const validated = validator(parsed);
      if (!validated) {
        throw new Error(`${provider.name} returned JSON with invalid schema structure.`);
      }

      console.log(`[AIProviderManager] SUCCESS with provider: ${provider.name} (${rawResult.model})`);
      return {
        results: validated,
        modelUsed: rawResult.model,
        providerUsed: rawResult.provider,
      };
    } catch (err) {
      console.error(`[AIProviderManager] ${provider.name} failed:`, err.message);
      attempts.push({ provider: provider.name, error: err.message, status: err.status });

      if (err.isQuotaError && err.retryAfter) {
        if (minRetryAfter === null || err.retryAfter < minRetryAfter) {
          minRetryAfter = err.retryAfter;
        }
      }
    }
  }

  // All providers failed or were exhausted
  const quotaFailed = attempts.some((a) => a.status === 429 || a.error.includes('quota') || a.error.includes('cooldown'));
  const errorMsg = quotaFailed
    ? `All AI providers (OpenRouter, Gemini, Groq) are currently rate-limited or quota-exhausted.${
        minRetryAfter ? ` Please retry in ${minRetryAfter} seconds.` : ' Please wait a few moments before retrying.'
      }`
    : 'All configured AI providers failed to process the request. Please check server API keys or try again.';

  const masterError = new Error(errorMsg);
  masterError.status = quotaFailed ? 429 : 502;
  masterError.attempts = attempts;
  masterError.retryAfter = minRetryAfter || undefined;
  throw masterError;
}
