// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Treasury (Cassa / Rendiconto)
// ═══════════════════════════════════════════════════════════
// Registro entrate/uscite della cassa team (donazioni community, spese
// per Race Control, materiali, ecc.). Nasce come sostituto in-app del
// foglio Google esterno "Rendiconto Comunity Virtual Sim-Driver",
// tenuto a mano fino a settembre 2026.
//
// Dato sensibile: SOLO admin/Team Principal può leggere o scrivere
// (stesso pattern di SocialManager.js — ctx.isAdmin, non ctx.isStaff).
//
// Convenzione importi: amount è SEMPRE positivo. Il segno si ricava da
// `type` ('entrata' | 'uscita'), mai memorizzato come numero negativo —
// il foglio Google originale nascondeva un segno negativo nella
// formattazione della colonna Importo per le uscite, fonte di confusione
// più volte riscontrata a mano. Qui non può succedere.
//
// Setup: setupTreasuryTab() — editor Apps Script → dropdown funzioni →
// ▶ Esegui (una volta sola, idempotente).
//
// Migrazione dati storici: migrateTreasuryFromRendicontoSheet() — da
// eseguire una volta sola dopo setupTreasuryTab(), copia le righe del
// foglio esterno "Rendiconto Comunity Virtual Sim-Driver" (tab
// "Riepilogo", A2:G) nella nuova tab Treasury. Vedi commento sulla
// funzione per l'ID del foglio sorgente.
//
// Registrate in Codice.js dispatcher come:
// 'treasury.list': handleTreasuryList
// 'treasury.add': handleTreasuryAdd
// 'treasury.update': handleTreasuryUpdate
// 'treasury.remove': handleTreasuryRemove
// ═══════════════════════════════════════════════════════════

const TREASURY_HEADERS = [
  'entry_id', 'date', 'type', 'amount', 'counterparty', 'description',
  'created_at', 'updated_at', 'updated_by',
];

const TREASURY_TYPES = ['entrata', 'uscita'];
const TREASURY_EDITABLE_FIELDS = ['date', 'type', 'amount', 'counterparty', 'description'];

function setupTreasuryTab() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEETS.TREASURY);
  if (sheet) {
    Logger.log('✓ Tab "' + SHEETS.TREASURY + '" già esistente, nessuna modifica.');
    return;
  }
  sheet = ss.insertSheet(SHEETS.TREASURY);
  sheet.getRange(1, 1, 1, TREASURY_HEADERS.length).setValues([TREASURY_HEADERS]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, TREASURY_HEADERS.length).setFontWeight('bold');
  Logger.log('✅ Tab "' + SHEETS.TREASURY + '" creata con ' + TREASURY_HEADERS.length + ' colonne.');
}

/**
 * Migrazione one-shot dal foglio Google esterno "Rendiconto Comunity
 * Virtual Sim-Driver" (tab "Riepilogo") alla tab Treasury di VSD_HUB_DB.
 * Da eseguire UNA VOLTA SOLA dopo setupTreasuryTab(), a mano dall'editor
 * Apps Script. Non idempotente in automatico: se la tab Treasury ha già
 * righe, si ferma per evitare doppioni — svuotarla manualmente (tenendo
 * solo l'header) prima di rilanciarla se serve ripetere l'import.
 *
 * Colonne sorgente attese (A2:G, sheet "Riepilogo"):
 * A Data | B Tipo ('Entrata'/'Uscita') | C Importo | D Provenienza |
 * E Destinatario | F Descrizione | G Saldo (ignorata, era una colonna
 * calcolata progressiva sul foglio originale, qui il saldo si calcola
 * sempre live dai movimenti, mai salvato come colonna).
 */
