// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Audit Log
// ═══════════════════════════════════════════════════════════
// Registro di controllo per azioni admin sensibili (chi ha fatto cosa e
// quando): aggiustamenti punti, cancellazioni risultati, validazione
// best lap, cambi di stato gara, import classifiche. La tab AuditLog
// esisteva già nello schema (SHEETS.AUDIT_LOG) ma non era mai stata
// scritta da nessuna funzione — solo letta (conteggio righe) in uno
// script di manutenzione one-shot.
//
// Design: append-only, mai un blocco per il chiamante (fault-tolerant,
// stesso principio delle notifiche Discord in Notifications.js — un
// errore nel logging non deve mai far fallire l'azione vera).
//
// Schema: la tab esisteva già (creata prima di questo sviluppo) con uno
// schema più snello di quello inizialmente previsto qui — 6 colonne,
// niente actor_name/summary/details_json separati. logAudit_ si adatta
// allo schema esistente invece di sovrascriverlo: actor_name e summary
// vengono uniti in un'unica colonna "details" leggibile, con l'eventuale
// payload strutturato appeso come JSON.
//
// Setup: setupAuditLogTab() — editor Apps Script → dropdown funzioni →
// ▶ Esegui (una volta sola, idempotente: se la tab esiste già con gli
// header giusti non fa nulla).
// ═══════════════════════════════════════════════════════════

const AUDIT_LOG_HEADERS = [
  'log_id',
  'timestamp',
  'driver_id',
  'action',
  'target_id',
  'details',
];

/**
 * READ-ONLY — confronta gli header della tab AuditLog esistente con quelli
 * attesi da logAudit_ (AUDIT_LOG_HEADERS). Esegui questa PRIMA di fidarti
 * di una tab preesistente: logAudit_ scrive con appendRow (per posizione,
 * non per nome colonna) — se gli header non combaciano i dati finiscono
 * nelle colonne sbagliate senza errori visibili.
 * Dropdown function → debug_auditLogHeaders → ▶ Esegui.
 */
function debug_auditLogHeaders() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.AUDIT_LOG);
  if (!sheet) {
    Logger.log('⏭️  Tab "' + SHEETS.AUDIT_LOG + '" non esiste — esegui setupAuditLogTab() per crearla.');
    return;
  }
  const lastCol = sheet.getLastColumn();
  const lastRow = sheet.getLastRow();
  const currentHeaders = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];

  Logger.log('=== Tab "' + SHEETS.AUDIT_LOG + '" ===');
  Logger.log('Righe totali (inclusa header): ' + lastRow);
  Logger.log('Header attuali:  [' + currentHeaders.join(', ') + ']');
  Logger.log('Header attesi:   [' + AUDIT_LOG_HEADERS.join(', ') + ']');

  const match = currentHeaders.length === AUDIT_LOG_HEADERS.length
    && AUDIT_LOG_HEADERS.every((h, i) => currentHeaders[i] === h);

  if (match) {
    Logger.log('✅ Combaciano esattamente. logAudit_ può scrivere in sicurezza.');
  } else if (currentHeaders.length === 0 || (currentHeaders.length === 1 && currentHeaders[0] === '')) {
    Logger.log('⚠️  Tab vuota (nessun header) — esegui fix_auditLogHeaders() per scriverli.');
  } else {
    Logger.log('❌ NON combaciano — NON eseguire logAudit_ finché non risolvi manualmente ' +
      '(rischio di scrivere dati nelle colonne sbagliate). Righe dati presenti: ' + Math.max(0, lastRow - 1));
  }
}

/**
 * Scrive gli header attesi (AUDIT_LOG_HEADERS) sulla riga 1 di una tab
 * AuditLog che esiste ma è vuota/senza header. NON tocca righe di dati
 * eventualmente già presenti. Esegui SOLO dopo aver controllato con
 * debug_auditLogHeaders() che la riga 1 sia davvero vuota o vada
 * corretta consapevolmente.
 */
function fix_auditLogHeaders() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.AUDIT_LOG);
  if (!sheet) {
    Logger.log('⏭️  Tab "' + SHEETS.AUDIT_LOG + '" non esiste — esegui setupAuditLogTab() per crearla.');
    return;
  }
  sheet.getRange(1, 1, 1, AUDIT_LOG_HEADERS.length).setValues([AUDIT_LOG_HEADERS]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, AUDIT_LOG_HEADERS.length).setFontWeight('bold');
  Logger.log('✅ Header scritti su riga 1: [' + AUDIT_LOG_HEADERS.join(', ') + ']');
}

/**
 * Crea la tab AuditLog con gli header corretti, se non esiste già.
 * Idempotente — sicura da rieseguire.
 */
