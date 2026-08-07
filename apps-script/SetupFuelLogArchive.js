// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — FuelLog Archive + Summary: Setup tab
// ═══════════════════════════════════════════════════════════
// FuelLog resta il tab "caldo" letto da fuel.summary durante le gare
// live (vedi FuelLog.js): deve restare piccolo perché ogni poll rilegge
// TUTTO il foglio con sheetToObjects(), non solo la gara corrente.
//
// Questi due tab esistono per tenere FuelLog snello senza buttare via
// dati:
//   - FuelLogArchive:  stesso schema di FuelLog, righe grezze delle
//                       sessioni concluse spostate qui da
//                       archiveStaleFuelLogSessions() (vedi
//                       FuelLogArchive.js). Mai letto dal pannello live,
//                       solo per analisi storiche future.
//   - FuelLogSummary:  una riga per sessione archiviata, con le medie
//                       (consumo medio/giro carburante ed energia,
//                       giri coperti, intervallo temporale) — quello
//                       che serve per confronti rapidi senza dover
//                       rileggere migliaia di campioni grezzi.
//
// Esecuzione: editor Apps Script → dropdown funzioni →
//             setupFuelLogArchiveTab / setupFuelLogSummaryTab →
//             ▶ Esegui (una volta sola ciascuna).
// ═══════════════════════════════════════════════════════════

// Stesso schema di FUEL_LOG_HEADERS (SetupFuelLog.js) + archived_at.
const FUEL_LOG_ARCHIVE_HEADERS = [
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
  'archived_at',
];

const FUEL_LOG_SUMMARY_HEADERS = [
  'summary_id',
  'race_id',
  'car_number',
  'driver_ids',
  'lap_count',
  'avg_fuel_per_lap_l',
  'avg_energy_pct_per_lap',
  'fuel_capacity_l',
  'session_start',
  'session_end',
  'archived_at',
];

function setupFuelLogArchiveTab() {
  createHeaderTab_('FuelLogArchive', FUEL_LOG_ARCHIVE_HEADERS);
}

function setupFuelLogSummaryTab() {
  createHeaderTab_('FuelLogSummary', FUEL_LOG_SUMMARY_HEADERS);
}

/**
 * Helper condiviso: crea un tab con header formattati, stesso stile
 * visivo di setupFuelLogTab() in SetupFuelLog.js. Skip silenzioso se
 * il tab esiste già (idempotente, sicuro da rilanciare).
 */
function createHeaderTab_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let sheet = ss.getSheetByName(name);
  if (sheet) {
    Logger.log(`⚠  Tab "${name}" già esistente — skip`);
    return;
  }

  sheet = ss.insertSheet(name);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  const headerRange = sheet.getRange(1, 1, 1, headers.length);
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

  for (let i = 1; i <= headers.length; i++) {
    sheet.autoResizeColumn(i);
  }
  for (let i = 1; i <= headers.length; i++) {
    const width = sheet.getColumnWidth(i);
    if (width < 100) sheet.setColumnWidth(i, 100);
  }

  Logger.log('═══════════════════════════════════════');
  Logger.log(`✓  Tab "${name}" creato con ${headers.length} colonne`);
  Logger.log('═══════════════════════════════════════');
}

/**
 * Verifica che entrambi i tab esistano con gli header attesi (stesso
 * pattern di verifyFuelLogTab in SetupFuelLog.js).
 */
function verifyFuelLogArchiveTabs() {
  [
    ['FuelLogArchive', FUEL_LOG_ARCHIVE_HEADERS],
    ['FuelLogSummary', FUEL_LOG_SUMMARY_HEADERS],
  ].forEach(([name, expected]) => {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
    if (!sheet) {
      Logger.log(`✗ Tab "${name}" MANCANTE`);
      return;
    }
    const actual = sheet.getRange(1, 1, 1, sheet.getLastColumn())
      .getValues()[0]
      .filter(h => h !== '');
    if (actual.length !== expected.length) {
      Logger.log(`⚠ Tab "${name}": ${actual.length} colonne, attese ${expected.length}`);
      return;
    }
    const mismatch = expected.filter((h, i) => actual[i] !== h);
    if (mismatch.length > 0) {
      Logger.log(`⚠ Tab "${name}": header mismatch su ${mismatch.join(', ')}`);
    } else {
      Logger.log(`✓ Tab "${name}": ${actual.length} colonne, headers ok`);
    }
  });
}
