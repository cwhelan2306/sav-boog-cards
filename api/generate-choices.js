import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // Shared rate limit with generate.js (same counter)
  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    'unknown';
  const today = new Date().toISOString().slice(0, 10);
  const key   = `rl:${ip}:${today}`;

  const count = await kv.incr(key);
  if (count === 1) await kv.expire(key, 86400);
  if (count > 10) {
    return res.status(429).json({ error: 'Daily limit reached. Come back tomorrow! 🌸' });
  }

  const { cards } = req.body;
  if (!cards || !cards.length) return res.status(400).json({ error: 'Missing cards' });

  const prompt = `You are a quiz maker. For each flashcard below, generate exactly 3 plausible but WRONG alternative answers as multiple choice distractors.

Rules for wrong answers:
- Must be from the same subject area as the correct answer
- Similar in length and style to the correct answer
- Sound believable to someone who hasn't studied well
- Should NOT be obviously random or unrelated
- Should NOT be obviously wrong at a glance

Return ONLY a JSON array — no markdown, no explanation:
[
  {"question": "...", "answer": "...", "wrong": ["wrong1", "wrong2", "wrong3"]},
  ...
]

FLASHCARDS:
${JSON.stringify(cards.map(c => ({ question: c.question, answer: c.answer })))}`;

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

    const match = data.content[0].text.match(/\[[\s\S]*\]/);
    if (!match) return res.status(500).json({ error: 'Could not parse choices from AI response' });

    const choices = JSON.parse(match[0]);
    res.json({ choices });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
