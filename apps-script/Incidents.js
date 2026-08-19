// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Registro incidenti / steward
// ═══════════════════════════════════════════════════════════
// I piloti continuano a segnalare tramite il Google Form pubblico già
// in uso ("VSD - Modulo reclamo") — questo file NON tocca né sostituisce
// quel flusso. Legge SOLO IN LETTURA le risposte da quella spreadsheet
// esterna (mai scrittura: è lo storico ufficiale del Form, va lasciato
// intatto) e affianca una tab interna a VSD_HUB ("IncidentResolutions")
// dove lo staff formalizza stato e penalità.
//
// RECLAMI_SPREADSHEET_ID: spreadsheet "VSD - Modulo reclamo (Risposte)".
// Il primo sheet della spreadsheet è quello collegato al Form (nome di
// default "Risposte del modulo 1"/"Form Responses 1" a seconda del
// locale) — usiamo il PRIMO sheet per posizione, non per nome, così
// funziona a prescindere dal locale/rinominazioni.
//
// Le colonne del Form sono lette per POSIZIONE (non per stringa header)
// perché gli header reali hanno spazi doppi/refusi ("apparte" invece di
// "appare") che li rendono fragili da matchare per testo. L'ordine delle
// colonne di un Form è stabile: aggiungere domande nuove le accoda in
// fondo, non riordina quelle esistenti.
//   0: Informazioni cronologiche (timestamp invio)
//   1: Data gara
//   2: Pilota che presenta reclamo (nome sul simulatore)
//   3: Pilota che presenta reclamo (nome Discord, se diverso)
//   4: Pilota verso cui si reclama (nome sul simulatore)
//   5: Circuito / Tracciato
//   6: Accaduto al giro num.
//   7: Accaduto al minuto:secondo
//   8: Tipologia dell'incidente
//   9: Descrizione completa dell'evento
//  10: Giudizio DG (verdetto scritto a mano dallo staff, testo libero)
//  11: Eng (traduzione inglese del verdetto, se compilata)
//
// Setup: setupIncidentResolutionsTab() — editor Apps Script → ▶ Esegui
// (una tantum, idempotente).
//
// Registrate in Codice.js dispatcher come:
//   'incidents.list':    handleIncidentsList
//   'incidents.resolve': handleIncidentsResolve
// ═══════════════════════════════════════════════════════════

const RECLAMI_SPREADSHEET_ID = '1_ECqjF2ljeNr5ImO2W6YSaR9BEKTEjTMiQdIHDSS3YU';

const RECLAMO_COL = {
  TIMESTAMP: 0,
  RACE_DATE: 1,
  REPORTER_SIM: 2,
  REPORTER_DISCORD: 3,
  AGAINST: 4,
  TRACK: 5,
  LAP: 6,
  TIME_IN_RACE: 7,
  INCIDENT_TYPE: 8,
  DESCRIPTION: 9,
  VERDICT: 10,
  VERDICT_EN: 11,
};

const INCIDENT_RESOLUTION_HEADERS = [
  'complaint_key', 'status', 'penalty_type', 'penalty_detail', 'staff_notes',
  'resolved_by', 'resolved_at', 'evidence_url',
];
const INCIDENT_STATUSES = ['open', 'reviewing', 'closed'];

function setupIncidentResolutionsTab() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEETS.INCIDENT_RESOLUTIONS);
  if (sheet) {
    Logger.log('✓ Tab "' + SHEETS.INCIDENT_RESOLUTIONS + '" già esistente, nessuna modifica.');
    return;
  }
  sheet = ss.insertSheet(SHEETS.INCIDENT_RESOLUTIONS);
  sheet.getRange(1, 1, 1, INCIDENT_RESOLUTION_HEADERS.length).setValues([INCIDENT_RESOLUTION_HEADERS]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, INCIDENT_RESOLUTION_HEADERS.length).setFontWeight('bold');
  Logger.log('✅ Tab "' + SHEETS.INCIDENT_RESOLUTIONS + '" creata con ' + INCIDENT_RESOLUTION_HEADERS.length + ' colonne.');
}

/**
 * Migrazione one-shot: aggiunge la colonna "evidence_url" a una tab
 * IncidentResolutions GIÀ ESISTENTE (creata prima che questo campo
 * esistesse). Idempotente: se la colonna c'è già, non fa nulla.
 * Va sempre in fondo (ultima colonna) — stesso ordine fisico atteso da
 * INCIDENT_RESOLUTION_HEADERS, da cui NON va spostata: handleIncidentsResolve
 * usa quell'ordine per gli append di nuove righe.
 *
 * Editor Apps Script → seleziona questa funzione → ▶ Esegui (una tantum).
 */
