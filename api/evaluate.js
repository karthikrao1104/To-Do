
/**
 * Vercel Serverless Function: /api/evaluate
 *
 * AI-powered MCQ answer sheet evaluation using OpenRouter.
 * Handles model fallback, JSON extraction, validation and errors.
 */

const FAST_MODELS = [
  'cohere/north-mini-code:free',
  'liquid/lfm-3-1.7b:free',

];

const OPENROUTER_URL =
  'https://openrouter.ai/api/v1/chat/completions';

const MAX_TEXT_LENGTH = 50000;
const MODEL_TIMEOUT = 18000;

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
 * Validate the evaluation response.
 */
function validateResults(parsed) {
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

  const validStatuses = [
    'correct',
    'wrong',
    'needs_review',
  ];

  const normalizedResults = results.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return null;
    }

    const status = String(item.status || '').toLowerCase();

    if (!validStatuses.includes(status)) {
      return null;
    }

    return {
      question_number: item.question_number ?? null,
      question: String(item.question || ''),
      student_answer: String(item.student_answer || ''),
      correct_answer: String(item.correct_answer || ''),
      status,
      feedback: String(item.feedback || ''),
    };
  });

  if (normalizedResults.some((item) => item === null)) {
    return null;
  }

  return normalizedResults;
}

/**
 * Main Vercel API handler.
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
    const {
      studentName,
      studentId,
      extractedText,
    } = req.body || {};

    // Validate student information.
    if (
      typeof studentName !== 'string' ||
      !studentName.trim()
    ) {
      return res.status(400).json({
        success: false,
        error: 'Student name is required.',
      });
    }

    if (
      typeof studentId !== 'string' ||
      !studentId.trim()
    ) {
      return res.status(400).json({
        success: false,
        error: 'Student ID is required.',
      });
    }

    if (
      typeof extractedText !== 'string' ||
      !extractedText.trim()
    ) {
      return res.status(400).json({
        success: false,
        error: 'Extracted answer-sheet text is empty.',
      });
    }

    if (extractedText.length > MAX_TEXT_LENGTH) {
      return res.status(400).json({
        success: false,
        error: 'Extracted text is too large. Please use a shorter answer sheet.',
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
    const configuredModel =
      process.env.OPENROUTER_MODEL || FAST_MODELS[0];

    const modelsToTry = [
      ...new Set([
        configuredModel,
        ...FAST_MODELS,
      ]),
    ];

    // Strict evaluation instructions.
    const systemPrompt = `
You are a strict and accurate MCQ examination evaluator.

Your task:
1. Read every MCQ question in the supplied answer sheet.
2. Identify the student's selected answer.
3. Independently solve each question.
4. Determine the actual correct answer.
5. Compare the student's answer with the correct answer.
6. Provide a brief explanation.

Return ONLY one valid JSON object.

Do not return Markdown.
Do not use code fences.
Do not write introductory or concluding text.
Do not include reasoning outside the JSON object.

Required JSON structure:

{
  "results": [
    {
      "question_number": 1,
      "question": "Short question text",
      "student_answer": "A",
      "correct_answer": "B",
      "status": "wrong",
      "feedback": "Brief explanation"
    }
  ]
}

Rules:
- Include every identifiable question.
- Status must be exactly one of:
  "correct", "wrong", "needs_review".
- Use "needs_review" if a question or answer is unreadable or ambiguous.
- Never invent a student's selected answer.
- Use A, B, C or D when the option is identifiable.
- Keep feedback concise.
- Return an empty results array only if no questions can be identified.
`;

    const userPrompt = `
Evaluate the following student's answer sheet.

Student Name: ${studentName.trim()}
Student ID: ${studentId.trim()}

ANSWER SHEET TEXT:

${extractedText}
`;

    let lastError = 'All AI models failed to return a valid evaluation.';
    let attemptedModels = [];

    // Try models one by one.
    for (const currentModel of modelsToTry) {
      attemptedModels.push(currentModel);

      const controller = new AbortController();

      const timeoutId = setTimeout(() => {
        controller.abort();
      }, MODEL_TIMEOUT);

      try {
        console.log(`Trying OpenRouter model: ${currentModel}`);

        const openRouterResponse = await fetch(
          OPENROUTER_URL,
          {
            method: 'POST',

            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
              'HTTP-Referer':
                process.env.APP_URL || 'https://vercel.com',
              'X-Title': 'AI Student Answer Sheet Evaluator',
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

          lastError =
            `${currentModel} returned HTTP ${openRouterResponse.status}: ` +
            errorText.slice(0, 500);

          console.error(lastError);

          continue;
        }

        // Read response before clearing timeout.
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

        console.log('Model:', currentModel);
        console.log('Finish reason:', finishReason);
        console.log('Response length:', rawContent.length);

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

        // Parse actual assistant content, not reasoning.
        const parsedResult = extractJSON(rawContent);

        if (!parsedResult) {
          // Log a limited response preview for debugging.
          console.error(
            `${currentModel} returned invalid JSON. Response preview:`,
            rawContent.slice(0, 1500)
          );

          lastError = `${currentModel} returned invalid JSON.`;

          continue;
        }

        // Validate result structure.
        const results = validateResults(parsedResult);

        if (!results) {
          console.error(
            `${currentModel} returned JSON with an invalid evaluation structure.`
          );

          lastError =
            `${currentModel} returned JSON, but its evaluation structure was invalid.`;

          continue;
        }

        // Successful evaluation.
        console.log(
          `Evaluation successful using ${currentModel}. Questions: ${results.length}`
        );

        return res.status(200).json({
          success: true,
          studentName: studentName.trim(),
          studentId: studentId.trim(),
          modelUsed: currentModel,
          results,
        });

      } catch (callError) {
        if (callError.name === 'AbortError') {
          lastError = `${currentModel} timed out after ${MODEL_TIMEOUT / 1000} seconds.`;
        } else {
          lastError = `${currentModel}: ${callError.message}`;
        }

        console.error('OpenRouter model failure:', lastError);

      } finally {
        clearTimeout(timeoutId);
      }
    }

    // All models failed.
    console.error('All OpenRouter models failed:', attemptedModels);
    console.error('Last error:', lastError);

    return res.status(502).json({
      success: false,
      error: lastError,
      attemptedModels,
      message: 'AI evaluation failed. Please try again.',
    });

  } catch (error) {
    console.error('Serverless evaluation error:', error);

    return res.status(500).json({
      success: false,
      error: 'An internal server error occurred while processing the evaluation.',
    });
  }
}
