// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Sessioni Team (allenamenti, qualifiche, riunioni)
// ═══════════════════════════════════════════════════════════
// ADR-Team-Scheduler, Fase 1: CRUD sessioni riservato allo staff, senza
// RSVP (Fase 2) né notifiche Discord (Fase 3). Le sessioni sono lette
// da chiunque sia loggato — servono al team, non solo allo staff, per
// sapere quando allenarsi insieme — ma create/modificate/cancellate
// solo da staff/admin. Stesso pattern di RaceRSVP.js (ok()/fail(),
// getCachedSheetData_/sheetToObjects, ID generati lato server).
//
// Setup: setupTeamSessionsTab() — editor Apps Script → ▶ Esegui (una
// tantum, idempotente).
//
// Registrate in Codice.js dispatcher come:
//   'teamSessions.list':   handleTeamSessionsList
//   'teamSessions.create': handleTeamSessionsCreate
//   'teamSessions.update': handleTeamSessionsUpdate
//   'teamSessions.remove': handleTeamSessionsRemove
//   'sessionRsvp.list':    handleSessionRsvpList
//   'sessionRsvp.set':     handleSessionRsvpSet
// ═══════════════════════════════════════════════════════════

const TEAM_SESSIONS_HEADERS = [
  'session_id', 'type', 'title', 'championship_id', 'event_id', 'track_id',
  'sim', 'datetime_start', 'duration_min', 'discord_channel', 'notes',
  'created_by', 'created_at',
];

const TEAM_SESSION_TYPES = [
  'allenamento_libero', 'allenamento_collettivo', 'qualifica',
  'evento_esterno', 'riunione',
];

// Fase 2 — RSVP piloti per sessione, stesso schema/statuses di RaceRSVPs
// (RaceRSVP.js) ma FK su session_id invece di race_id.
const SESSION_RSVP_HEADERS = ['rsvp_id', 'session_id', 'driver_id', 'status', 'note', 'responded_at'];
const SESSION_RSVP_STATUSES = ['confirmed', 'declined', 'tentative'];

function setupTeamSessionsTab() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEETS.TEAM_SESSIONS);
  if (sheet) {
    Logger.log('✓ Tab "' + SHEETS.TEAM_SESSIONS + '" già esistente, nessuna modifica.');
    return;
  }
  sheet = ss.insertSheet(SHEETS.TEAM_SESSIONS);
  sheet.getRange(1, 1, 1, TEAM_SESSIONS_HEADERS.length).setValues([TEAM_SESSIONS_HEADERS]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, TEAM_SESSIONS_HEADERS.length).setFontWeight('bold');
  Logger.log('✅ Tab "' + SHEETS.TEAM_SESSIONS + '" creata con ' + TEAM_SESSIONS_HEADERS.length + ' colonne.');
}

/**
 * setupSessionRsvpTab — Fase 2. Editor Apps Script → ▶ Esegui (una
 * tantum, idempotente), come setupTeamSessionsTab().
 */
function setupSessionRsvpTab() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEETS.SESSION_RSVPS);
  if (sheet) {
    Logger.log('✓ Tab "' + SHEETS.SESSION_RSVPS + '" già esistente, nessuna modifica.');
    return;
  }
  sheet = ss.insertSheet(SHEETS.SESSION_RSVPS);
  sheet.getRange(1, 1, 1, SESSION_RSVP_HEADERS.length).setValues([SESSION_RSVP_HEADERS]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, SESSION_RSVP_HEADERS.length).setFontWeight('bold');
  Logger.log('✅ Tab "' + SHEETS.SESSION_RSVPS + '" creata con ' + SESSION_RSVP_HEADERS.length + ' colonne.');
}

/**
 * teamSessions.list — Tutte le sessioni pianificate. Visibile a
 * chiunque sia loggato (stesso criterio di rsvp.list): il team deve
 * poter vedere quando sono gli allenamenti, non solo lo staff che li
 * crea. Nessun filtro data lato server per ora — il frontend segue lo
 * stesso pattern di races.list (fetch unico, filtro/vista in Calendar).
 * Auth: richiesta.
 */
function handleTeamSessionsList(payload, ctx) {
  if (!ctx || !ctx.driver_id) return fail('Auth richiesto');

  const sessions = getCachedSheetData_(SHEETS.TEAM_SESSIONS, 300);
  return ok({ sessions: sessions, count: sessions.length });
}

/**
 * teamSessions.create — Crea una nuova sessione team.
 * Auth: richiesto ctx.isStaff.
 * @param {Object} payload
 *   - type: uno tra TEAM_SESSION_TYPES (obbligatorio)
 *   - title: string (obbligatorio)
 *   - datetime_start: ISO string (obbligatorio)
 *   - duration_min: number (opzionale, default 60)
 *   - championship_id / event_id / track_id: string, opzionali (FK)
 *   - sim: string, opzionale ('LMU' | 'IRC' | 'ACE' | '')
 *   - discord_channel: string, opzionale
 *   - notes: string, opzionale
 */
