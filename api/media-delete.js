// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Media Gallery: elimina un file da Vercel Blob
// ═══════════════════════════════════════════════════════════
//
// Il record dei metadati (SocialMedia, o lo stato della submission in
// BestLapSubmissions) viene aggiornato a parte dal frontend chiamando
// la relativa action Apps Script. Questa route cancella solo il file
// vero e proprio dallo storage Blob, usando BLOB_READ_WRITE_TOKEN (mai
// esposto al browser).
//
// Auth: richiede un token valido nel body (stesso controllo di
// media-upload.js via auth.verify) — senza, chiunque conoscesse un URL
// Blob potrebbe cancellarlo.

import { del } from '@vercel/blob';

async function isValidToken(token) {
  const apiUrl = process.env.VITE_API_URL;
  if (!apiUrl || !token) return false;

  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'auth.verify', token, payload: {} }),
    });
    if (!res.ok) return false;
    const json = await res.json();
    return !!(json && json.ok && json.data && json.data.valid);
  } catch {
    return false;
  }
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const url = request.body && request.body.url;
  const token = request.body && request.body.token;
  if (!url || typeof url !== 'string') {
    return response.status(400).json({ error: 'url obbligatorio' });
  }

  const valid = await isValidToken(token);
  if (!valid) {
    return response.status(401).json({ error: 'Non autorizzato: effettua il login' });
  }

  try {
    await del(url);
    return response.status(200).json({ ok: true });
  } catch (error) {
    return response.status(400).json({ error: error.message });
  }
}
