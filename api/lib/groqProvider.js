import { checkCooldown, setCooldown, clearCooldown } from './quotaManager.js';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_TIMEOUT = 18000;

// Currently available active chat models on Groq
const GROQ_MODELS_TO_TRY = [
  'qwen/qwen3.8-27b',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
];

/**
 * Calls Groq OpenAI-compatible Chat Completions API using GROQ_API_KEY.
 *
 * @param {Object} params
 * @param {string} params.systemPrompt
 * @param {string} params.userPrompt
 * @param {number} [params.temperature=0.1]
 * @param {number} [params.maxTokens=4000]
 * @returns {Promise<{ content: string, model: string, provider: 'Groq' }>}
 */
export async function callGroq({ systemPrompt, userPrompt, temperature = 0.1, maxTokens = 4000 }) {
  const cooldown = checkCooldown('groq');
  if (cooldown.inCooldown) {
    const error = new Error(`Groq is in cooldown for ${cooldown.retryAfterSeconds}s.`);
    error.status = 429;
    error.isQuotaError = true;
    error.retryAfter = cooldown.retryAfterSeconds;
    throw error;
  }

  const apiKey = (process.env.GROQ_API_KEY || '').trim();
  if (!apiKey) {
    const error = new Error('GROQ_API_KEY is not configured on the server.');
    error.status = 401;
    throw error;
  }

  const configuredModel = process.env.GROQ_MODEL?.trim();
  const models = [
    configuredModel,
    ...GROQ_MODELS_TO_TRY,
  ].filter(Boolean);

  let lastError = null;

  for (const model of [...new Set(models)]) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GROQ_TIMEOUT);

    try {
      console.log(`[Groq] Calling model: ${model}`);

      const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature,
          max_tokens: maxTokens,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const status = response.status;
        const errorText = await response.text().catch(() => '');

        if (status === 429) {
          setCooldown('groq', response.headers, 60);
          const err = new Error('Groq rate limit or quota exceeded.');
          err.status = 429;
          err.isQuotaError = true;
          throw err;
        }

        if (status === 401 || status === 403) {
          const err = new Error(`Groq authorization error (HTTP ${status}).`);
          err.status = status;
          err.isAuthError = true;
          throw err;
        }

        if (status === 404) {
          console.warn(`[Groq] Model ${model} not found (404). Trying next model.`);
          lastError = new Error(`Groq model ${model} not found.`);
          continue;
        }

        const err = new Error(`Groq error (HTTP ${status}): ${errorText.slice(0, 200)}`);
        err.status = status;
        throw err;
      }

      const data = await response.json();
      const choice = data?.choices?.[0];

      if (!choice) {
        lastError = new Error('Groq returned no choices in response.');
        continue;
      }

      const content = choice.message?.content;
      if (!content || !content.trim()) {
        lastError = new Error('Groq returned an empty response body.');
        continue;
      }

      if (choice.finish_reason === 'length') {
        lastError = new Error('Groq response was truncated due to max_tokens limit.');
        continue;
      }

      clearCooldown('groq');
      return {
        content,
        model,
        provider: 'Groq',
      };
    } catch (err) {
      if (err.name === 'AbortError') {
        lastError = new Error(`Groq API model ${model} timed out.`);
      } else if (err.isQuotaError || err.isAuthError) {
        throw err;
      } else {
        lastError = err;
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  const finalError = lastError || new Error('All Groq models failed.');
  finalError.status = 502;
  throw finalError;
}
