// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Race Crews: Setup tab
// ═══════════════════════════════════════════════════════════
// Roster equipaggi per gare endurance con più vetture VSD sullo stesso
// race_id (es. 8h di Daytona). Un record = un pilota assegnato a una
// vettura per una gara. Va compilato PRIMA di pianificare gli stint:
// AdminRaceStints.jsx e StintPlanner.jsx lo usano per sapere quali
// car_number esistono su una gara e per filtrare i piloti selezionabili.
//
// Esecuzione: editor Apps Script → dropdown funzioni →
//             setupRaceCrewsTab → ▶ Esegui (una volta sola).
// ═══════════════════════════════════════════════════════════

const RACE_CREWS_HEADERS = [
  'crew_id',
  'race_id',
  'car_number',
  'driver_id',
  'notes',
  'added_at',
  'added_by',
];

function setupRaceCrewsTab() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const name = 'RaceCrews';

  let sheet = ss.getSheetByName(name);
  if (sheet) {
    Logger.log(`⚠  Tab "${name}" già esistente — skip`);
    return;
  }

  sheet = ss.insertSheet(name);
  sheet.getRange(1, 1, 1, RACE_CREWS_HEADERS.length).setValues([RACE_CREWS_HEADERS]);

  const headerRange = sheet.getRange(1, 1, 1, RACE_CREWS_HEADERS.length);
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

  for (let i = 1; i <= RACE_CREWS_HEADERS.length; i++) {
    sheet.autoResizeColumn(i);
  }
  for (let i = 1; i <= RACE_CREWS_HEADERS.length; i++) {
    const width = sheet.getColumnWidth(i);
    if (width < 100) sheet.setColumnWidth(i, 100);
  }

  Logger.log('═══════════════════════════════════════');
  Logger.log(`✓  Tab "${name}" creato con ${RACE_CREWS_HEADERS.length} colonne`);
  Logger.log('═══════════════════════════════════════');
}

/**
 * Verifica che il tab esista con gli header attesi (stesso schema di
 * verifyBestLapSubmissionsTab in SetupBestLapSubmissions.js).
 */
function verifyRaceCrewsTab() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('RaceCrews');
  if (!sheet) {
    Logger.log('✗ Tab "RaceCrews" MANCANTE');
    return;
  }
  const actualHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .filter(h => h !== '');

  if (actualHeaders.length !== RACE_CREWS_HEADERS.length) {
    Logger.log(`⚠ Tab "RaceCrews": ${actualHeaders.length} colonne, attese ${RACE_CREWS_HEADERS.length}`);
    return;
  }
  const mismatch = RACE_CREWS_HEADERS.filter((h, i) => actualHeaders[i] !== h);
  if (mismatch.length > 0) {
    Logger.log(`⚠ Tab "RaceCrews": header mismatch su ${mismatch.join(', ')}`);
  } else {
    Logger.log(`✓ Tab "RaceCrews": ${actualHeaders.length} colonne, headers ok`);
  }
}
