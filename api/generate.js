export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { notes, count } = req.body;

  if (!notes || !count) return res.status(400).json({ error: 'Missing notes or count' });

  const prompt = `You are a helpful study assistant. Given the notes below, create exactly ${count} flashcards to help a student study for their exam.

RULES:
- Each flashcard has one clear QUESTION and one concise ANSWER
- Questions should test understanding, not just memorization
- Answers should be short and clear (1-3 sentences max)
- Cover the most important concepts from the notes
- Output ONLY valid JSON — no markdown, no explanation, just the JSON array

OUTPUT FORMAT (JSON array only):
[
  {"question": "...", "answer": "..."},
  {"question": "...", "answer": "..."}
]

NOTES:
${notes}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data?.error?.message || 'API error' });
    }

    res.json({ text: data.content[0].text });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