function handleTeamSessionsCreate(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');
  if (!ctx.isStaff) return fail('Operazione riservata a staff o admin');

  payload = payload || {};
  const type = String(payload.type || '').trim();
  const title = String(payload.title || '').trim();
  const datetimeStart = String(payload.datetime_start || '').trim();

  if (TEAM_SESSION_TYPES.indexOf(type) === -1) {
    return fail('type non valido — atteso uno tra: ' + TEAM_SESSION_TYPES.join(', '));
  }
  if (!title) return fail('title obbligatorio');
  if (!datetimeStart || isNaN(new Date(datetimeStart).getTime())) {
    return fail('datetime_start obbligatorio e deve essere una data valida');
  }

  const sheet = getSheet(SHEETS.TEAM_SESSIONS);
  if (!sheet) return fail('Tab TeamSessions non trovata — esegui setupTeamSessionsTab() una volta');

  const now = new Date().toISOString();
  const sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

  const row = {
    session_id: sessionId,
    type: type,
    title: title,
    championship_id: String(payload.championship_id || ''),
    event_id: String(payload.event_id || ''),
    track_id: String(payload.track_id || ''),
    sim: String(payload.sim || ''),
    datetime_start: new Date(datetimeStart).toISOString(),
    duration_min: payload.duration_min ? Number(payload.duration_min) : 60,
    discord_channel: String(payload.discord_channel || ''),
    notes: String(payload.notes || ''),
    created_by: ctx.driver_id,
    created_at: now,
  };

  sheet.appendRow(TEAM_SESSIONS_HEADERS.map(h => row[h]));
  invalidateSheetCache_(SHEETS.TEAM_SESSIONS);

  logAudit_(ctx, 'teamSessions.create', sessionId,
    'Sessione creata: "' + title + '" (' + type + ') il ' + row.datetime_start,
    null);

  return ok(row);
}

/**
 * teamSessions.update — Aggiorna una sessione esistente (solo i campi
 * passati nel payload vengono modificati).
 * Auth: richiesto ctx.isStaff.
 * @param {Object} payload - { session_id, ...campi da aggiornare }
 */
function handleTeamSessionsUpdate(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');
  if (!ctx.isStaff) return fail('Operazione riservata a staff o admin');

  payload = payload || {};
  const sessionId = String(payload.session_id || '').trim();
  if (!sessionId) return fail('session_id obbligatorio');

  if (payload.type !== undefined && TEAM_SESSION_TYPES.indexOf(String(payload.type)) === -1) {
    return fail('type non valido — atteso uno tra: ' + TEAM_SESSION_TYPES.join(', '));
  }
  if (payload.datetime_start !== undefined && isNaN(new Date(payload.datetime_start).getTime())) {
    return fail('datetime_start non valido');
  }

  const sheet = getSheet(SHEETS.TEAM_SESSIONS);
  if (!sheet) return fail('Tab TeamSessions non trovata');

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idIdx = headers.indexOf('session_id');

  for (let i = 1; i < data.length; i++) {
    if (data[i][idIdx] !== sessionId) continue;

    const rowObj = {};
    headers.forEach((h, j) => { rowObj[h] = data[i][j]; });

    const EDITABLE = [
      'type', 'title', 'championship_id', 'event_id', 'track_id', 'sim',
      'datetime_start', 'duration_min', 'discord_channel', 'notes',
    ];
    EDITABLE.forEach(field => {
      if (payload[field] === undefined) return;
      if (field === 'datetime_start') {
        rowObj[field] = new Date(payload[field]).toISOString();
      } else if (field === 'duration_min') {
        rowObj[field] = Number(payload[field]);
      } else {
        rowObj[field] = String(payload[field]);
      }
    });

    const newRow = headers.map(h => rowObj[h]);
    sheet.getRange(i + 1, 1, 1, newRow.length).setValues([newRow]);
    invalidateSheetCache_(SHEETS.TEAM_SESSIONS);

    logAudit_(ctx, 'teamSessions.update', sessionId, 'Sessione aggiornata: "' + rowObj.title + '"', null);

    return ok(rowObj);
  }

  return fail('Sessione non trovata: ' + sessionId);
}

/**
 * teamSessions.remove — Elimina una sessione (hard delete, come
 * endurance.participants.remove — niente soft-delete per ora, non
 * serve storico su una sessione di allenamento cancellata).
 * Auth: richiesto ctx.isStaff.
 * @param {Object} payload - { session_id }
 */
