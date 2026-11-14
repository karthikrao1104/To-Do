/**
 * Normalizes an answer string for strict comparison.
 * Extracts the primary choice letter if format is "A", "A.", "Option A", etc.
 *
 * @param {string|any} ans
 * @returns {string} Normalized uppercase answer (e.g., 'A', 'B')
 */
export function normalizeAnswer(ans) {
  if (ans === undefined || ans === null) return '';
  const str = String(ans).trim().toUpperCase();

  // If answer matches patterns like "OPTION A" or "(A)" or "A."
  const match = str.match(/\b([A-D])\b/);
  if (match) {
    return match[1];
  }

  return str;
}

/**
 * Computes scores and statistics deterministically in JavaScript.
 * Rule:
 * - Never blindly trust AI marks.
 * - student_answer === correct_answer -> Correct (1 mark)
 * - Incorrect -> 0 marks
 * - status === 'needs_review' or answers missing -> Excluded from scorable questions
 * - Percentage = (obtained_marks / scorable_questions) * 100
 *
 * @param {Array} rawQuestions - Question results from AI
 * @returns {Object} Evaluated questions and calculated summary statistics
 */
export function calculateEvaluationStats(rawQuestions = []) {
  let totalQuestions = 0;
  let correctAnswers = 0;
  let wrongAnswers = 0;
  let needsReview = 0;
  let totalMarks = 0;
  let obtainedMarks = 0;

  const processedQuestions = rawQuestions.map((q, index) => {
    totalQuestions += 1;
    const qNum = q.question_number || index + 1;
    const questionText = q.question || `Question ${qNum}`;
    const normStudent = normalizeAnswer(q.student_answer);
    const normCorrect = normalizeAnswer(q.correct_answer);
    const feedback = q.feedback || '';

    // Check if question should be flagged for review
    const isNeedsReview =
      q.status === 'needs_review' ||
      !normStudent ||
      !normCorrect ||
      normStudent === 'NEEDS_REVIEW' ||
      normCorrect === 'NEEDS_REVIEW';

    let calculatedStatus = 'wrong';
    let marks = 0;

    if (isNeedsReview) {
      calculatedStatus = 'needs_review';
      needsReview += 1;
      marks = 0;
    } else {
      totalMarks += 1; // scorable denominator count
      if (normStudent === normCorrect) {
        calculatedStatus = 'correct';
        correctAnswers += 1;
        obtainedMarks += 1;
        marks = 1;
      } else {
        calculatedStatus = 'wrong';
        wrongAnswers += 1;
        marks = 0;
      }
    }

    return {
      question_number: qNum,
      question: questionText,
      student_answer: normStudent || (q.student_answer ? String(q.student_answer) : 'N/A'),
      correct_answer: normCorrect || (q.correct_answer ? String(q.correct_answer) : 'N/A'),
      status: calculatedStatus,
      feedback: feedback || (calculatedStatus === 'correct' ? 'Correct answer.' : `Correct answer is ${normCorrect}.`),
      marks,
    };
  });

  const scorableQuestions = totalMarks;
  const percentage =
    scorableQuestions > 0
      ? ((obtainedMarks / scorableQuestions) * 100).toFixed(1)
      : 'N/A';

  return {
    summary: {
      totalQuestions,
      correctAnswers,
      wrongAnswers,
      needsReview,
      scorableQuestions,
      totalMarks: scorableQuestions,
      obtainedMarks,
      percentage,
    },
    questions: processedQuestions,
  };
}

/**
 * Sends extracted answer-sheet text to the backend serverless function for AI evaluation.
 *
 * @param {Object} payload
 * @param {string} payload.studentName
 * @param {string} payload.studentId
 * @param {string} payload.extractedText
 * @returns {Promise<Object>} Evaluated result with calculated statistics
 */
export async function evaluateAnswerSheet({ studentName, studentId, extractedText }) {
  if (!extractedText || !extractedText.trim()) {
    throw new Error('Extracted text cannot be empty.');
  }

  const response = await fetch('/api/evaluate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      studentName: studentName.trim(),
      studentId: studentId.trim(),
      extractedText,
    }),
  });

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Failed to parse API response (${response.status} ${response.statusText}).`);
  }

  if (!response.ok) {
    const errorObj = new Error(data?.error || `Evaluation request failed with status ${response.status}.`);
    errorObj.status = response.status;
    errorObj.retryAfter = data?.retryAfter;
    throw errorObj;
  }

  if (!data?.results || !Array.isArray(data.results)) {
    throw new Error('API returned an invalid evaluation structure. Missing "results" array.');
  }

  // Perform independent JavaScript calculations on the results
  const calculated = calculateEvaluationStats(data.results);

  return {
    studentName: studentName.trim(),
    studentId: studentId.trim(),
    modelUsed: data.modelUsed,
    providerUsed: data.providerUsed,
    summary: calculated.summary,
    questions: calculated.questions,
  };
}
