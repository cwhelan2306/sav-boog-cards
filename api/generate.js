import { kv } from '@vercel/kv';

const DAILY_LIMIT = 10;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // ── Rate limiting ──────────────────────────────────────
  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    'unknown';

  // Key resets automatically each calendar day (UTC)
  const today = new Date().toISOString().slice(0, 10); // "2026-03-26"
  const key   = `rl:${ip}:${today}`;

  const count = await kv.incr(key);
  if (count === 1) {
    // First request today — set TTL so the key cleans itself up after 24 h
    await kv.expire(key, 86400);
  }

  if (count > DAILY_LIMIT) {
    return res.status(429).json({
      error: `Daily limit of ${DAILY_LIMIT} requests reached. Come back tomorrow! 🌸`,
    });
  }
  // ──────────────────────────────────────────────────────

  const { notes, count: cardCount, image, imageType } = req.body;
  if (!cardCount) return res.status(400).json({ error: 'Missing count' });
  if (!notes && !image) return res.status(400).json({ error: 'Missing notes or image' });

  const isAlfred = cardCount === 'alfred';
  const countInstruction = isAlfred
    ? 'Decide yourself how many flashcards to create — pick whatever number (between 5 and 40) best covers the most important concepts in the material. No more, no less.'
    : `Create exactly ${cardCount} flashcards`;

  const prompt = `You are a helpful study assistant. Given the content below, ${countInstruction} to help a student study for their exam.

RULES:
- Each flashcard has one clear QUESTION and one concise ANSWER
- Questions should test understanding, not just memorization
- Answers should be short and clear (1-3 sentences max)
- Cover the most important concepts
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
        model:      'claude-haiku-4-5',
        max_tokens: 4096,
        messages: [{ role: 'user', content: messageContent }],
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
