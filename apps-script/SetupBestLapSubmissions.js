// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Best Lap Submissions: Setup tab
// ═══════════════════════════════════════════════════════════
// Crea il tab per le richieste di best lap inviate dai piloti in
// autonomia, con foto di prova, in attesa di validazione admin.
// Idempotente: skip se il tab esiste già.
//
// Esecuzione: editor Apps Script → dropdown funzioni →
//             setupBestLapSubmissionsTab → ▶ Esegui (una volta sola).
// ═══════════════════════════════════════════════════════════

const BEST_LAP_SUBMISSIONS_HEADERS = [
  'submission_id',
  'driver_id',
  'sim',
  'track_id',
  'car_id',
  'lap_time_display',
  'lap_time_ms',
  'set_date',
  'conditions',
  'air_temp_c',
  'track_temp_c',
  'session_type',
  'notes',
  'evidence_url',
  'status',
  'submitted_at',
  'reviewed_by',
  'reviewed_at',
  'review_note',
];

function setupBestLapSubmissionsTab() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const name = 'BestLapSubmissions';

  let sheet = ss.getSheetByName(name);
  if (sheet) {
    Logger.log(`⚠  Tab "${name}" già esistente — skip`);
    return;
  }

  sheet = ss.insertSheet(name);
  sheet.getRange(1, 1, 1, BEST_LAP_SUBMISSIONS_HEADERS.length).setValues([BEST_LAP_SUBMISSIONS_HEADERS]);

  const headerRange = sheet.getRange(1, 1, 1, BEST_LAP_SUBMISSIONS_HEADERS.length);
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

  for (let i = 1; i <= BEST_LAP_SUBMISSIONS_HEADERS.length; i++) {
    sheet.autoResizeColumn(i);
  }
  for (let i = 1; i <= BEST_LAP_SUBMISSIONS_HEADERS.length; i++) {
    const width = sheet.getColumnWidth(i);
    if (width < 100) sheet.setColumnWidth(i, 100);
  }

  Logger.log('═══════════════════════════════════════');
  Logger.log(`✓  Tab "${name}" creato con ${BEST_LAP_SUBMISSIONS_HEADERS.length} colonne`);
  Logger.log('═══════════════════════════════════════');
}

/**
 * Verifica che il tab esista con gli header attesi (stesso schema di
 * verifyClashOfClassesTabs in SetupClashOfClasses.js).
 */
function verifyBestLapSubmissionsTab() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('BestLapSubmissions');
  if (!sheet) {
    Logger.log('✗ Tab "BestLapSubmissions" MANCANTE');
    return;
  }
  const actualHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .filter(h => h !== '');

  if (actualHeaders.length !== BEST_LAP_SUBMISSIONS_HEADERS.length) {
    Logger.log(`⚠ Tab "BestLapSubmissions": ${actualHeaders.length} colonne, attese ${BEST_LAP_SUBMISSIONS_HEADERS.length}`);
    return;
  }
  const mismatch = BEST_LAP_SUBMISSIONS_HEADERS.filter((h, i) => actualHeaders[i] !== h);
  if (mismatch.length > 0) {
    Logger.log(`⚠ Tab "BestLapSubmissions": header mismatch su ${mismatch.join(', ')}`);
  } else {
    Logger.log(`✓ Tab "BestLapSubmissions": ${actualHeaders.length} colonne, headers ok`);
  }
}