function migrateTreasuryFromRendicontoSheet() {
  const RENDICONTO_SHEET_ID = '1U8xtuX-78bPGtK03c-wY6niCuP23nX0Tq_XstiT2XaI';
  const RENDICONTO_TAB = 'Riepilogo';

  const treasurySheet = getSheet(SHEETS.TREASURY);
  const existingRows = treasurySheet.getDataRange().getValues().length - 1;
  if (existingRows > 0) {
    Logger.log('⚠️ Tab Treasury ha già ' + existingRows + ' righe — migrazione annullata ' +
      'per evitare doppioni. Svuotala (tenendo solo l\'header) e rilancia se vuoi ripetere.');
    return;
  }

  const src = SpreadsheetApp.openById(RENDICONTO_SHEET_ID).getSheetByName(RENDICONTO_TAB);
  if (!src) throw new Error('Tab "' + RENDICONTO_TAB + '" non trovata nel foglio Rendiconto');

  const data = src.getDataRange().getValues();
  const now = new Date().toISOString();
  let imported = 0;

  for (let i = 1; i < data.length; i++) {
    const [dataRaw, tipoRaw, importoRaw, provenienza, destinatario, descrizione] = data[i];
    if (!dataRaw && !tipoRaw) continue; // riga vuota

    const tipo = String(tipoRaw || '').trim().toLowerCase();
    if (TREASURY_TYPES.indexOf(tipo) === -1) {
      Logger.log('⚠️ Riga ' + (i + 1) + ' saltata — tipo non riconosciuto: "' + tipoRaw + '"');
      continue;
    }

    const dateVal = dataRaw instanceof Date ? dataRaw.toISOString() : String(dataRaw || '');
    const amount = Math.abs(Number(importoRaw) || 0);
    // Entrata → Provenienza (chi versa). Uscita → Destinatario (chi riceve).
    const counterparty = tipo === 'entrata' ? String(provenienza || '') : String(destinatario || '');
    const entryId = 'txn_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

    const row = {
      entry_id: entryId,
      date: dateVal,
      type: tipo,
      amount: amount,
      counterparty: counterparty,
      description: String(descrizione || ''),
      created_at: now,
      updated_at: now,
      updated_by: 'migrazione',
    };
    treasurySheet.appendRow(TREASURY_HEADERS.map(h => row[h]));
    imported++;
  }

  Logger.log('✅ Migrazione completata: ' + imported + ' movimenti importati in "' + SHEETS.TREASURY + '".');
}

/**
 * treasury.list — Tutti i movimenti, filtro opzionale per tipo.
 * Auth: admin.
 */
function handleTreasuryList(payload, ctx) {
  if (!ctx || !ctx.isAdmin) return fail('Accesso riservato ad admin/team principal');

  let entries = sheetToObjects(SHEETS.TREASURY);
  const typeFilter = payload && payload.type;
  if (typeFilter) entries = entries.filter(e => e.type === typeFilter);

  entries.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  const totalIn = entries.filter(e => e.type === 'entrata')
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const totalOut = entries.filter(e => e.type === 'uscita')
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  return ok({
    entries,
    count: entries.length,
    totalIn,
    totalOut,
    balance: totalIn - totalOut,
  });
}

/**
 * treasury.add — Nuovo movimento (entrata o uscita).
 * Auth: admin.
 * @param {Object} payload - { date, type, amount, counterparty, description? }
 */
function handleTreasuryAdd(payload, ctx) {
  if (!ctx || !ctx.isAdmin) return fail('Accesso riservato ad admin/team principal');

  payload = payload || {};
  const type = String(payload.type || '').trim().toLowerCase();
  if (TREASURY_TYPES.indexOf(type) === -1) {
    return fail('type non valido — atteso uno tra: ' + TREASURY_TYPES.join(', '));
  }
  const amount = Number(payload.amount);
  if (!amount || amount <= 0) return fail('amount deve essere un numero positivo');
  const counterparty = String(payload.counterparty || '').trim();
  if (!counterparty) return fail('counterparty obbligatorio (chi versa / chi riceve)');
  const date = String(payload.date || '').trim();
  if (!date) return fail('date obbligatoria');

  const sheet = getSheet(SHEETS.TREASURY);
  if (!sheet) return fail('Tab Treasury non trovata — esegui setupTreasuryTab() una volta');

  const entryId = 'txn_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const now = new Date().toISOString();
  const row = {
    entry_id: entryId,
    date,
    type,
    amount,
    counterparty,
    description: String(payload.description || ''),
    created_at: now,
    updated_at: now,
    updated_by: ctx.driver_id || '',
  };
  sheet.appendRow(TREASURY_HEADERS.map(h => row[h]));

  logAudit_(ctx, 'treasury.add', entryId,
    (type === 'entrata' ? 'Entrata' : 'Uscita') + ' € ' + amount + ' — ' + counterparty, null);

  return ok(row);
}

