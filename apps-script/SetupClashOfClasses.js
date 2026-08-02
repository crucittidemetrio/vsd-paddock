// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Clash of Classes: Setup tab
// ═══════════════════════════════════════════════════════════
// Crea i tab del nuovo evento "Clash of Classes — GTE vs GT3" nel
// database (stesso spreadsheet legato allo script). Idempotente:
// skip sui tab già esistenti.
//
// Tab creati:
//   - ClashParticipants     (iscrizioni: pilota + classe scelta)
//   - ClashResults          (risultati per pilota per round)
//   - ClashIncidentReports  (segnalazioni incidenti/sanzioni)
//
// Esecuzione: editor Apps Script → dropdown funzioni →
//             setupClashOfClassesTabs → ▶ Esegui (una volta sola).
// ═══════════════════════════════════════════════════════════

const CLASH_PARTICIPANTS_HEADERS = [
  'participant_id',
  'driver_id',
  'display_name',
  'class',
  'discord_handle',
  'registered_at',
  'status',
];

const CLASH_RESULTS_HEADERS = [
  'result_id',
  'round',
  'driver_id',
  'display_name',
  'class',
  'finish_position_class',
  'finish_position_overall',
  'pole_class',
  'fastest_lap_class',
  'finisher',
  'dnf',
  'entered_by',
  'entered_at',
];

const CLASH_INCIDENT_REPORTS_HEADERS = [
  'report_id',
  'round',
  'reporting_name',
  'reported_name',
  'description',
  'replay_url',
  'submitted_at',
  'status',
];

function setupClashOfClassesTabs() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const tabs = [
    { name: 'ClashParticipants',    headers: CLASH_PARTICIPANTS_HEADERS },
    { name: 'ClashResults',         headers: CLASH_RESULTS_HEADERS },
    { name: 'ClashIncidentReports', headers: CLASH_INCIDENT_REPORTS_HEADERS },
  ];

  const results = [];

  tabs.forEach(tab => {
    let sheet = ss.getSheetByName(tab.name);

    if (sheet) {
      results.push(`⚠  Tab "${tab.name}" già esistente — skip`);
      return;
    }

    sheet = ss.insertSheet(tab.name);
    sheet.getRange(1, 1, 1, tab.headers.length).setValues([tab.headers]);

    const headerRange = sheet.getRange(1, 1, 1, tab.headers.length);
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

    for (let i = 1; i <= tab.headers.length; i++) {
      sheet.autoResizeColumn(i);
    }
    for (let i = 1; i <= tab.headers.length; i++) {
      const width = sheet.getColumnWidth(i);
      if (width < 100) sheet.setColumnWidth(i, 100);
    }

    results.push(`✓  Tab "${tab.name}" creato con ${tab.headers.length} colonne`);
  });

  Logger.log('═══════════════════════════════════════');
  Logger.log('  Setup Clash of Classes Tabs — Risultati');
  Logger.log('═══════════════════════════════════════');
  results.forEach(r => Logger.log(r));
  Logger.log('═══════════════════════════════════════');
}

/**
 * Verifica che i tab esistano con gli header attesi (stesso schema
 * di verifyEnduranceTabs in SetupEndurance.js).
 */
function verifyClashOfClassesTabs() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const expected = {
    'ClashParticipants':    CLASH_PARTICIPANTS_HEADERS,
    'ClashResults':         CLASH_RESULTS_HEADERS,
    'ClashIncidentReports': CLASH_INCIDENT_REPORTS_HEADERS,
  };

  Object.keys(expected).forEach(tabName => {
    const sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      Logger.log(`✗ Tab "${tabName}" MANCANTE`);
      return;
    }
    const actualHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn())
      .getValues()[0]
      .filter(h => h !== '');
    const expectedHeaders = expected[tabName];

    if (actualHeaders.length !== expectedHeaders.length) {
      Logger.log(`⚠ Tab "${tabName}": ${actualHeaders.length} colonne, attese ${expectedHeaders.length}`);
      return;
    }
    const mismatch = expectedHeaders.filter((h, i) => actualHeaders[i] !== h);
    if (mismatch.length > 0) {
      Logger.log(`⚠ Tab "${tabName}": header mismatch su ${mismatch.join(', ')}`);
    } else {
      Logger.log(`✓ Tab "${tabName}": ${actualHeaders.length} colonne, headers ok`);
    }
  });
}
