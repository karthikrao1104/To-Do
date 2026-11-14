/**
 * Vercel Serverless Function: /api/evaluate
 *
 * AI-powered MCQ answer sheet evaluation with multi-provider automatic fallback
 * (OpenRouter free models with key rotation -> Gemini -> Groq).
 */

import { executeWithFallback } from './lib/aiProviderManager.js';

const MAX_TEXT_LENGTH = 50000;

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

    // Execute with multi-provider automatic fallback
    const { results, modelUsed, providerUsed } = await executeWithFallback({
      systemPrompt,
      userPrompt,
      validator: validateResults,
    });

    console.log(
      `Evaluation successful using ${providerUsed} (${modelUsed}). Questions: ${results.length}`
    );

    return res.status(200).json({
      success: true,
      studentName: studentName.trim(),
      studentId: studentId.trim(),
      modelUsed,
      providerUsed,
      results,
    });
  } catch (error) {
    console.error('Serverless evaluation error:', error);

    const statusCode = error.status || 500;
    if (error.retryAfter) {
      res.setHeader('Retry-After', String(error.retryAfter));
    }

    return res.status(statusCode).json({
      success: false,
      error: error.message || 'An internal server error occurred while processing the evaluation.',
      retryAfter: error.retryAfter || undefined,
      attempts: error.attempts || undefined,
    });
  }
}