function setupIncidentResolutionsEvidenceColumn() {
  const sheet = getSheet(SHEETS.INCIDENT_RESOLUTIONS);
  if (!sheet) {
    Logger.log('⚠️  Tab IncidentResolutions non trovata — esegui prima setupIncidentResolutionsTab().');
    return;
  }
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (headers.indexOf('evidence_url') !== -1) {
    Logger.log('✓ Colonna "evidence_url" già esistente, nessuna modifica.');
    return;
  }
  const nextCol = sheet.getLastColumn() + 1;
  sheet.getRange(1, nextCol).setValue('evidence_url').setFontWeight('bold');
  Logger.log('✅ Colonna "evidence_url" aggiunta in posizione ' + nextCol + '.');
}

/**
 * Legge (sola lettura) le risposte del Modulo reclamo. Non scrive mai
 * su questa spreadsheet — è lo storico del Form, va lasciato intatto.
 */
function readReclamiRows_() {
  const ss = SpreadsheetApp.openById(RECLAMI_SPREADSHEET_ID);
  const sheet = ss.getSheets()[0];
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  const driverNameMap = buildDriverNameMap_();
  const rows = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const timestamp = String(row[RECLAMO_COL.TIMESTAMP] || '').trim();
    // Chiave stabile per riga: il timestamp del Form se c'è (unico per
    // costruzione), altrimenti l'indice di riga come fallback (le righe
    // del Form si accodano sempre in fondo, l'indice resta stabile nel
    // tempo salvo riordini manuali della sheet, che non ci aspettiamo).
    const complaintKey = timestamp || ('row' + i);

    const reporterSim = String(row[RECLAMO_COL.REPORTER_SIM] || '').trim();
    const against = String(row[RECLAMO_COL.AGAINST] || '').trim();
    const verdict = String(row[RECLAMO_COL.VERDICT] || '').trim();

    if (!reporterSim && !against) continue; // riga vuota, salta

    rows.push({
      complaint_key: complaintKey,
      timestamp,
      race_date: row[RECLAMO_COL.RACE_DATE] || '',
      reporter_sim: reporterSim,
      reporter_discord: String(row[RECLAMO_COL.REPORTER_DISCORD] || '').trim(),
      reporter_driver_id: matchDriverName_(reporterSim, driverNameMap) || '',
      against: against,
      against_driver_id: matchDriverName_(against, driverNameMap) || '',
      track: row[RECLAMO_COL.TRACK] || '',
      lap: row[RECLAMO_COL.LAP] || '',
      time_in_race: row[RECLAMO_COL.TIME_IN_RACE] || '',
      incident_type: row[RECLAMO_COL.INCIDENT_TYPE] || '',
      description: row[RECLAMO_COL.DESCRIPTION] || '',
      verdict,
      verdict_en: String(row[RECLAMO_COL.VERDICT_EN] || '').trim(),
    });
  }
  return rows;
}

/**
 * incidents.list — Unisce le segnalazioni del Modulo reclamo (sola
 * lettura) con lo stato formalizzato dallo staff in IncidentResolutions.
 * Se non esiste ancora una risoluzione per una segnalazione, lo stato è
 * derivato: 'closed' se il Giudizio DG è già compilato (verdetto
 * storico, mai formalizzato in stato/penalità strutturati), altrimenti
 * 'open'.
 *
 * Auth: staff vede TUTTO il registro. Un pilota loggato (non staff) vede
 * SOLO le segnalazioni che lo riguardano — come parte segnalante o come
 * parte segnalata — mai quelle tra altri due piloti. Su questa vista
 * ridotta i campi `staff_notes` (deliberazione interna) e
 * `reporter_discord` restano nascosti, anche quando il pilota è lui
 * stesso il segnalante.
 *
 * @param {Object} payload - { status? }
 */
