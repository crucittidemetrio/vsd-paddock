// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Compilatore messaggi Discord (staff)
// ═══════════════════════════════════════════════════════════
// Task #86. Due modalità:
//   - 'channel': posta un embed testo libero su uno dei canali già
//     collegati via webhook (stesso meccanismo di Notifications.js —
//     nessun webhook nuovo per il codice, solo Script Property).
//   - 'dm': manda un messaggio diretto Discord a uno o più piloti.
//     I webhook NON possono mandare DM — serve un vero Bot Discord
//     (token, non webhook URL) che apra un canale privato via REST
//     API (POST /users/@me/channels) e ci scriva dentro. Il bot deve
//     condividere il server con il destinatario (requisito Discord
//     anti-spam) — va quindi invitato nel server VSD una volta sola,
//     stesso processo di un bot normale, ma qui NON serve la gateway
//     connection: bastano chiamate REST stateless da UrlFetchApp,
//     esattamente come per l'OAuth in discordAuth.js.
//
// Script Properties richieste:
//   DISCORD_BOT_TOKEN               — token del bot (Developer Portal)
//   DISCORD_WEBHOOK_ADMIN_URL       — già esistente (Notifications.js)
//   DISCORD_WEBHOOK_BARSPORT_URL    — già esistente (Notifications.js)
//   DISCORD_WEBHOOK_GESTIONE_GARE_URL — nuovo, webhook dedicato canale
//                                       #gestione-gare
//
// Permessi: ctx.isStaff OPPURE ctx.canMessage. Il TP ha inizialmente
// promosso i responsabili sezione a role='staff', ma questo sblocca
// TUTTA l'area admin (Best Laps, Gestione Gare, Import Risultati,
// Candidature, Sponsor, Incidenti...) — troppo ampio, ritirato (Task
// #102). Al suo posto: colonna can_message su Drivers (checkbox,
// migrate_addCanMessageColumn in migrations.js), che ctx.canMessage
// espone senza toccare role. Chi ha solo can_message resta 'driver' a
// tutti gli effetti e vede solo la voce Messaggi Discord in sidebar.
//
// Sicurezza: il canale è sempre risolto da CHANNEL_WEBHOOK_PROPS (un
// set fisso di chiavi), MAI da un property name passato dal client —
// altrimenti un payload malevolo potrebbe far leggere/postare su
// qualunque Script Property.
// ═══════════════════════════════════════════════════════════

const DISCORD_API_BASE_MSG = 'https://discord.com/api/v10';
const MESSENGER_TEXT_MAX_LEN = 1900; // margine sotto il limite embed Discord (4096) — messaggio pensato per essere letto, non un post lungo

const CHANNEL_WEBHOOK_PROPS = {
  staff: 'DISCORD_WEBHOOK_ADMIN_URL',
  barsport: 'DISCORD_WEBHOOK_BARSPORT_URL',
  gestione_gare: 'DISCORD_WEBHOOK_GESTIONE_GARE_URL',
};

const CHANNEL_LABELS = {
  staff: '⛔ Staff-only',
  barsport: '🍻 Bar-sport',
  gestione_gare: '🏁 Gestione gare',
};

/**
 * messenger.send — invia un messaggio testo libero via Discord, a un
 * canale (embed via webhook) o in DM a uno/più piloti (via Bot REST
 * API). Auth: richiesto ctx.isStaff.
 *
 * @param {Object} payload
 *   - mode: 'channel' | 'dm'
 *   - text: string (obbligatorio, troncato a MESSENGER_TEXT_MAX_LEN)
 *   - channel_key?: 'staff' | 'barsport' | 'gestione_gare' (mode='channel')
 *   - color?: chiave di VSD_COLORS (Notifications.js), default 'cyan'
 *   - target?: 'single' | 'few' | 'all' (mode='dm', default 'few')
 *   - driver_ids?: string[] (mode='dm', target 'single'/'few')
 *   - confirm?: true (OBBLIGATORIO se target='all' — doppia conferma
 *     anche lato server, non solo UI)
 */
