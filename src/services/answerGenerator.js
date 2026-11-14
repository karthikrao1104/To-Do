/**
 * Service to request AI-generated answers for a question paper.
 * Calls the serverless /api/get-answers endpoint.
 */

/**
 * Computes summary statistics for the solved question paper.
 *
 * @param {Array} results - Solved question items
 * @returns {Object} Summary counts
 */
export function calculateAnswerStats(results = []) {
  let totalQuestions = 0;
  let solvedQuestions = 0;
  let reviewQuestions = 0;

  results.forEach((q) => {
    totalQuestions += 1;
    if (q.status === 'needs_review') {
      reviewQuestions += 1;
    } else {
      solvedQuestions += 1;
    }
  });

  return {
    totalQuestions,
    solvedQuestions,
    reviewQuestions,
  };
}

/**
 * Sends extracted question paper text to the backend serverless function.
 *
 * @param {Object} params
 * @param {string} params.extractedText - Plain text extracted from PDF
 * @returns {Promise<Object>} Formatted answer results with summary stats
 */
export async function getAnswersFromQuestionPaper({ extractedText }) {
  if (!extractedText || !extractedText.trim()) {
    throw new Error('Extracted question paper text cannot be empty.');
  }

  const response = await fetch('/api/get-answers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
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
    const errorObj = new Error(data?.error || `Get Answers request failed with status ${response.status}.`);
    errorObj.status = response.status;
    errorObj.retryAfter = data?.retryAfter;
    throw errorObj;
  }

  if (!data?.results || !Array.isArray(data.results)) {
    throw new Error('API returned an invalid structure. Missing "results" array.');
  }

  const stats = calculateAnswerStats(data.results);

  return {
    modelUsed: data.modelUsed,
    providerUsed: data.providerUsed,
    summary: stats,
    results: data.results,
  };
}
