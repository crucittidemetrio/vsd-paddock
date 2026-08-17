// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Relay per l'invio di Web Push notifications
// ═══════════════════════════════════════════════════════════
//
// Apps Script non può firmare/cifrare il protocollo Web Push (VAPID +
// aes128gcm richiedono ECDSA/ECDH che l'ambiente Apps Script non
// offre) — questa route fa da ponte: riceve le subscription target da
// Apps Script (via UrlFetchApp) e usa la libreria "web-push" (Node,
// testata) per l'invio vero e proprio.
//
// Auth: NON è una route pubblica per il browser — solo Apps Script la
// chiama, autenticata con un secret condiviso (env PUSH_RELAY_SECRET,
// stesso valore nello Script Property di Apps Script) passato
// nell'header x-push-secret. Senza controlli chiunque conoscesse
// l'URL potrebbe spammare notifiche a tutti i piloti iscritti.
//
// Env richieste (Vercel → Settings → Environment Variables):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY  (generate una volta, la
//     pubblica va anche hardcoded lato frontend in usePushSubscription.js
//     — non è un segreto, la privata sì e resta solo qui)
//   VAPID_SUBJECT   (es. "mailto:qualcuno@example.com" — richiesto dal
//     protocollo Web Push, i provider push lo usano solo per contattare
//     il mittente in caso di abuso)
//   PUSH_RELAY_SECRET  (stringa casuale, stessa nello Script Property
//     Apps Script)

import webpush from 'web-push';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.PUSH_RELAY_SECRET;
  const receivedSecret = request.headers['x-push-secret'];
  if (!secret || receivedSecret !== secret) {
    return response.status(401).json({ error: 'Non autorizzato' });
  }

  const vapidPublic = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT;
  if (!vapidPublic || !vapidPrivate || !vapidSubject) {
    return response.status(500).json({ error: 'VAPID non configurato su Vercel' });
  }
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  const { subscriptions, title, body, url } = request.body || {};
  if (!Array.isArray(subscriptions) || subscriptions.length === 0) {
    return response.status(400).json({ error: 'subscriptions mancante o vuoto' });
  }
  if (!title || !body) {
    return response.status(400).json({ error: 'title e body sono obbligatori' });
  }

  const payload = JSON.stringify({ title, body, url: url || '/' });

  let sent = 0;
  let failed = 0;
  const expiredEndpoints = [];

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          payload
        );
        sent += 1;
      } catch (err) {
        failed += 1;
        // 404/410 = subscription non più valida (utente ha disinstallato,
        // revocato il permesso, ecc.) — segnalata per pulizia futura,
        // non è un errore del relay.
        if (err && (err.statusCode === 404 || err.statusCode === 410)) {
          expiredEndpoints.push(sub.endpoint);
        }
      }
    })
  );

  return response.status(200).json({ sent, failed, expiredEndpoints });
}
