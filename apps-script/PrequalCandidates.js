// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Candidati in prequalifica (campionati esterni)
// ═══════════════════════════════════════════════════════════
// Sostituisce l'array hardcoded PREQUALIFICHE_ENTRIES che viveva in
// AciLmgt3Challenge.jsx (14 set 2026): prima ogni aggiunta/rimozione di
// un pilota "in verifica" sull'entry list esterna richiedeva un edit di
// codice + redeploy. Qui è invece un elenco a sheet, gestibile dallo
// staff direttamente dalla pagina pubblica (form + bottone ✕ su ogni
// card, visibili solo se isStaff) — nessun redeploy per aggiungere o
// togliere un nome.
//
// Generico per championship_key (stesso pattern di
// ChampionshipInterest.js), così è riusabile anche per EraSeason3 o
// futuri campionati esterni, non solo ACI LMGT3 Challenge.
//
// Sheet PrequalCandidates:
//   candidate_id | championship_key | name | car_number | created_at | created_by
//
// Action registrate in Codice.js:
//   'prequal.list'   handlePrequalList    (pubblico)
//   'prequal.add'    handlePrequalAdd     (staff)
//   'prequal.remove' handlePrequalRemove  (staff)
//
// Setup: setupPrequalCandidatesTab() — editor Apps Script → dropdown
// funzioni → ▶ Esegui (una volta sola, idempotente).
// ═══════════════════════════════════════════════════════════

const PREQUAL_CANDIDATES_HEADERS = [
  'candidate_id', 'championship_key', 'name', 'car_number', 'created_at', 'created_by',
];

function setupPrequalCandidatesTab() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEETS.PREQUAL_CANDIDATES);
  if (sheet) {
    Logger.log('✓ Tab "' + SHEETS.PREQUAL_CANDIDATES + '" già esistente, nessuna modifica.');
    return;
  }
  sheet = ss.insertSheet(SHEETS.PREQUAL_CANDIDATES);
  sheet.getRange(1, 1, 1, PREQUAL_CANDIDATES_HEADERS.length).setValues([PREQUAL_CANDIDATES_HEADERS]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, PREQUAL_CANDIDATES_HEADERS.length).setFontWeight('bold');
  Logger.log('✅ Tab "' + SHEETS.PREQUAL_CANDIDATES + '" creata con ' + PREQUAL_CANDIDATES_HEADERS.length + ' colonne.');
}

function prequalGenerateId_() {
  return 'preq_' + Utilities.getUuid().replace(/-/g, '').substring(0, 10);
}

/**
 * prequal.list — elenco candidati in prequalifica per un campionato.
 * Auth: nessuna (visibilità pubblica, sono già nomi su un'entry list
 * pubblica esterna).
 * @param {Object} payload - { championship_key }
 */
function handlePrequalList(payload, ctx) {
  payload = payload || {};
  const key = String(payload.championship_key || '').trim();
  if (!key) return fail('championship_key obbligatorio');

  const all = sheetToObjects(SHEETS.PREQUAL_CANDIDATES)
    .filter(c => String(c.championship_key || '').trim() === key)
    .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));

  const candidates = all.map(c => ({
    candidate_id: c.candidate_id,
    name: c.name,
    car_number: c.car_number,
  }));

  return ok({ candidates, count: candidates.length });
}

/**
 * prequal.add — aggiunge un candidato all'elenco. Auth: staff.
 * @param {Object} payload - { championship_key, name, car_number }
 */
function handlePrequalAdd(payload, ctx) {
  if (!ctx || !ctx.isStaff) return fail('Accesso riservato allo staff');

  payload = payload || {};
  const key = String(payload.championship_key || '').trim();
  if (!key) return fail('championship_key obbligatorio');
  const name = String(payload.name || '').trim();
  if (!name) return fail('Nome obbligatorio');
  const carNumber = String(payload.car_number || '').trim();

  const sheet = getSheet(SHEETS.PREQUAL_CANDIDATES);
  if (!sheet) return fail('Tab PrequalCandidates non trovata — esegui setupPrequalCandidatesTab() una volta');

  const candidateId = prequalGenerateId_();
  const now = new Date().toISOString();
  const row = {
    candidate_id: candidateId,
    championship_key: key,
    name: name,
    car_number: carNumber,
    created_at: now,
    created_by: ctx.driver_id || '',
  };
  sheet.appendRow(PREQUAL_CANDIDATES_HEADERS.map(h => row[h]));

  return ok({ candidate_id: candidateId, name: name, car_number: carNumber });
}

/**
 * prequal.remove — rimuove un candidato dall'elenco (hard delete: non è
 * uno storico da conservare, solo un elenco "chi ci prova adesso").
 * Auth: staff.
 * @param {Object} payload - { candidate_id }
 */
function handlePrequalRemove(payload, ctx) {
  if (!ctx || !ctx.isStaff) return fail('Accesso riservato allo staff');

  payload = payload || {};
  const candidateId = String(payload.candidate_id || '').trim();
  if (!candidateId) return fail('candidate_id obbligatorio');

  const sheet = getSheet(SHEETS.PREQUAL_CANDIDATES);
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
