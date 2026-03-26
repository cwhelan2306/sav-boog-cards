import { put } from '@vercel/blob';

// Accepts: POST with multipart/form-data containing an "image" file field
// Returns: { url } pointing to the uploaded blob

const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB (client resizes first so this is a safety cap)

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // Read raw body
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);

  if (body.length > MAX_SIZE_BYTES) {
    return res.status(413).json({ error: 'Image too large (max 2 MB).' });
  }

  // Parse multipart manually using the boundary from Content-Type
  const contentType = req.headers['content-type'] || '';
  const boundaryMatch = contentType.match(/boundary=([^\s;]+)/);
  if (!boundaryMatch) return res.status(400).json({ error: 'Missing multipart boundary.' });
  const boundary = '--' + boundaryMatch[1];

  const bodyStr = body.toString('binary');
  const parts   = bodyStr.split(boundary).slice(1, -1);
  let imageBuffer = null, mimeType = 'image/jpeg', filename = 'card-image.jpg';

  for (const part of parts) {
    const [rawHeaders, ...rest] = part.split('\r\n\r\n');
    const content = rest.join('\r\n\r\n').replace(/\r\n$/, '');
    if (rawHeaders.includes('name="image"')) {
      const mimeMatch = rawHeaders.match(/Content-Type:\s*([^\r\n]+)/i);
      if (mimeMatch) mimeType = mimeMatch[1].trim();
      const nameMatch = rawHeaders.match(/filename="([^"]+)"/i);
      if (nameMatch) filename = nameMatch[1];
      imageBuffer = Buffer.from(content, 'binary');
    }
  }

  if (!imageBuffer) return res.status(400).json({ error: 'No image field found in upload.' });

  try {
    const blob = await put(`card-images/${Date.now()}-${filename}`, imageBuffer, {
      access: 'public',
      contentType: mimeType,
    });
    return res.json({ url: blob.url });
  } catch (err) {
    return res.status(500).json({ error: 'Upload failed: ' + err.message });
  }
}
