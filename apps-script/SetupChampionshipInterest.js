// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Manifestazione di interesse: setup tab
// ═══════════════════════════════════════════════════════════
// Crea il tab "ChampionshipInterest" (vedi ChampionshipInterest.js
// per la logica) nel database. Idempotente: skip se già esistente.
//
// Esecuzione: editor Apps Script → dropdown funzioni →
//             setupChampionshipInterestTab → ▶ Esegui (una volta sola).
//
// Migrazione colonna "category" (aggiunta dopo la creazione iniziale
// del tab): editor Apps Script → dropdown funzioni →
//           migrateChampionshipInterestAddCategory → ▶ Esegui
//           (una volta sola, idempotente — skip se già presente).
// ═══════════════════════════════════════════════════════════

const CHAMPIONSHIP_INTEREST_HEADERS = [
  'interest_id',
  'championship_key',
  'driver_id',
  'display_name',
  'category',
  'vehicle',
  'discord_handle',
  'note',
  'registered_at',
  'status',
];

function setupChampionshipInterestTab() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tabName = 'ChampionshipInterest';

  let sheet = ss.getSheetByName(tabName);
  if (sheet) {
    Logger.log(`⚠  Tab "${tabName}" già esistente — skip`);
    return;
  }

  sheet = ss.insertSheet(tabName);
  sheet.getRange(1, 1, 1, CHAMPIONSHIP_INTEREST_HEADERS.length).setValues([CHAMPIONSHIP_INTEREST_HEADERS]);

  const headerRange = sheet.getRange(1, 1, 1, CHAMPIONSHIP_INTEREST_HEADERS.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#1f2a44');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontSize(10);
  headerRange.setHorizontalAlignment('left');
  headerRange.setBorder(
    true, true, true, true, false, false,
    '#3a4a6a',
    SpreadsheetApp.BorderStyle.SOLID
  );

  sheet.setFrozenRows(1);

  for (let i = 1; i <= CHAMPIONSHIP_INTEREST_HEADERS.length; i++) {
    sheet.autoResizeColumn(i);
  }
  for (let i = 1; i <= CHAMPIONSHIP_INTEREST_HEADERS.length; i++) {
    const width = sheet.getColumnWidth(i);
    if (width < 100) sheet.setColumnWidth(i, 100);
  }

  Logger.log(`✅ Tab "${tabName}" creato con ${CHAMPIONSHIP_INTEREST_HEADERS.length} colonne`);
}

/**
 * Migrazione: aggiunge la colonna "category" al tab esistente (creato
 * prima che il campo fosse previsto), inserendola subito dopo
 * "display_name" — stessa posizione dello schema fresh-install sopra.
 * Idempotente: se la colonna è già presente, skip senza toccare nulla.
 * I dati esistenti nelle altre colonne non vengono alterati:
 * insertColumnAfter sposta automaticamente le colonne successive senza
 * perdita di dati.
 */
function migrateChampionshipInterestAddCategory() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tabName = 'ChampionshipInterest';
  const sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    Logger.log(`✗ Tab "${tabName}" mancante — esegui prima setupChampionshipInterestTab()`);
    return;
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (headers.indexOf('category') !== -1) {
    Logger.log(`⚠ Colonna "category" già presente in "${tabName}" — skip`);
    return;
  }

  const displayNameCol = headers.indexOf('display_name'); // 0-based
  if (displayNameCol === -1) {
    Logger.log(`✗ Colonna "display_name" non trovata in "${tabName}" — impossibile posizionare "category"`);
    return;
  }

  sheet.insertColumnAfter(displayNameCol + 1);
  const newCol = displayNameCol + 2; // 1-based, colonna appena inserita

  const headerCell = sheet.getRange(1, newCol);
  headerCell.setValue('category');
  headerCell.setFontWeight('bold');
  headerCell.setBackground('#1f2a44');
  headerCell.setFontColor('#ffffff');
  headerCell.setFontSize(10);
  headerCell.setHorizontalAlignment('left');

  sheet.autoResizeColumn(newCol);
  if (sheet.getColumnWidth(newCol) < 100) sheet.setColumnWidth(newCol, 100);

  Logger.log(`✅ Colonna "category" inserita in "${tabName}" (posizione ${newCol})`);
}

/**
 * Verifica che il tab esista con gli header attesi (stesso schema di
 * verifyClashOfClassesTabs in SetupClashOfClasses.js).
 */
function verifyChampionshipInterestTab() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tabName = 'ChampionshipInterest';
  const sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    Logger.log(`✗ Tab "${tabName}" MANCANTE`);
    return;
  }
  const actualHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .filter(h => h !== '');

  if (actualHeaders.length !== CHAMPIONSHIP_INTEREST_HEADERS.length) {
    Logger.log(`⚠ Tab "${tabName}": ${actualHeaders.length} colonne, attese ${CHAMPIONSHIP_INTEREST_HEADERS.length}`);
    return;
  }
  const mismatch = CHAMPIONSHIP_INTEREST_HEADERS.filter((h, i) => actualHeaders[i] !== h);
  if (mismatch.length > 0) {
    Logger.log(`⚠ Tab "${tabName}": header mismatch su ${mismatch.join(', ')}`);
  } else {
    Logger.log(`✓ Tab "${tabName}": ${actualHeaders.length} colonne, headers ok`);
  }
}
