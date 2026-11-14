import { checkCooldown, setCooldown, clearCooldown } from './quotaManager.js';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_TIMEOUT = 18000;

// Currently supported stable Gemini models
const GEMINI_MODELS_TO_TRY = [
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-flash-latest',
];

/**
 * Calls Google Gemini REST API using GEMINI_API_KEY.
 *
 * @param {Object} params
 * @param {string} params.systemPrompt
 * @param {string} params.userPrompt
 * @param {number} [params.temperature=0.1]
 * @param {number} [params.maxTokens=4000]
 * @returns {Promise<{ content: string, model: string, provider: 'Google Gemini' }>}
 */
export async function callGemini({ systemPrompt, userPrompt, temperature = 0.1, maxTokens = 4000 }) {
  const cooldown = checkCooldown('gemini');
  if (cooldown.inCooldown) {
    const error = new Error(`Gemini is in cooldown for ${cooldown.retryAfterSeconds}s.`);
    error.status = 429;
    error.isQuotaError = true;
    error.retryAfter = cooldown.retryAfterSeconds;
    throw error;
  }

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    const error = new Error('GEMINI_API_KEY is not configured on the server.');
    error.status = 401;
    throw error;
  }

  const configuredModel = process.env.GEMINI_MODEL?.trim();
  const models = [
    configuredModel,
    ...GEMINI_MODELS_TO_TRY,
  ].filter(Boolean);

  let lastError = null;

  for (const model of [...new Set(models)]) {
    const endpoint = `${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT);

    try {
      console.log(`[Gemini] Calling model: ${model}`);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: userPrompt }],
            },
          ],
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens,
            responseMimeType: 'application/json',
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const status = response.status;
        const errorText = await response.text().catch(() => '');

        if (status === 429) {
          setCooldown('gemini', response.headers, 60);
          const err = new Error('Gemini rate limit or quota exceeded.');
          err.status = 429;
          err.isQuotaError = true;
          throw err;
        }

        if (status === 401 || status === 403) {
          const err = new Error(`Gemini authentication error (HTTP ${status}).`);
          err.status = status;
          err.isAuthError = true;
          throw err;
        }

        // If 404 (model not found), continue to next model in list
        if (status === 404) {
          console.warn(`[Gemini] Model ${model} returned 404. Trying fallback.`);
          lastError = new Error(`Gemini model ${model} not found.`);
          continue;
        }

        const err = new Error(`Gemini error (HTTP ${status}): ${errorText.slice(0, 200)}`);
        err.status = status;
        throw err;
      }

      const data = await response.json();
      const candidate = data?.candidates?.[0];

      if (!candidate) {
        lastError = new Error('Gemini returned no candidates in response.');
        continue;
      }

      const contentPart = candidate.content?.parts?.[0]?.text;
      if (!contentPart || !contentPart.trim()) {
        lastError = new Error('Gemini returned an empty response body.');
        continue;
      }

      if (candidate.finishReason === 'MAX_TOKENS') {
        lastError = new Error('Gemini response was truncated due to token limits.');
        continue;
      }

      clearCooldown('gemini');
      return {
        content: contentPart,
        model,
        provider: 'Google Gemini',
      };
    } catch (err) {
      if (err.name === 'AbortError') {
        lastError = new Error(`Gemini API model ${model} timed out.`);
      } else if (err.isQuotaError || err.isAuthError) {
        throw err;
      } else {
        lastError = err;
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  const finalError = lastError || new Error('All Gemini models failed.');
  finalError.status = 502;
  throw finalError;
}
