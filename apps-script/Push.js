// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Push Notifications
// ═══════════════════════════════════════════════════════════
// Apps Script non ha crypto per firmare/cifrare il protocollo Web Push
// (VAPID + aes128gcm) — non esiste una libreria nativa e reimplementarla
// a mano qui sarebbe fragile e rischioso. La firma/cifratura vera è
// delegata a una route serverless Vercel (api/push-send.js) che usa la
// libreria "web-push" (Node, testata), già ospitata sullo stesso
// progetto del frontend. Questo file si occupa solo di:
//   1. Salvare/rimuovere le subscription push dei piloti (storage).
//   2. Chiamare il relay Vercel via UrlFetchApp quando c'è qualcosa da
//      notificare (stesso pattern fault-tolerant di postToDiscord_).
//
// Setup necessario (una tantum, vedi companion/README o istruzioni
// fornite a parte):
//   - Script Properties: PUSH_RELAY_URL, PUSH_RELAY_SECRET
//   - Vercel env vars: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT,
//     PUSH_RELAY_SECRET (stesso valore dello Script Property)
//   - setupPushSubscriptionsTab() — editor Apps Script → ▶ Esegui
//
// Registrate in Codice.js dispatcher come:
//   'push.subscribe':   handlePushSubscribe
//   'push.unsubscribe': handlePushUnsubscribe
// ═══════════════════════════════════════════════════════════

const PUSH_SUB_HEADERS = [
  'subscription_id', 'driver_id', 'endpoint', 'p256dh', 'auth_key',
  'user_agent', 'created_at',
];

function setupPushSubscriptionsTab() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEETS.PUSH_SUBSCRIPTIONS);
  if (sheet) {
    Logger.log('✓ Tab "' + SHEETS.PUSH_SUBSCRIPTIONS + '" già esistente, nessuna modifica.');
    return;
  }
  sheet = ss.insertSheet(SHEETS.PUSH_SUBSCRIPTIONS);
  sheet.getRange(1, 1, 1, PUSH_SUB_HEADERS.length).setValues([PUSH_SUB_HEADERS]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, PUSH_SUB_HEADERS.length).setFontWeight('bold');
  Logger.log('✅ Tab "' + SHEETS.PUSH_SUBSCRIPTIONS + '" creata con ' + PUSH_SUB_HEADERS.length + ' colonne.');
}

/**
 * push.subscribe — Registra (o aggiorna) la subscription push del
 * pilota loggato. Upsert per (driver_id, endpoint): un pilota può avere
 * più device (telefono + desktop), ognuno con un endpoint diverso.
 * Auth: richiesta (qualsiasi pilota loggato).
 *
 * @param {Object} payload - { endpoint, keys: { p256dh, auth }, user_agent? }
 */
function handlePushSubscribe(payload, ctx) {
  if (!ctx || !ctx.driver_id) return fail('Auth richiesto');

  payload = payload || {};
  const endpoint = String(payload.endpoint || '').trim();
  const p256dh = payload.keys && payload.keys.p256dh;
  const authKey = payload.keys && payload.keys.auth;
  if (!endpoint || !p256dh || !authKey) {
    return fail('endpoint e keys.p256dh/keys.auth sono obbligatori');
  }

  const sheet = getSheet(SHEETS.PUSH_SUBSCRIPTIONS);
  if (!sheet) return fail('Tab PushSubscriptions non trovata — esegui setupPushSubscriptionsTab() una volta');

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const driverIdx = headers.indexOf('driver_id');
  const endpointIdx = headers.indexOf('endpoint');

  for (let i = 1; i < data.length; i++) {
    if (data[i][driverIdx] === ctx.driver_id && data[i][endpointIdx] === endpoint) {
      // Già registrata — nessuna modifica necessaria, evita righe duplicate.
      return ok({ subscribed: true, already_existed: true });
    }
  }

  const subscriptionId = 'push_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  sheet.appendRow([
    subscriptionId, ctx.driver_id, endpoint, p256dh, authKey,
    String(payload.user_agent || ''), new Date().toISOString(),
  ]);

  return ok({ subscribed: true, already_existed: false });
}

/**
 * push.unsubscribe — Rimuove la subscription del pilota loggato per un
 * endpoint specifico (quello del device/browser corrente).
 * Auth: richiesta.
 *
 * @param {Object} payload - { endpoint }
 */
function handlePushUnsubscribe(payload, ctx) {
  if (!ctx || !ctx.driver_id) return fail('Auth richiesto');

  payload = payload || {};
  const endpoint = String(payload.endpoint || '').trim();
  if (!endpoint) return fail('endpoint obbligatorio');

  const sheet = getSheet(SHEETS.PUSH_SUBSCRIPTIONS);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const driverIdx = headers.indexOf('driver_id');
  const endpointIdx = headers.indexOf('endpoint');

  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][driverIdx] === ctx.driver_id && data[i][endpointIdx] === endpoint) {
      sheet.deleteRow(i + 1);
      return ok({ unsubscribed: true });
    }
  }
  return ok({ unsubscribed: true, note: 'nessuna subscription trovata (già rimossa?)' });
}

/**
 * Invia una push notification a uno o più piloti tramite il relay
 * Vercel. Fault-tolerant come postToDiscord_: un errore qui non deve
 * mai bloccare l'azione chiamante.
 *
 * @param {string[]|null} driverIds - driver_id target, o null per TUTTI
 *   gli iscritti (broadcast — usare con parsimonia).
 * @param {{title:string, body:string, url?:string}} notification
 */
function sendPushNotification_(driverIds, notification) {
  try {
    const relayUrl = PropertiesService.getScriptProperties().getProperty('PUSH_RELAY_URL');
    const relaySecret = PropertiesService.getScriptProperties().getProperty('PUSH_RELAY_SECRET');
    if (!relayUrl || !relaySecret) {
      Logger.log('⏭️  Push non inviata: PUSH_RELAY_URL/PUSH_RELAY_SECRET non configurati in Script Properties.');
      return;
    }

    const rows = sheetToObjects(SHEETS.PUSH_SUBSCRIPTIONS);
    const targetRows = driverIds
      ? rows.filter(r => driverIds.indexOf(r.driver_id) !== -1)
      : rows;
    if (targetRows.length === 0) {
      Logger.log('⏭️  Push non inviata: nessuna subscription per i destinatari indicati.');
      return;
    }

    const subscriptions = targetRows.map(r => ({
      endpoint: r.endpoint,
      keys: { p256dh: r.p256dh, auth: r.auth_key },
      driver_id: r.driver_id, // solo per il log lato relay, non usato dal protocollo push
    }));

    const res = UrlFetchApp.fetch(relayUrl, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-push-secret': relaySecret },
      payload: JSON.stringify({
        subscriptions,
        title: notification.title,
        body: notification.body,
        url: notification.url || PADDOCK_URL,
      }),
      muteHttpExceptions: true,
    });

    const status = res.getResponseCode();
    if (status >= 200 && status < 300) {
      Logger.log('✅ Push inviata a ' + subscriptions.length + ' subscription(s).');
    } else {
      Logger.log('⚠️  Relay push ha risposto ' + status + ': ' + res.getContentText());
    }
  } catch (e) {
    Logger.log('⚠️  sendPushNotification_ error (non-blocking): ' + e.message);
  }
}

function test_sendPushNotification() {
  sendPushNotification_(null, {
    title: 'VSD Paddock — test',
    body: 'Se vedi questa notifica, il relay push funziona.',
  });
}
