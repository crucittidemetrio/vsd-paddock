// ═══════════════════════════════════════════════════════════
// Normalizzazione URL immagini Google Drive
// ═══════════════════════════════════════════════════════════
// Bug ricorrente: lo staff copia l'URL di un'immagine da Drive in modi
// diversi (dalla barra indirizzi del viewer, da "Copia link", da
// "Scarica"...) e ottiene formati che SEMBRANO link diretti ma non lo
// sono davvero per un browser anonimo:
//
//   - https://lh3.googleusercontent.com/d/FILE_ID
//     → URL del viewer interno di Drive: spesso legato alla sessione
//       di chi lo ha copiato, risponde 403 per chiunque altro (incluso
//       questo webapp, che carica l'immagine senza essere loggato a
//       Google). Funziona "nel browser di chi l'ha copiato" e sembra
//       quindi corretto, ma si rompe per tutti gli altri visitatori.
//   - https://drive.google.com/file/d/FILE_ID/view?usp=sharing
//     → pagina HTML del viewer, non un'immagine.
//   - https://drive.google.com/open?id=FILE_ID
//     → redirect al viewer, non un'immagine.
//   - https://drive.google.com/uc?id=FILE_ID (o ?export=view&id=...)
//     → a volte funziona, ma per file grandi mostra un interstitial
//       "Google Drive non può eseguire la scansione antivirus...".
//
// L'unico formato stabile e pubblico (nessun login richiesto, nessun
// interstitial, nessuna dipendenza dalla sessione di chi l'ha copiato)
// per un file condiviso "Chiunque abbia il link" è l'endpoint
// thumbnail: https://drive.google.com/thumbnail?id=FILE_ID&sz=w1000
//
// Questa funzione riconosce tutti i formati sopra e li normalizza in
// automatico al salvataggio, così lo staff può incollare qualsiasi
// link Drive copiato "a occhio" senza doverne conoscere il formato
// esatto.
// ═══════════════════════════════════════════════════════════

const DRIVE_ID_PATTERNS = [
  /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]{10,})/,
  /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]{10,})/,
  /drive\.google\.com\/uc\?(?:export=[a-z]+&)?id=([a-zA-Z0-9_-]{10,})/,
  /drive\.google\.com\/thumbnail\?id=([a-zA-Z0-9_-]{10,})/,
  /lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]{10,})/,
];

/**
 * Estrae il file ID da un qualsiasi formato di URL Google Drive noto.
 * Ritorna null se l'URL non è un link Drive riconosciuto.
 */
export function extractDriveFileId(url) {
  if (!url) return null;
  for (const pattern of DRIVE_ID_PATTERNS) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * Normalizza un URL immagine: se è un link Google Drive in un formato
 * fragile (viewer, lh3, uc?id=...), lo riscrive nel formato thumbnail
 * pubblico e stabile. Se non è un link Drive riconosciuto (Imgur,
 * Discord CDN, altro), lo ritorna invariato.
 *
 * @param {string} url
 * @param {number} size - larghezza richiesta in px (default 1000)
 */
export function normalizeImageUrl(url, size = 1000) {
  const trimmed = (url || '').trim();
  if (!trimmed) return trimmed;

  const fileId = extractDriveFileId(trimmed);
  if (!fileId) return trimmed;

  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w${size}`;
}
