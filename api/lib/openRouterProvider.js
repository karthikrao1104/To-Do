import { getNextOpenRouterKey } from './openRouterKeyManager.js';
import { checkCooldown, setCooldown, clearCooldown } from './quotaManager.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL_TIMEOUT = 18000;
const MAX_MODEL_ATTEMPTS = 3;

// Safe list of known free models ending in :free or openrouter/free router
const DEFAULT_FALLBACK_MODELS = [
  'openrouter/free',
  'cohere/north-mini-code:free',
  'liquid/lfm-3-1.7b:free',
  'mistral/mistral-7b-instruct:free',
];

/**
 * Returns prioritized list of free OpenRouter models.
 */
export function getOpenRouterModels() {
  const allowPaid = (process.env.OPENROUTER_ALLOW_PAID || '').toLowerCase() === 'true';

  const configuredModel = process.env.OPENROUTER_MODEL?.trim();
  const configuredFallbacks = (process.env.OPENROUTER_FALLBACK_MODELS || '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);

  const rawList = [
    configuredModel,
    ...configuredFallbacks,
    ...DEFAULT_FALLBACK_MODELS,
  ].filter(Boolean);

  // If paid is NOT allowed, ensure only models ending in :free or the free router are used
  const filtered = rawList.filter((m) => {
    if (allowPaid) return true;
    return m.endsWith(':free') || m === 'openrouter/free';
  });

  return [...new Set(filtered)].slice(0, MAX_MODEL_ATTEMPTS);
}

/**
 * Executes a chat completion using OpenRouter.
 *
 * @param {Object} params
 * @param {string} params.systemPrompt
 * @param {string} params.userPrompt
 * @param {number} [params.temperature=0.1]
 * @param {number} [params.maxTokens=4000]
 * @returns {Promise<{ content: string, model: string, provider: 'OpenRouter' }>}
 */
export async function callOpenRouter({ systemPrompt, userPrompt, temperature = 0.1, maxTokens = 4000 }) {
  // Check cooldown status
  const cooldown = checkCooldown('openrouter');
  if (cooldown.inCooldown) {
    const error = new Error(`OpenRouter is in cooldown for ${cooldown.retryAfterSeconds}s.`);
    error.status = 429;
    error.isQuotaError = true;
    error.retryAfter = cooldown.retryAfterSeconds;
    throw error;
  }

  const apiKey = getNextOpenRouterKey();
  if (!apiKey) {
    const error = new Error('No OpenRouter API key configured (check OPENROUTER_API_KEYS or OPENROUTER_API_KEY).');
    error.status = 401;
    throw error;
  }

  const modelsToTry = getOpenRouterModels();
  if (modelsToTry.length === 0) {
    const error = new Error('No valid free OpenRouter models available.');
    error.status = 400;
    throw error;
  }

  let lastError = null;

  for (const currentModel of modelsToTry) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), MODEL_TIMEOUT);

    try {
      console.log(`[OpenRouter] Trying model: ${currentModel}`);

      const response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': process.env.APP_URL || 'https://vercel.com',
          'X-Title': 'P3 Exam Assessment Suite',
        },
        body: JSON.stringify({
          model: currentModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature,
          max_tokens: maxTokens,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const status = response.status;
        const errorText = await response.text().catch(() => '');

        // 429 (Rate Limit) or 402 (Credits/Quota) -> Account level quota issue
        if (status === 429 || status === 402) {
          setCooldown('openrouter', response.headers, 60);
          const err = new Error(
            status === 429
              ? 'OpenRouter rate limit reached.'
              : 'OpenRouter credit / account limit reached.'
          );
          err.status = status;
          err.isQuotaError = true;
          throw err;
        }

        // 401 / 403 Credentials invalid
        if (status === 401 || status === 403) {
          const err = new Error('OpenRouter rejected credentials.');
          err.status = status;
          err.isAuthError = true;
          throw err;
        }

        // 400 or other 4xx/5xx for specific model: continue to next model in list
        console.warn(`[OpenRouter] Model ${currentModel} returned HTTP ${status}: ${errorText.slice(0, 200)}`);
        lastError = new Error(`OpenRouter model ${currentModel} error (HTTP ${status})`);
        continue;
      }

      const aiData = await response.json();
      if (aiData?.error) {
        lastError = new Error(`OpenRouter error: ${aiData.error.message || 'API error'}`);
        continue;
      }

      const choice = aiData?.choices?.[0];
      if (!choice) {
        lastError = new Error(`OpenRouter model ${currentModel} returned no choices.`);
        continue;
      }

      const messageContent = choice.message?.content;
      let rawText = '';
      if (typeof messageContent === 'string') {
        rawText = messageContent;
      } else if (Array.isArray(messageContent)) {
        rawText = messageContent
          .map((part) => (typeof part === 'string' ? part : part?.text || ''))
          .join('\n');
      }

      if (!rawText.trim()) {
        lastError = new Error(`OpenRouter model ${currentModel} returned empty text.`);
        continue;
      }

      if (choice.finish_reason === 'length') {
        lastError = new Error(`OpenRouter model ${currentModel} response was truncated.`);
        continue;
      }

      clearCooldown('openrouter');
      return {
        content: rawText,
        model: currentModel,
        provider: 'OpenRouter',
      };
    } catch (err) {
      if (err.name === 'AbortError') {
        console.warn(`[OpenRouter] Model ${currentModel} timed out after ${MODEL_TIMEOUT / 1000}s`);
        lastError = new Error(`OpenRouter model ${currentModel} timed out.`);
      } else if (err.isQuotaError || err.isAuthError) {
        // Stop model loop and propagate quota/auth error up to the provider manager
        throw err;
      } else {
        lastError = err;
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // If all models failed
  const error = lastError || new Error('All OpenRouter models failed.');
  error.status = 502;
  throw error;
}
