/**
 * Vercel Serverless Function: /api/get-answers
 *
 * AI-powered Question Paper Solver with multi-provider automatic fallback
 * (OpenRouter free models with key rotation -> Gemini -> Groq).
 */

import { executeWithFallback } from './lib/aiProviderManager.js';

const MAX_TEXT_LENGTH = 50000;

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

    // Execute with multi-provider automatic fallback
    const { results, modelUsed, providerUsed } = await executeWithFallback({
      systemPrompt,
      userPrompt,
      validator: validateGetAnswersResults,
    });

    console.log(
      `[Get Answers] Solving successful using ${providerUsed} (${modelUsed}). Questions: ${results.length}`
    );

    return res.status(200).json({
      success: true,
      modelUsed,
      providerUsed,
      results,
    });
  } catch (error) {
    console.error('[Get Answers] Serverless error:', error);

    const statusCode = error.status || 500;
    if (error.retryAfter) {
      res.setHeader('Retry-After', String(error.retryAfter));
    }

    return res.status(statusCode).json({
      success: false,
      error: error.message || 'An internal server error occurred while solving the question paper.',
      retryAfter: error.retryAfter || undefined,
      attempts: error.attempts || undefined,
    });
  }
}
