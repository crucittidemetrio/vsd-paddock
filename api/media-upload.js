// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Media Gallery: token per upload diretto a Vercel Blob
// ═══════════════════════════════════════════════════════════
//
// Il file NON passa da questa funzione (eviterebbe il limite di ~4.5MB
// del body delle funzioni serverless Vercel): il browser carica
// direttamente su Blob usando @vercel/blob/client `upload()`, che
// prima chiama questa route per ottenere un token firmato con
// `onBeforeGenerateToken`. Dopo l'upload il frontend chiama l'action
// Apps Script social.media.add per salvare i metadati (url, filename,
// tag) — questa route non scrive nulla sul foglio.
//
// Richiede la variabile d'ambiente BLOB_READ_WRITE_TOKEN, creata
// automaticamente da Vercel quando colleghi uno store Blob al progetto
// (dashboard Vercel → Storage → Create Database → Blob → Connect).
// Nessuna chiave da copiare a mano.

import { handleUpload } from '@vercel/blob/client';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const jsonResponse = await handleUpload({
      body: request.body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [
          'image/jpeg', 'image/png', 'image/webp', 'image/gif',
          'video/mp4', 'video/quicktime', 'video/webm',
        ],
        addRandomSuffix: true,
        maximumSizeInBytes: 50 * 1024 * 1024, // 50MB
      }),
      onUploadCompleted: async () => {
        // No-op: il frontend salva i metadati chiamando social.media.add
        // subito dopo che upload() si risolve, con i tag inseriti
        // dall'utente — non c'è nulla da fare qui.
      },
    });

    return response.status(200).json(jsonResponse);
  } catch (error) {
    return response.status(400).json({ error: error.message });
  }
}