function handleMessengerSend(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');
  if (!ctx.isStaff && !ctx.canMessage) return fail('Operazione riservata a staff, admin o piloti abilitati al Messenger');

  payload = payload || {};
  const mode = String(payload.mode || '').trim();
  const text = String(payload.text || '').trim().slice(0, MESSENGER_TEXT_MAX_LEN);
  if (!text) return fail('Testo del messaggio obbligatorio');

  const senderName = (ctx.driver && ctx.driver.display_name) || ctx.driver_id || 'Staff';
  const color = (VSD_COLORS && VSD_COLORS[payload.color]) || VSD_COLORS.cyan;

  if (mode === 'channel') {
    return messengerSendChannel_(payload, text, color, senderName, ctx);
  }
  if (mode === 'dm') {
    return messengerSendDm_(payload, text, color, senderName, ctx);
  }
  return fail('mode non valido: usa "channel" o "dm"');
}

function messengerSendChannel_(payload, text, color, senderName, ctx) {
  const channelKey = String(payload.channel_key || '').trim();
  const propName = CHANNEL_WEBHOOK_PROPS[channelKey];
  if (!propName) return fail('channel_key non valido: ' + channelKey);

  const embed = {
    author: { name: 'VSD Paddock' },
    description: text,
    color: color,
    timestamp: new Date().toISOString(),
    footer: { text: 'Inviato da ' + senderName },
  };

  const result = postToDiscordWebhook_({ embeds: [embed] }, propName);
  if (!result.ok) return fail('Invio fallito: ' + result.error);

  logAudit_(ctx, 'messenger.send', channelKey,
    'Messaggio postato su ' + (CHANNEL_LABELS[channelKey] || channelKey) + ': "' + text.slice(0, 80) + (text.length > 80 ? '…' : '') + '"',
    null);

  return ok({ mode: 'channel', channel_key: channelKey });
}

function messengerSendDm_(payload, text, color, senderName, ctx) {
  const botToken = PropertiesService.getScriptProperties().getProperty('DISCORD_BOT_TOKEN');
  if (!botToken) return fail('Bot Discord non configurato (DISCORD_BOT_TOKEN mancante)');

  const target = String(payload.target || 'few').trim();
  const drivers = getCachedSheetData_(SHEETS.DRIVERS, 600);

  let recipients;
  if (target === 'all') {
    if (payload.confirm !== true) return fail('Conferma richiesta per un invio broadcast a tutti i piloti attivi');
    recipients = drivers.filter(d => d.status === 'active' && !d.removed_at);
  } else {
    const ids = Array.isArray(payload.driver_ids) ? payload.driver_ids.map(String) : [];
    if (ids.length === 0) return fail('Nessun destinatario selezionato');
    if (target === 'single' && ids.length > 1) return fail('target "single" ammette un solo destinatario');
    const idSet = new Set(ids);
    recipients = drivers.filter(d => idSet.has(String(d.driver_id)));
  }

  if (recipients.length === 0) return fail('Nessun pilota trovato tra i destinatari indicati');

  const embed = {
    author: { name: 'VSD Paddock' },
    description: text,
    color: color,
    timestamp: new Date().toISOString(),
    footer: { text: 'Messaggio diretto da ' + senderName + ' · VSD Paddock' },
  };

  const sent = [];
  const failed = [];

  recipients.forEach((driver, i) => {
    const discordId = String(driver.discord_id || '').trim();
    if (!discordId) {
      failed.push({ driver_id: driver.driver_id, display_name: driver.display_name, reason: 'discord_non_collegato' });
      return;
    }
    const result = discordSendDm_(discordId, { embeds: [embed] }, botToken);
    if (result.ok) {
      sent.push({ driver_id: driver.driver_id, display_name: driver.display_name });
    } else {
      failed.push({ driver_id: driver.driver_id, display_name: driver.display_name, reason: result.error });
    }
    // Piccola pausa tra un invio e l'altro — apre canale + posta messaggio
    // sono 2 richieste, evitiamo di sbattere sui rate limit Discord anche
    // con roster ampi. Non applicata dopo l'ultimo invio.
    if (i < recipients.length - 1) Utilities.sleep(400);
  });

  logAudit_(ctx, 'messenger.send', target,
    'DM a ' + sent.length + '/' + recipients.length + ' piloti (' + failed.length + ' falliti): "' + text.slice(0, 80) + (text.length > 80 ? '…' : '') + '"',
    { sent: sent.map(s => s.driver_id), failed: failed });

  return ok({ mode: 'dm', sent: sent.length, total: recipients.length, failed: failed });
}

