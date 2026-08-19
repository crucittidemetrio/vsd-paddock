// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Candidates (pipeline candidature)
// ═══════════════════════════════════════════════════════════
// Traccia i candidati attraverso il processo di selezione dello staff.
// AFFIANCA il Google Form pubblico già linkato da /joinus (JOIN_FORM_URL
// in JoinUs.jsx) — non lo sostituisce. Il form resta il punto di
// ingresso per i candidati esterni; questo è lo strumento INTERNO con
// cui lo staff tiene traccia di dove sta ciascuna candidatura (appena
// arrivata, contattata, in prova, accettata, rifiutata), a prescindere
// da come sia arrivata (form, Discord, passaparola).
//
// Nessun collegamento automatico alle risposte del Google Form: lo
// staff aggiunge a mano i candidati promettenti dopo averli visti nelle
// risposte del form (nessuna API Google Forms coinvolta).
//
// Setup: setupCandidatesTab() — editor Apps Script → dropdown funzioni →
// ▶ Esegui (una volta sola, idempotente).
//
// Registrate in Codice.js dispatcher come:
//   'candidates.list':   handleCandidatesList
//   'candidates.add':    handleCandidatesAdd
//   'candidates.update': handleCandidatesUpdate
//   'candidates.remove': handleCandidatesRemove
// ═══════════════════════════════════════════════════════════

const CANDIDATE_HEADERS = [
  'candidate_id', 'display_name', 'discord_username', 'contact',
  'sim_preference', 'source', 'status', 'notes',
  'created_at', 'updated_at', 'updated_by',
];

const CANDIDATE_STATUSES = ['new', 'contacted', 'trial', 'accepted', 'rejected'];
const CANDIDATE_EDITABLE_FIELDS = [
  'display_name', 'discord_username', 'contact',
  'sim_preference', 'source', 'status', 'notes',
];

function setupCandidatesTab() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEETS.CANDIDATES);
  if (sheet) {
    Logger.log('✓ Tab "' + SHEETS.CANDIDATES + '" già esistente, nessuna modifica.');
    return;
  }
  sheet = ss.insertSheet(SHEETS.CANDIDATES);
  sheet.getRange(1, 1, 1, CANDIDATE_HEADERS.length).setValues([CANDIDATE_HEADERS]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, CANDIDATE_HEADERS.length).setFontWeight('bold');
  Logger.log('✅ Tab "' + SHEETS.CANDIDATES + '" creata con ' + CANDIDATE_HEADERS.length + ' colonne.');
}

/**
 * candidates.list — Tutti i candidati, filtro opzionale per stato.
 * Auth: staff.
 */
function handleCandidatesList(payload, ctx) {
  if (!ctx || !ctx.isStaff) return fail('Accesso riservato allo staff');

  let candidates = sheetToObjects(SHEETS.CANDIDATES);
  const statusFilter = payload && payload.status;
  if (statusFilter) candidates = candidates.filter(c => c.status === statusFilter);

  candidates.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

  return ok({ candidates, count: candidates.length });
}

/**
 * candidates.add — Nuovo candidato, stato iniziale sempre 'new'.
 * Auth: staff.
 * @param {Object} payload - { display_name, discord_username?, contact?,
 *   sim_preference?, source?, notes? }
 */
function handleCandidatesAdd(payload, ctx) {
  if (!ctx || !ctx.isStaff) return fail('Accesso riservato allo staff');

  payload = payload || {};
  const displayName = String(payload.display_name || '').trim();
  if (!displayName) return fail('display_name obbligatorio');

  const sheet = getSheet(SHEETS.CANDIDATES);
  if (!sheet) return fail('Tab Candidates non trovata — esegui setupCandidatesTab() una volta');

  const candidateId = 'cand_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const now = new Date().toISOString();
  const row = {
    candidate_id: candidateId,
    display_name: displayName,
    discord_username: String(payload.discord_username || ''),
    contact: String(payload.contact || ''),
    sim_preference: String(payload.sim_preference || ''),
    source: String(payload.source || 'Google Form'),
    status: 'new',
    notes: String(payload.notes || ''),
    created_at: now,
    updated_at: now,
    updated_by: ctx.driver_id || '',
  };
  sheet.appendRow(CANDIDATE_HEADERS.map(h => row[h]));

  logAudit_(ctx, 'candidates.add', candidateId,
    'Nuovo candidato: ' + displayName + ' (fonte: ' + row.source + ')', null);

  notifyNewCandidate_(row);

  return ok(row);
}

/**
 * candidates.update — Aggiorna uno o più campi (inclusi status/notes).
 * Auth: staff.
 * @param {Object} payload - { candidate_id, ...campi da CANDIDATE_EDITABLE_FIELDS }
 */
function handleCandidatesUpdate(payload, ctx) {
  if (!ctx || !ctx.isStaff) return fail('Accesso riservato allo staff');

  payload = payload || {};
  const candidateId = String(payload.candidate_id || '').trim();
  if (!candidateId) return fail('candidate_id obbligatorio');

  if (payload.status !== undefined && CANDIDATE_STATUSES.indexOf(payload.status) === -1) {
    return fail('status non valido — atteso uno tra: ' + CANDIDATE_STATUSES.join(', '));
  }

  const sheet = getSheet(SHEETS.CANDIDATES);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idIdx = headers.indexOf('candidate_id');
  if (idIdx < 0) return fail('Colonna candidate_id mancante in Candidates');

  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][idIdx] === candidateId) { rowIndex = i; break; }
  }
  if (rowIndex < 0) return fail('Candidato non trovato: ' + candidateId);

  const rowObj = {};
  headers.forEach((h, i) => { rowObj[h] = data[rowIndex][i]; });
  const prevStatus = rowObj.status;

  CANDIDATE_EDITABLE_FIELDS.forEach(field => {
    if (payload[field] !== undefined) rowObj[field] = String(payload[field]);
  });
  rowObj.updated_at = new Date().toISOString();
  rowObj.updated_by = ctx.driver_id || '';

  const newRow = headers.map(h => (rowObj[h] !== undefined ? rowObj[h] : ''));
  sheet.getRange(rowIndex + 1, 1, 1, newRow.length).setValues([newRow]);

  // Un cambio di stato è una decisione vera (specie accettato/rifiutato)
  // — vale la pena tracciarla nel registro di controllo.
  if (payload.status !== undefined && payload.status !== prevStatus) {
    logAudit_(ctx, 'candidates.update', candidateId,
      'Candidato ' + rowObj.display_name + ': stato ' + prevStatus + ' → ' + rowObj.status, null);
  }

  return ok(rowObj);
}

/**
 * candidates.remove — Cancella un candidato (es. duplicato/spam).
 * Auth: staff.
 */
function handleCandidatesRemove(payload, ctx) {
  if (!ctx || !ctx.isStaff) return fail('Accesso riservato allo staff');

  payload = payload || {};
  const candidateId = String(payload.candidate_id || '').trim();
  if (!candidateId) return fail('candidate_id obbligatorio');

  const sheet = getSheet(SHEETS.CANDIDATES);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idIdx = headers.indexOf('candidate_id');

  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][idIdx] === candidateId) { rowIndex = i; break; }
  }
  if (rowIndex < 0) return fail('Candidato non trovato: ' + candidateId);

  sheet.deleteRow(rowIndex + 1);
  return ok({ deleted: true, candidate_id: candidateId });
}
