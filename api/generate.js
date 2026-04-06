export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { notes, count: cardCount, image, imageType, detail } = req.body;
  if (!cardCount) return res.status(400).json({ error: 'Missing count' });
  if (!notes && !image) return res.status(400).json({ error: 'Missing notes or image' });

  const isAlfred = cardCount === 'alfred';
  const countInstruction = isAlfred
    ? 'Decide yourself how many flashcards to create — pick whatever number (between 5 and 40) best covers the most important concepts in the material. No more, no less.'
    : `Create exactly ${cardCount} flashcards`;

  const detailInstruction =
    detail === 'brief'
      ? 'Answers must be extremely short — one phrase or one sentence maximum. No extra explanation.'
      : detail === 'detailed'
      ? 'Answers can be 2-3 sentences if needed to fully explain the concept.'
      : 'Answers should be short and clear — 1 sentence max for simple facts, 2 sentences max for complex ones.';

  const prompt = `You are a helpful study assistant. Given the content below, ${countInstruction} to help a student study for their exam.

RULES:
- ONLY use information from the notes provided — do NOT use outside knowledge or make up content not in the notes
- Every question and answer must come directly from the provided notes
- Each flashcard has one clear QUESTION and one concise ANSWER
- Questions should test understanding, not just memorization
- ${detailInstruction}
- Cover the most important concepts from the notes
- Output ONLY valid JSON — no markdown, no explanation, just the JSON array

OUTPUT FORMAT (JSON array only):
[
  {"question": "...", "answer": "..."},
  {"question": "...", "answer": "..."}
]`;

  // Build the message content — image or text
  let messageContent;
  if (image) {
    messageContent = [
      {
        type: 'image',
        source: { type: 'base64', media_type: imageType || 'image/jpeg', data: image },
      },
      {
        type: 'text',
        text: prompt + '\n\nPlease read the notes in the image above and generate the flashcards.',
      },
    ];
  } else {
    messageContent = prompt + '\n\nNOTES:\n' + notes;
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        messages: [{ role: 'user', content: messageContent }],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      const errMsg = data?.error?.message || JSON.stringify(data) || 'API error';
      return res.status(response.status).json({ error: `[${response.status}] ${errMsg}` });
    }

    res.json({ text: data.content[0].text });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
