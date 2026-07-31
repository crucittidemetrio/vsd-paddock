// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Media Gallery: elimina un file da Vercel Blob
// ═══════════════════════════════════════════════════════════
//
// Il record dei metadati in SocialMedia (foglio Google) viene rimosso
// a parte dal frontend chiamando l'action Apps Script social.media.remove.
// Questa route cancella solo il file vero e proprio dallo storage Blob,
// usando BLOB_READ_WRITE_TOKEN (mai esposto al browser).

import { del } from '@vercel/blob';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const url = request.body && request.body.url;
  if (!url || typeof url !== 'string') {
    return response.status(400).json({ error: 'url obbligatorio' });
  }

  try {
    await del(url);
    return response.status(200).json({ ok: true });
  } catch (error) {
    return response.status(400).json({ error: error.message });
  }
}
