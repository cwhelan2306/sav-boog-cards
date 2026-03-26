import { put, list } from '@vercel/blob';

// Passphrase-based cloud sync using Vercel Blob (no KV needed).
// POST { action: 'save', passphrase, data }  → stores sets as a JSON blob
// POST { action: 'load', passphrase }         → returns stored sets

const MAX_PAYLOAD_BYTES = 4 * 1024 * 1024; // 4 MB safety cap

function blobPath(passphrase) {
  const safe = passphrase.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '_');
  return `sync/${safe}.json`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { action, passphrase, data } = req.body || {};

  if (!passphrase || passphrase.trim().length < 4) {
    return res.status(400).json({ error: 'Passphrase must be at least 4 characters.' });
  }
  if (!action) return res.status(400).json({ error: 'Missing action.' });

  const path = blobPath(passphrase);

  if (action === 'save') {
    if (!data) return res.status(400).json({ error: 'Missing data.' });
    const payload = JSON.stringify(data);
    if (payload.length > MAX_PAYLOAD_BYTES) {
      return res.status(413).json({ error: 'Data too large (max 4 MB). Try removing card images before syncing.' });
    }
    try {
      await put(path, payload, {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
      });
      return res.json({ ok: true, sets: Array.isArray(data) ? data.length : '?' });
    } catch (err) {
      return res.status(500).json({ error: 'Save failed: ' + err.message });
    }
  }

  if (action === 'load') {
    try {
      // List blobs to find the one matching this passphrase
      const { blobs } = await list({ prefix: path });
      if (!blobs.length) {
        return res.status(404).json({ error: 'No data found for that passphrase.' });
      }
      // Fetch the blob content directly from its public URL
      const fetchRes = await fetch(blobs[0].url);
      if (!fetchRes.ok) return res.status(404).json({ error: 'No data found for that passphrase.' });
      const parsed = await fetchRes.json();
      return res.json({ ok: true, data: parsed });
    } catch (err) {
      return res.status(500).json({ error: 'Load failed: ' + err.message });
    }
  }

  return res.status(400).json({ error: 'Unknown action. Use "save" or "load".' });
}