/**
 * Manda una DM Discord via Bot REST API — stateless, nessuna gateway
 * connection necessaria. Il bot deve già condividere il server con
 * l'utente (altrimenti Discord risponde 403). Fault-tolerant: non
 * lancia mai, ritorna sempre {ok, error?}.
 *
 * @param {string} discordId - snowflake utente destinatario
 * @param {Object} messagePayload - { embeds: [...] } o { content: '...' }
 * @param {string} botToken
 */
function discordSendDm_(discordId, messagePayload, botToken) {
  try {
    const channelRes = UrlFetchApp.fetch(DISCORD_API_BASE_MSG + '/users/@me/channels', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'Authorization': 'Bot ' + botToken },
      payload: JSON.stringify({ recipient_id: discordId }),
      muteHttpExceptions: true,
    });
    const channelStatus = channelRes.getResponseCode();
    if (channelStatus < 200 || channelStatus >= 300) {
      return { ok: false, error: 'http_' + channelStatus + '_open_channel' };
    }
    const channel = JSON.parse(channelRes.getContentText());
    if (!channel.id) return { ok: false, error: 'channel_id_mancante' };

    const msgRes = UrlFetchApp.fetch(DISCORD_API_BASE_MSG + '/channels/' + channel.id + '/messages', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'Authorization': 'Bot ' + botToken },
      payload: JSON.stringify(messagePayload),
      muteHttpExceptions: true,
    });
    const msgStatus = msgRes.getResponseCode();
    if (msgStatus < 200 || msgStatus >= 300) {
      // Diagnostica: lo status HTTP da solo non basta a distinguere le
      // cause di un 403 (privacy DM disattivate, bot bloccato, bot non
      // più nella guild condivisa, token senza permessi...) — il body
      // di errore di Discord (code + message) lo dice esplicitamente.
      let detail = '';
      try {
        const body = JSON.parse(msgRes.getContentText());
        if (body && (body.code !== undefined || body.message)) {
          detail = ' [discord ' + body.code + ': ' + body.message + ']';
        }
      } catch (parseErr) {
        detail = ' [body non-JSON: ' + msgRes.getContentText().slice(0, 200) + ']';
      }
      return { ok: false, error: 'http_' + msgStatus + '_send_message' + detail };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Helper test — verifica la configurazione del Bot mandando una DM di
 * prova a se stessi. Modifica TEST_DRIVER_ID con il proprio driver_id
 * prima di lanciarla. Dropdown function → test_messenger_dm → ▶ Esegui
 */
function test_messenger_dm() {
  const TEST_DRIVER_ID = 'VSD005'; // ⚠️ cambia se necessario
  const ctx = { isStaff: true, driver_id: TEST_DRIVER_ID, driver: { display_name: 'Test' } };
  const result = handleMessengerSend({
    mode: 'dm',
    text: '🧪 Messaggio di prova dal compilatore VSD Paddock.',
    target: 'single',
    driver_ids: [TEST_DRIVER_ID],
  }, ctx);
  Logger.log(JSON.stringify(result));
}
