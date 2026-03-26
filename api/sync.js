import { kv } from '@vercel/kv';

// Simple passphrase-based cloud sync.
// POST { action: 'save', passphrase, data }  → stores all sets under the passphrase key
// POST { action: 'load', passphrase }         → returns stored sets

const MAX_PAYLOAD_BYTES = 4 * 1024 * 1024; // 4 MB safety cap

function hashKey(passphrase) {
  // Namespace the key so it doesn't clash with rate-limit keys
  return `sync:${passphrase.trim().toLowerCase()}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { action, passphrase, data } = req.body || {};

  if (!passphrase || passphrase.trim().length < 4) {
    return res.status(400).json({ error: 'Passphrase must be at least 4 characters.' });
  }
  if (!action) return res.status(400).json({ error: 'Missing action.' });

  const key = hashKey(passphrase);

  if (action === 'save') {
    if (!data) return res.status(400).json({ error: 'Missing data.' });
    const payload = JSON.stringify(data);
    if (payload.length > MAX_PAYLOAD_BYTES) {
      return res.status(413).json({ error: 'Data too large (max 4 MB). Try removing card images before syncing.' });
    }
    // Store with no TTL — data lives until overwritten
    await kv.set(key, payload);
    return res.json({ ok: true, sets: Array.isArray(data) ? data.length : '?' });
  }

  if (action === 'load') {
    const raw = await kv.get(key);
    if (!raw) return res.status(404).json({ error: 'No data found for that passphrase.' });
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return res.json({ ok: true, data: parsed });
    } catch {
      return res.status(500).json({ error: 'Stored data is corrupted.' });
    }
  }

  return res.status(400).json({ error: 'Unknown action. Use "save" or "load".' });
}
