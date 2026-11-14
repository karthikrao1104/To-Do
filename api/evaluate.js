/**
 * Vercel Serverless Function: /api/evaluate
 *
 * Secure, low-latency endpoint to evaluate extracted student answer sheet text using OpenRouter AI.
 */

// Fastest responsive free models on OpenRouter
const FAST_MODELS = [
  'cohere/north-mini-code:free',
  'liquid/lfm-3-1.7b:free',
  'nvidia/nemotron-3.5-lightning:free',
];

/**
 * Extracts JSON cleanly from assistant responses or reasoning blocks
 */
function extractJSON(content, reasoning) {
  const candidates = [content, reasoning].filter(Boolean);

  for (const text of candidates) {
    if (typeof text !== 'string') continue;

    // 1. Direct parse
    try {
      const parsed = JSON.parse(text.trim());
      if (parsed) return parsed;
    } catch {}

    // 2. Strip code fences
    const cleaned = text
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    try {
      const parsed = JSON.parse(cleaned);
      if (parsed) return parsed;
    } catch {}

    // 3. Match outermost JSON block
    const match = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (match) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed) return parsed;
      } catch {}
    }
  }

  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: `Method ${req.method} not allowed. Please use POST.`,
    });
  }

  try {
    const { studentName, studentId, extractedText } = req.body || {};

    if (!studentName || typeof studentName !== 'string' || !studentName.trim()) {
      return res.status(400).json({ error: 'Student name is required.' });
    }

    if (!studentId || typeof studentId !== 'string' || !studentId.trim()) {
      return res.status(400).json({ error: 'Student ID is required.' });
    }

    if (!extractedText || typeof extractedText !== 'string' || !extractedText.trim()) {
      return res.status(400).json({ error: 'Extracted answer-sheet text is empty.' });
    }

    if (extractedText.length > 50000) {
      return res.status(400).json({
        error: 'Extracted text is too large. Please limit the PDF to standard exam lengths.',
      });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey || apiKey === 'PASTE_YOUR_OPENROUTER_KEY_HERE') {
      return res.status(500).json({
        error: 'OPENROUTER_API_KEY is not configured on the server. Please set it in your environment variables.',
      });
    }

    // Prioritize fast, low-latency models
    const configuredModel = process.env.OPENROUTER_MODEL || FAST_MODELS[0];
    const modelsToTry = [configuredModel, ...FAST_MODELS.filter((m) => m !== configuredModel)];

    // Compact, direct system prompt to avoid reasoning overhead
    const systemPrompt = `You are a strict exam evaluator.
Given extracted MCQ questions, identify the student's selected answer (e.g. from Answer:) and solve the question to find the actual correct answer option (A, B, C, or D).

Return JSON ONLY in this format:
{"results":[{"question_number":1,"question":"Short question","student_answer":"A","correct_answer":"B","status":"wrong","feedback":"Brief reason"}]}`;

    const userPrompt = `Answer Sheet Text:\n${extractedText}`;

    let lastError = null;

    for (const currentModel of modelsToTry) {
      const controller = new AbortController();
      // Tight 12-second timeout per model so it fails fast and jumps to the next
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      try {
        const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://localhost:3000',
            'X-Title': 'Student Evaluator',
          },
          body: JSON.stringify({
            model: currentModel,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.1,
            max_tokens: 1500, // Caps excessive output for fast response times
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!openRouterResponse.ok) {
          const errText = await openRouterResponse.text().catch(() => '');
          lastError = `${currentModel} error: ${errText.slice(0, 150)}`;
          continue;
        }

        const aiData = await openRouterResponse.json();
        const choice = aiData?.choices?.[0];
        const rawContent = choice?.message?.content;
        const reasoning = choice?.message?.reasoning || choice?.reasoning;

        const parsedResult = extractJSON(rawContent, reasoning);

        if (!parsedResult) {
          lastError = `${currentModel} returned invalid JSON.`;
          continue;
        }

        let results = [];
        if (Array.isArray(parsedResult)) {
          results = parsedResult;
        } else if (Array.isArray(parsedResult.results)) {
          results = parsedResult.results;
        } else if (Array.isArray(parsedResult.questions)) {
          results = parsedResult.questions;
        } else {
          continue;
        }

        return res.status(200).json({
          success: true,
          studentName,
          studentId,
          modelUsed: currentModel,
          results,
        });
      } catch (callErr) {
        clearTimeout(timeoutId);
        lastError = callErr.message;
      }
    }

    return res.status(502).json({
      error: lastError || 'AI providers timed out or busy. Please retry.',
    });
  } catch (error) {
    console.error('Serverless evaluation error:', error);
    return res.status(500).json({
      error: 'An internal server error occurred while processing the evaluation.',
    });
  }
}