function setupAuditLogTab() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEETS.AUDIT_LOG);
  if (sheet) {
    Logger.log('✓ Tab "' + SHEETS.AUDIT_LOG + '" già esistente, nessuna modifica.');
    return;
  }
  sheet = ss.insertSheet(SHEETS.AUDIT_LOG);
  sheet.getRange(1, 1, 1, AUDIT_LOG_HEADERS.length).setValues([AUDIT_LOG_HEADERS]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, AUDIT_LOG_HEADERS.length).setFontWeight('bold');
  Logger.log('✅ Tab "' + SHEETS.AUDIT_LOG + '" creata con ' + AUDIT_LOG_HEADERS.length + ' colonne.');
}

/**
 * Registra un'azione admin sul log di controllo. Fault-tolerant: non
 * lancia mai, un errore di logging non deve mai bloccare l'azione reale
 * che lo ha chiamato (stesso pattern di postToDiscord_ in Notifications.js).
 *
 * @param {Object|null} ctx - auth context della richiesta (driver_id, driver).
 *   null per le funzioni lanciate a mano dall'editor Apps Script (es.
 *   admin_deleteRaceResults) — in quel caso l'attore viene identificato
 *   con l'email dell'utente che ha eseguito lo script.
 * @param {string} action - identificativo azione, es. 'championships.saveAdjustments'
 * @param {string} target - entità principale coinvolta, es. un championship_id o race_id
 * @param {string} summary - riga leggibile per uno staff che scorre il log
 * @param {Object} [details] - dati extra utili per debug approfondito (verrà JSON.stringify-ato
 *   e appeso al testo di "details" — lo schema della tab non ha una colonna dedicata)
 */
function logAudit_(ctx, action, target, summary, details) {
  try {
    const sheet = getSheet(SHEETS.AUDIT_LOG);
    if (!sheet) {
      Logger.log('⚠️  logAudit_: tab AuditLog non trovata — esegui setupAuditLogTab() una volta.');
      return;
    }
    const logId = 'audit_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const actorId = (ctx && ctx.driver_id) || '';
    let actorName = (ctx && ctx.driver && ctx.driver.display_name) || actorId;
    if (!actorName) {
      try {
        actorName = Session.getEffectiveUser().getEmail() || 'editor Apps Script';
      } catch (e2) {
        actorName = 'editor Apps Script';
      }
    }
    // Colonna "details" unica: nome attore + riepilogo leggibile, con
    // l'eventuale payload strutturato appeso come JSON per debug.
    let detailsText = actorName + ': ' + (summary || '');
    if (details) {
      detailsText += ' | ' + JSON.stringify(details);
    }
    sheet.appendRow([
      logId,
      new Date().toISOString(),
      actorId,
      action,
      target || '',
      detailsText,
    ]);
  } catch (e) {
    Logger.log('⚠️  logAudit_ error (non-blocking): ' + e.message);
  }
}

/**
 * Endpoint 'auditLog.list' — solo staff/admin. Restituisce le righe del
 * registro di controllo, più recenti prima, con filtri opzionali e
 * paginazione semplice.
 *
 * @param {Object} payload
 *   @param {string} [payload.action]    - match esatto sulla colonna action
 *   @param {string} [payload.driver_id] - match esatto sulla colonna driver_id
 *   @param {string} [payload.q]         - ricerca libera (case-insensitive) su target_id + details
 *   @param {number} [payload.limit]     - default 100, max 500
 *   @param {number} [payload.offset]    - default 0
 */
function handleAuditLogList(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');
  if (!ctx.isStaff) return fail('Forbidden: solo staff/admin');

  payload = payload || {};
  const limit = Math.min(Math.max(Number(payload.limit) || 100, 1), 500);
  const offset = Math.max(Number(payload.offset) || 0, 0);

  let rows = sheetToObjects(SHEETS.AUDIT_LOG);

  if (payload.action) {
    rows = rows.filter(r => String(r.action) === String(payload.action));
  }
  if (payload.driver_id) {
    rows = rows.filter(r => String(r.driver_id) === String(payload.driver_id));
  }
  if (payload.q) {
    const q = String(payload.q).toLowerCase();
    rows = rows.filter(r =>
      String(r.target_id || '').toLowerCase().includes(q) ||
      String(r.details || '').toLowerCase().includes(q)
    );
  }

  // Più recenti prima (timestamp ISO → ordinamento stringa funziona,
  // ma usiamo Date per sicurezza contro eventuali formati non normalizzati).
  rows.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const total = rows.length;
  const page = rows.slice(offset, offset + limit);

  // Arricchisci con il nome pilota, se driver_id è valorizzato e riconosciuto.
  const drivers = getCachedSheetData_(SHEETS.DRIVERS, 600);
  const driverMap = {};
  drivers.forEach(d => { driverMap[d.driver_id] = d.display_name; });
  const enriched = page.map(r => ({
    log_id: r.log_id,
    timestamp: r.timestamp,
    driver_id: r.driver_id || '',
    driver_name: (r.driver_id && driverMap[r.driver_id]) || null,
    action: r.action,
    target_id: r.target_id || '',
    details: r.details || '',
  }));

  return ok({ rows: enriched, total, limit, offset });
}
