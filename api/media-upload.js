// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Media Gallery: token per upload diretto a Vercel Blob
// ═══════════════════════════════════════════════════════════
//
// Il file NON passa da questa funzione (eviterebbe il limite di ~4.5MB
// del body delle funzioni serverless Vercel): il browser carica
// direttamente su Blob usando @vercel/blob/client `upload()`, che
// prima chiama questa route per ottenere un token firmato con
// `onBeforeGenerateToken`. Dopo l'upload il frontend chiama l'action
// Apps Script social.media.add (o lapSubmissions.submit) per salvare i
// metadati — questa route non scrive nulla sul foglio.
//
// Auth: usata sia dal Social Manager (area admin) sia dall'invio
// autonomo dei best lap (aperto a tutti i piloti VSD, non solo staff),
// quindi non può più restare senza controlli come quando era solo
// admin-only. Il client passa il proprio token nel `clientPayload` di
// `upload()`; qui lo verifichiamo chiamando l'action Apps Script
// `auth.verify` prima di rilasciare il token di upload. Blocca solo i
// richiedenti senza un token valido — non impone un ruolo specifico,
// dato che i due chiamanti hanno requisiti diversi (staff vs pilota).
//
// Richiede la variabile d'ambiente BLOB_READ_WRITE_TOKEN, creata
// automaticamente da Vercel quando colleghi uno store Blob al progetto
// (dashboard Vercel → Storage → Create Database → Blob → Connect), e
// VITE_API_URL (stessa usata dal frontend per parlare con Apps Script).

import { handleUpload } from '@vercel/blob/client';

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

  try {
    const jsonResponse = await handleUpload({
      body: request.body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let token;
        try {
          token = clientPayload ? JSON.parse(clientPayload).token : null;
        } catch {
          token = null;
        }

        const valid = await isValidToken(token);
        if (!valid) {
          throw new Error('Non autorizzato: effettua il login prima di caricare un file');
        }

        return {
          allowedContentTypes: [
            'image/jpeg', 'image/png', 'image/webp', 'image/gif',
            'video/mp4', 'video/quicktime', 'video/webm',
          ],
          addRandomSuffix: true,
          maximumSizeInBytes: 50 * 1024 * 1024, // 50MB
        };
      },
      onUploadCompleted: async () => {
        // No-op: il frontend salva i metadati chiamando social.media.add
        // o lapSubmissions.submit subito dopo che upload() si risolve —
        // non c'è nulla da fare qui.
      },
    });

    return response.status(200).json(jsonResponse);
  } catch (error) {
    return response.status(400).json({ error: error.message });
  }
}
