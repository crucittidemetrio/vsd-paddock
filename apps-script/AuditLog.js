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
// Setup: setupAuditLogTab() — editor Apps Script → dropdown funzioni →
// ▶ Esegui (una volta sola, idempotente: se la tab esiste già con gli
// header giusti non fa nulla).
// ═══════════════════════════════════════════════════════════

const AUDIT_LOG_HEADERS = [
  'log_id',
  'timestamp',
  'actor_driver_id',
  'actor_name',
  'action',
  'target',
  'summary',
  'details_json',
];

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
 * @param {Object} [details] - dati extra utili per debug approfondito (verrà JSON.stringify-ato)
 */
function logAudit_(ctx, action, target, summary, details) {
  try {
    const sheet = getSheet(SHEETS.AUDIT_LOG);
    if (!sheet) {
      Logger.log('⚠️  logAudit_: tab AuditLog non trovata — esegui setupAuditLogTab() una volta.');
      return;
    }
    const logId = 'audit_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    let actorId = (ctx && ctx.driver_id) || '';
    let actorName = (ctx && ctx.driver && ctx.driver.display_name) || actorId;
    if (!actorName) {
      try {
        actorName = Session.getEffectiveUser().getEmail() || 'editor Apps Script';
      } catch (e2) {
        actorName = 'editor Apps Script';
      }
    }
    sheet.appendRow([
      logId,
      new Date().toISOString(),
      actorId,
      actorName,
      action,
      target || '',
      summary || '',
      details ? JSON.stringify(details) : '',
    ]);
  } catch (e) {
    Logger.log('⚠️  logAudit_ error (non-blocking): ' + e.message);
  }
}