/**
 * treasury.update — Aggiorna uno o più campi di un movimento.
 * Auth: admin.
 * @param {Object} payload - { entry_id, ...campi da TREASURY_EDITABLE_FIELDS }
 */
function handleTreasuryUpdate(payload, ctx) {
  if (!ctx || !ctx.isAdmin) return fail('Accesso riservato ad admin/team principal');

  payload = payload || {};
  const entryId = String(payload.entry_id || '').trim();
  if (!entryId) return fail('entry_id obbligatorio');

  if (payload.type !== undefined && TREASURY_TYPES.indexOf(String(payload.type).toLowerCase()) === -1) {
    return fail('type non valido — atteso uno tra: ' + TREASURY_TYPES.join(', '));
  }
  if (payload.amount !== undefined && (!Number(payload.amount) || Number(payload.amount) <= 0)) {
    return fail('amount deve essere un numero positivo');
  }

  const sheet = getSheet(SHEETS.TREASURY);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idIdx = headers.indexOf('entry_id');
  if (idIdx < 0) return fail('Colonna entry_id mancante in Treasury');

  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][idIdx] === entryId) { rowIndex = i; break; }
  }
  if (rowIndex < 0) return fail('Movimento non trovato: ' + entryId);

  const rowObj = {};
  headers.forEach((h, i) => { rowObj[h] = data[rowIndex][i]; });
  const before = 'importo € ' + rowObj.amount + ', tipo ' + rowObj.type;

  TREASURY_EDITABLE_FIELDS.forEach(field => {
    if (payload[field] === undefined) return;
    rowObj[field] = field === 'type' ? String(payload[field]).toLowerCase()
      : field === 'amount' ? Number(payload[field])
      : String(payload[field]);
  });
  rowObj.updated_at = new Date().toISOString();
  rowObj.updated_by = ctx.driver_id || '';

  const newRow = headers.map(h => (rowObj[h] !== undefined ? rowObj[h] : ''));
  sheet.getRange(rowIndex + 1, 1, 1, newRow.length).setValues([newRow]);

  logAudit_(ctx, 'treasury.update', entryId,
    'Movimento aggiornato (' + before + ' → importo € ' + rowObj.amount + ', tipo ' + rowObj.type + ')', null);

  return ok(rowObj);
}

/**
 * treasury.remove — Cancella un movimento (es. voce inserita per errore).
 * Auth: admin.
 */
function handleTreasuryRemove(payload, ctx) {
  if (!ctx || !ctx.isAdmin) return fail('Accesso riservato ad admin/team principal');

  payload = payload || {};
  const entryId = String(payload.entry_id || '').trim();
  if (!entryId) return fail('entry_id obbligatorio');

  const sheet = getSheet(SHEETS.TREASURY);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idIdx = headers.indexOf('entry_id');

  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][idIdx] === entryId) { rowIndex = i; break; }
  }
  if (rowIndex < 0) return fail('Movimento non trovato: ' + entryId);

  const summary = 'importo € ' + data[rowIndex][headers.indexOf('amount')] +
    ', ' + data[rowIndex][headers.indexOf('counterparty')];
  sheet.deleteRow(rowIndex + 1);

  logAudit_(ctx, 'treasury.remove', entryId, 'Movimento cancellato: ' + summary, null);

  return ok({ deleted: true, entry_id: entryId });
}
