/**
 * Vercel Serverless Function: /api/get-answers
 *
 * AI-powered Question Paper Solver using OpenRouter.
 * Reads MCQ question paper text, independently solves each question,
 * validates JSON response structure, and returns structured answers.
 */

const DEFAULT_FALLBACK_MODELS = [
  'cohere/north-mini-code:free',
  'liquid/lfm-3-1.7b:free',
  'mistral/mistral-7b-instruct:free',
];

const OPENROUTER_URL =
  'https://openrouter.ai/api/v1/chat/completions';

const MAX_TEXT_LENGTH = 50000;
const MODEL_TIMEOUT = 18000;
const MAX_MODEL_ATTEMPTS = 3;

function getModelsToTry() {
  const configuredModel = process.env.OPENROUTER_MODEL?.trim();
  const configuredFallbacks = (process.env.OPENROUTER_FALLBACK_MODELS || '')
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);

  return [
    ...new Set([
      configuredModel,
      ...configuredFallbacks,
      ...DEFAULT_FALLBACK_MODELS,
    ].filter(Boolean)),
  ].slice(0, MAX_MODEL_ATTEMPTS);
}

/**
 * Extract a valid JSON object or array from AI response text.
 * Handles Markdown fences and additional text surrounding JSON.
 */
function extractJSON(content) {
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
  const start = text.search(/[\[{]/);

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

  // Incomplete or truncated JSON.
  return null;
}

/**
 * Extract text from different OpenRouter message content formats.
 */
function getMessageContent(message) {
  const content = message?.content;

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        return part?.text || '';
      })
      .join('\n');
  }

  return '';
}

/**
 * Validate and normalize the Get Answers results.
 */
function validateGetAnswersResults(parsed) {
  let results = null;

  if (Array.isArray(parsed)) {
    results = parsed;
  } else if (Array.isArray(parsed?.results)) {
    results = parsed.results;
  } else if (Array.isArray(parsed?.questions)) {
    results = parsed.questions;
  }

  if (!results || results.length === 0) {
    return null;
  }

  const validStatuses = ['solved', 'needs_review'];

  const normalizedResults = results.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return null;
    }

    const questionNumber = item.question_number ?? index + 1;
    const questionText = String(item.question || '').trim();

    // Options mapping normalization
    let options = {};
    if (item.options && typeof item.options === 'object' && !Array.isArray(item.options)) {
      for (const [key, value] of Object.entries(item.options)) {
        options[key.toUpperCase()] = String(value || '').trim();
      }
    } else if (Array.isArray(item.options)) {
      item.options.forEach((opt, idx) => {
        const letter = String.fromCharCode(65 + idx);
        options[letter] = String(opt || '').trim();
      });
    }

    let correctOption = String(item.correct_option || '').trim().toUpperCase();
    // Normalize correct_option like "B." or "(B)" to "B"
    const optionMatch = correctOption.match(/\b([A-Z])\b/);
    if (optionMatch) {
      correctOption = optionMatch[1];
    }

    let correctAnswer = String(item.correct_answer || '').trim();
    if (!correctAnswer && options[correctOption]) {
      correctAnswer = options[correctOption];
    }

    let status = String(item.status || 'solved').toLowerCase();
    if (!validStatuses.includes(status)) {
      status = 'solved';
    }

    // If options are missing or correct option is missing, mark as needs_review
    if (Object.keys(options).length === 0 || !correctOption) {
      status = 'needs_review';
    }

    return {
      question_number: questionNumber,
      question: questionText || `Question ${questionNumber}`,
      options,
      correct_option: correctOption || 'N/A',
      correct_answer: correctAnswer || 'N/A',
      explanation: String(item.explanation || '').trim(),
      status,
    };
  });

  if (normalizedResults.some((item) => item === null)) {
    return null;
  }

  return normalizedResults;
}