function handleIncidentsList(payload, ctx) {
  if (!ctx || !ctx.driver_id) return fail('Auth richiesto');

  let complaints;
  try {
    complaints = readReclamiRows_();
  } catch (e) {
    return fail('Impossibile leggere il Modulo reclamo: ' + e.message);
  }

  const resolutions = sheetToObjects(SHEETS.INCIDENT_RESOLUTIONS);
  const resByKey = {};
  resolutions.forEach(r => { resByKey[r.complaint_key] = r; });

  let incidents = complaints.map(c => {
    const res = resByKey[c.complaint_key];
    const status = res ? res.status : (c.verdict ? 'closed' : 'open');
    return {
      ...c,
      status,
      penalty_type: res ? res.penalty_type : '',
      penalty_detail: res ? res.penalty_detail : '',
      staff_notes: res ? res.staff_notes : '',
      resolved_by: res ? res.resolved_by : '',
      resolved_at: res ? res.resolved_at : '',
      evidence_url: res ? res.evidence_url : '',
      formalized: !!res,
    };
  });

  if (!ctx.isStaff) {
    incidents = incidents
      .filter(i => i.reporter_driver_id === ctx.driver_id || i.against_driver_id === ctx.driver_id)
      .map(i => {
        const { staff_notes, reporter_discord, ...visible } = i;
        return visible;
      });
  }

  const statusFilter = payload && payload.status;
  if (statusFilter) incidents = incidents.filter(i => i.status === statusFilter);

  // Aperti prima (sono quelli che richiedono attenzione), poi per data
  // decrescente all'interno dello stesso stato.
  incidents.sort((a, b) => {
    if (a.status === 'open' && b.status !== 'open') return -1;
    if (a.status !== 'open' && b.status === 'open') return 1;
    return String(b.timestamp || '').localeCompare(String(a.timestamp || ''));
  });

  return ok({ incidents, count: incidents.length });
}

/**
 * incidents.resolve — Lo staff formalizza stato/penalità per una
 * segnalazione. Upsert per complaint_key nella tab IncidentResolutions
 * — non scrive mai sulla spreadsheet del Modulo reclamo.
 *
 * evidence_url: link opzionale a una clip (Twitch/YouTube/Discord) usata
 * come prova per la decisione — a differenza di staff_notes, è VISIBILE
 * anche ai piloti coinvolti (non solo staff), non è una nota interna.
 *
 * Auth: staff.
 * @param {Object} payload - { complaint_key, status, penalty_type?, penalty_detail?, staff_notes?, evidence_url? }
 */
function handleIncidentsResolve(payload, ctx) {
  if (!ctx || !ctx.isStaff) return fail('Accesso riservato allo staff');

  payload = payload || {};
  const complaintKey = String(payload.complaint_key || '').trim();
  const status = String(payload.status || '').trim();
  if (!complaintKey) return fail('complaint_key obbligatorio');
  if (INCIDENT_STATUSES.indexOf(status) === -1) {
    return fail('status non valido — atteso uno tra: ' + INCIDENT_STATUSES.join(', '));
  }

  const sheet = getSheet(SHEETS.INCIDENT_RESOLUTIONS);
  if (!sheet) return fail('Tab IncidentResolutions non trovata — esegui setupIncidentResolutionsTab() una volta');

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const keyIdx = headers.indexOf('complaint_key');
  const now = new Date().toISOString();

  const row = {
    complaint_key: complaintKey,
    status,
    penalty_type: String(payload.penalty_type || ''),
    penalty_detail: String(payload.penalty_detail || ''),
    staff_notes: String(payload.staff_notes || ''),
    resolved_by: ctx.driver_id || '',
    resolved_at: now,
    evidence_url: String(payload.evidence_url || '').trim().slice(0, 500),
  };

  // Per l'embed Discord servono i dati della segnalazione originale
  // (chi contro chi, su quale pista) — recuperati in sola lettura dal
  // Modulo reclamo, mai scritti.
  let complaintContext = null;
  try {
    complaintContext = readReclamiRows_().find(c => c.complaint_key === complaintKey) || null;
  } catch (e) {
    Logger.log('⚠️  Impossibile recuperare il contesto per la notifica (non-blocking): ' + e.message);
  }

  for (let i = 1; i < data.length; i++) {
    if (data[i][keyIdx] === complaintKey) {
      const newRow = headers.map(h => (row[h] !== undefined ? row[h] : ''));
      sheet.getRange(i + 1, 1, 1, newRow.length).setValues([newRow]);
      logAudit_(ctx, 'incidents.resolve', complaintKey, 'Incidente aggiornato: stato → ' + status, null);
      notifyIncidentResolved_({ ...complaintContext, ...row });
      notifyIncidentResolvedPush_({ ...complaintContext, ...row });
      return ok(row);
    }
  }

  sheet.appendRow(INCIDENT_RESOLUTION_HEADERS.map(h => row[h]));
  logAudit_(ctx, 'incidents.resolve', complaintKey, 'Incidente formalizzato: stato → ' + status, null);
  notifyIncidentResolved_({ ...complaintContext, ...row });
  notifyIncidentResolvedPush_({ ...complaintContext, ...row });
  return ok(row);
}
