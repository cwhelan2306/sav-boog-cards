export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { password } = req.body;
  const correct = process.env.SITE_PASSWORD;

  if (!correct) {
    return res.status(500).json({ error: 'SITE_PASSWORD environment variable is not set.' });
  }

  if (password === correct) {
    return res.json({ ok: true });
  }

  return res.status(401).json({ ok: false, error: 'Wrong password 🙅' });
}