/**
 * Main Vercel API handler for Get Answers.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');

    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Please use POST.',
    });
  }

  try {
    const { extractedText } = req.body || {};

    if (
      typeof extractedText !== 'string' ||
      !extractedText.trim()
    ) {
      return res.status(400).json({
        success: false,
        error: 'Extracted question-paper text is empty.',
      });
    }

    if (extractedText.length > MAX_TEXT_LENGTH) {
      return res.status(400).json({
        success: false,
        error: 'Extracted text is too large. Please use a shorter question paper.',
      });
    }

    // Read API key securely from server environment.
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey || !apiKey.trim()) {
      console.error('OPENROUTER_API_KEY is missing.');

      return res.status(500).json({
        success: false,
        error: 'OpenRouter API key is not configured on the server.',
      });
    }

    // Use configured model first, followed by fallback models.
    const modelsToTry = getModelsToTry();

    // System prompt specifically for solving MCQs
    const systemPrompt = `
You are an expert academic multiple-choice question paper solver.

Your task:
1. Read the entire question paper provided.
2. Identify every MCQ question.
3. Extract all available options (e.g., A, B, C, D).
4. Independently solve each question step-by-step.
5. Select the correct option.
6. Return the exact option letter (A, B, C, D, etc.).
7. Return the full option text.
8. Explain the answer concisely.
9. Do not simply copy an answer key if one exists in the uploaded document. If an answer key is present, independently verify the answer against the question.

Return ONLY one valid JSON object.
Do not return Markdown formatting or code fences.
Do not write introductory or concluding text.

Required JSON structure:
{
  "results": [
    {
      "question_number": 1,
      "question": "Which function prints output in Python?",
      "options": {
        "A": "input()",
        "B": "print()",
        "C": "display()",
        "D": "output()"
      },
      "correct_option": "B",
      "correct_answer": "print()",
      "explanation": "The print() function displays output in Python.",
      "status": "solved"
    }
  ]
}

Rules:
- Include every identifiable question.
- Never invent missing options.
- Preserve original question numbering if identifiable.
- Use the exact option text.
- Use "needs_review" for status if the question is ambiguous, options are missing/garbled, or multiple answers could be valid. Otherwise use "solved".
- Do not silently omit questions.
- Do not claim certainty when the question is ambiguous.
- Keep explanations concise.
- Return an empty results array only if no questions can be identified.
`;

    const userPrompt = `
Please solve the following MCQ question paper and return the answers in the specified JSON structure.

QUESTION PAPER TEXT:

${extractedText}
`;

    let lastError = 'All AI models failed to return answers for the question paper.';
    let attemptedModels = [];

    // Try models one by one.
    for (const currentModel of modelsToTry) {
      attemptedModels.push(currentModel);

      const controller = new AbortController();

      const timeoutId = setTimeout(() => {
        controller.abort();
      }, MODEL_TIMEOUT);

      try {
        console.log(`[Get Answers] Trying OpenRouter model: ${currentModel}`);

        const openRouterResponse = await fetch(
          OPENROUTER_URL,
          {
            method: 'POST',

            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
              'HTTP-Referer':
                process.env.APP_URL || 'https://vercel.com',
              'X-Title': 'AI Question Paper Solver',
            },

            body: JSON.stringify({
              model: currentModel,

              messages: [
                {
                  role: 'system',
                  content: systemPrompt,
                },
                {
                  role: 'user',
                  content: userPrompt,
                },
              ],

              temperature: 0.1,
              max_tokens: 4000,
            }),

            signal: controller.signal,
          }
        );

        if (!openRouterResponse.ok) {
          const errorText = await openRouterResponse
            .text()
            .catch(() => '');

          if (
            openRouterResponse.status === 402 ||
            openRouterResponse.status === 429
          ) {
            const retryAfter = openRouterResponse.headers.get('retry-after');
            const error =
              openRouterResponse.status === 429
                ? 'OpenRouter rate limit reached. Please wait before trying again.'
                : 'OpenRouter account limit reached. Check your account credits or usage limits.';

            if (retryAfter) {
              res.setHeader('Retry-After', retryAfter);
            }

            console.warn(
              `[Get Answers] ${currentModel} returned HTTP ${openRouterResponse.status}; stopping model fallback.`
            );

            return res.status(openRouterResponse.status).json({
              success: false,
              error,
              retryAfter: retryAfter || undefined,
            });
          }

          if (
            openRouterResponse.status === 401 ||
            openRouterResponse.status === 403
          ) {
            console.error(
              `[Get Answers] OpenRouter rejected credentials with HTTP ${openRouterResponse.status}.`
            );

            return res.status(502).json({
              success: false,
              error: 'OpenRouter rejected the server API key. Check OPENROUTER_API_KEY.',
            });
          }

          lastError =
            `${currentModel} returned HTTP ${openRouterResponse.status}: ` +
            errorText.slice(0, 500);

          console.error(lastError);

          continue;
        }

        const aiData = await openRouterResponse.json();

        if (aiData?.error) {
          lastError =
            `${currentModel}: ${aiData.error.message || 'OpenRouter API error'}`;

          console.error(lastError);

          continue;
        }

        const choice = aiData?.choices?.[0];

        if (!choice) {
          lastError = `${currentModel} returned no choices.`;

          console.error(lastError);

          continue;
        }

        const rawContent = getMessageContent(choice.message);
        const finishReason = choice.finish_reason;

        console.log('[Get Answers] Model:', currentModel);
        console.log('[Get Answers] Finish reason:', finishReason);
        console.log('[Get Answers] Response length:', rawContent.length);

        if (!rawContent.trim()) {
          lastError = `${currentModel} returned an empty response.`;

          console.error(lastError);

          continue;
        }

        if (finishReason === 'length') {
          lastError = `${currentModel} response was truncated due to token limits.`;

          console.error(lastError);

          continue;
        }

        // Parse JSON
        const parsedResult = extractJSON(rawContent);

        if (!parsedResult) {
          console.error(
            `[Get Answers] ${currentModel} returned invalid JSON. Response preview:`,
            rawContent.slice(0, 1500)
          );

          lastError = `${currentModel} returned invalid JSON.`;

          continue;
        }

        // Validate structure
        const results = validateGetAnswersResults(parsedResult);

        if (!results) {
          console.error(
            `[Get Answers] ${currentModel} returned JSON with an invalid results structure.`
          );

          lastError =
            `${currentModel} returned JSON, but question answer structure was invalid.`;

          continue;
        }

        console.log(
          `[Get Answers] Solving successful using ${currentModel}. Questions: ${results.length}`
        );

        return res.status(200).json({
          success: true,
          modelUsed: currentModel,
          results,
        });

      } catch (callError) {
        if (callError.name === 'AbortError') {
          lastError = `${currentModel} timed out after ${MODEL_TIMEOUT / 1000} seconds.`;
        } else {
          lastError = `${currentModel}: ${callError.message}`;
        }

        console.error('[Get Answers] OpenRouter model failure:', lastError);

      } finally {
        clearTimeout(timeoutId);
      }
    }

    console.error('[Get Answers] All OpenRouter models failed:', attemptedModels);
    console.error('[Get Answers] Last error:', lastError);

    return res.status(502).json({
      success: false,
      error: lastError,
      attemptedModels,
      message: 'AI question paper solving failed. Please try again.',
    });

  } catch (error) {
    console.error('[Get Answers] Serverless error:', error);

    return res.status(500).json({
      success: false,
      error: 'An internal server error occurred while solving the question paper.',
    });
  }
}