function handleTeamSessionsRemove(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');
  if (!ctx.isStaff) return fail('Operazione riservata a staff o admin');

  payload = payload || {};
  const sessionId = String(payload.session_id || '').trim();
  if (!sessionId) return fail('session_id obbligatorio');

  const sheet = getSheet(SHEETS.TEAM_SESSIONS);
  if (!sheet) return fail('Tab TeamSessions non trovata');

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idIdx = headers.indexOf('session_id');
  const titleIdx = headers.indexOf('title');

  for (let i = 1; i < data.length; i++) {
    if (data[i][idIdx] !== sessionId) continue;
    const title = data[i][titleIdx];
    sheet.deleteRow(i + 1);
    invalidateSheetCache_(SHEETS.TEAM_SESSIONS);
    deleteSessionRsvpsForSession_(sessionId);

    logAudit_(ctx, 'teamSessions.remove', sessionId, 'Sessione eliminata: "' + title + '"', null);

    return ok({ deleted: true, session_id: sessionId });
  }

  return fail('Sessione non trovata: ' + sessionId);
}

// ═══════════════════════════════════════════════════════════
// FASE 2 — RSVP piloti per sessione
// ═══════════════════════════════════════════════════════════

/**
 * sessionRsvp.list — Tutte le risposte per una sessione. Visibile a
 * chiunque sia loggato (stesso criterio di rsvp.list per le gare):
 * serve al team, non solo allo staff, sapere chi ci sarà.
 * Auth: richiesta.
 * @param {Object} payload - { session_id }
 */
function handleSessionRsvpList(payload, ctx) {
  if (!ctx || !ctx.driver_id) return fail('Auth richiesto');

  payload = payload || {};
  const sessionId = String(payload.session_id || '').trim();
  if (!sessionId) return fail('session_id obbligatorio');

  const rows = sheetToObjects(SHEETS.SESSION_RSVPS).filter(r => r.session_id === sessionId);
  return ok({ rsvps: rows, count: rows.length });
}

/**
 * sessionRsvp.set — Il pilota loggato imposta/aggiorna la PROPRIA
 * risposta per una sessione. Upsert per (session_id, driver_id) — non
 * è possibile impostare la risposta di qualcun altro. Identico a
 * handleRsvpSet in RaceRSVP.js, solo su session_id invece di race_id.
 * Auth: richiesta.
 * @param {Object} payload - { session_id, status: 'confirmed'|'declined'|'tentative', note? }
 */
function handleSessionRsvpSet(payload, ctx) {
  if (!ctx || !ctx.driver_id) return fail('Auth richiesto');

  payload = payload || {};
  const sessionId = String(payload.session_id || '').trim();
  const status = String(payload.status || '').trim();
  if (!sessionId) return fail('session_id obbligatorio');
  if (SESSION_RSVP_STATUSES.indexOf(status) === -1) {
    return fail('status non valido — atteso uno tra: ' + SESSION_RSVP_STATUSES.join(', '));
  }

  const sheet = getSheet(SHEETS.SESSION_RSVPS);
  if (!sheet) return fail('Tab SessionRSVPs non trovata — esegui setupSessionRsvpTab() una volta');

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const sessionIdx = headers.indexOf('session_id');
  const driverIdx = headers.indexOf('driver_id');

  const now = new Date().toISOString();
  const note = String(payload.note || '');

  for (let i = 1; i < data.length; i++) {
    if (data[i][sessionIdx] === sessionId && data[i][driverIdx] === ctx.driver_id) {
      const rowObj = {};
      headers.forEach((h, j) => { rowObj[h] = data[i][j]; });
      rowObj.status = status;
      rowObj.note = note;
      rowObj.responded_at = now;
      const newRow = headers.map(h => (rowObj[h] !== undefined ? rowObj[h] : ''));
      sheet.getRange(i + 1, 1, 1, newRow.length).setValues([newRow]);
      return ok(rowObj);
    }
  }

  const rsvpId = 'srsvp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const row = {
    rsvp_id: rsvpId, session_id: sessionId, driver_id: ctx.driver_id,
    status, note, responded_at: now,
  };
  sheet.appendRow(SESSION_RSVP_HEADERS.map(h => row[h]));
  return ok(row);
}

/**
 * Cancella tutte le righe RSVP legate a una sessione eliminata — evita
 * righe orfane, stesso principio di deleteRsvpsForSession_ visto nel
 * pacchetto di handoff (adattato al nome tab reale SESSION_RSVPS).
 */
function deleteSessionRsvpsForSession_(sessionId) {
  const sheet = getSheet(SHEETS.SESSION_RSVPS);
  if (!sheet) return; // tab non ancora creata (setup non eseguito) — nessuna riga da pulire
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const sessionIdx = headers.indexOf('session_id');

  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][sessionIdx] === sessionId) sheet.deleteRow(i + 1);
  }
}
