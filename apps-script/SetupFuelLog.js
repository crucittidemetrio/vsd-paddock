// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Fuel/Energy Log: Setup tab
// ═══════════════════════════════════════════════════════════
// Campioni di consumo carburante ed energia virtuale, inviati dal
// companion app (script Python locale che legge la shared memory di
// Le Mans Ultimate) ad ogni cambio giro. Un record = uno snapshot per
// un pilota, su una vettura, in un momento della gara.
//
// Non sostituisce fuel_loaded_l su EnduranceStints (che resta il
// carico PIANIFICATO a inizio stint) — FuelLog è il consumo REALE
// osservato in pista, usato da fuel.summary per proiettare autonomia
// residua e rabbocco consigliato.
//
// Esecuzione: editor Apps Script → dropdown funzioni →
//             setupFuelLogTab → ▶ Esegui (una volta sola).
// ═══════════════════════════════════════════════════════════

const FUEL_LOG_HEADERS = [
  'sample_id',
  'race_id',
  'car_number',
  'driver_id',
  'lap_number',
  'fuel_remaining_l',
  'fuel_capacity_l',
  'virtual_energy_pct',
  'source',
  'created_at',
];

function setupFuelLogTab() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const name = 'FuelLog';

  let sheet = ss.getSheetByName(name);
  if (sheet) {
    Logger.log(`⚠  Tab "${name}" già esistente — skip`);
    return;
  }

  sheet = ss.insertSheet(name);
  sheet.getRange(1, 1, 1, FUEL_LOG_HEADERS.length).setValues([FUEL_LOG_HEADERS]);

  const headerRange = sheet.getRange(1, 1, 1, FUEL_LOG_HEADERS.length);
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

  for (let i = 1; i <= FUEL_LOG_HEADERS.length; i++) {
    sheet.autoResizeColumn(i);
  }
  for (let i = 1; i <= FUEL_LOG_HEADERS.length; i++) {
    const width = sheet.getColumnWidth(i);
    if (width < 100) sheet.setColumnWidth(i, 100);
  }

  Logger.log('═══════════════════════════════════════');
  Logger.log(`✓  Tab "${name}" creato con ${FUEL_LOG_HEADERS.length} colonne`);
  Logger.log('═══════════════════════════════════════');
}

/**
 * Verifica che il tab esista con gli header attesi (stesso schema di
 * verifyRaceCrewsTab in SetupRaceCrews.js).
 */
function verifyFuelLogTab() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('FuelLog');
  if (!sheet) {
    Logger.log('✗ Tab "FuelLog" MANCANTE');
    return;
  }
  const actualHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .filter(h => h !== '');

  if (actualHeaders.length !== FUEL_LOG_HEADERS.length) {
    Logger.log(`⚠ Tab "FuelLog": ${actualHeaders.length} colonne, attese ${FUEL_LOG_HEADERS.length}`);
    return;
  }
  const mismatch = FUEL_LOG_HEADERS.filter((h, i) => actualHeaders[i] !== h);
  if (mismatch.length > 0) {
    Logger.log(`⚠ Tab "FuelLog": header mismatch su ${mismatch.join(', ')}`);
  } else {
    Logger.log(`✓ Tab "FuelLog": ${actualHeaders.length} colonne, headers ok`);
  }
}
