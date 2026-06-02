// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Endurance Setup
// ═══════════════════════════════════════════════════════════
// Crea i tab Endurance Auditions nel VSD_HUB_DB con headers
// e formattazione. Idempotente: skip su tab già esistenti.
//
// IMPORTANTE: questo file usa nomi tab DISTINTI da quelli
// legacy preesistenti. Il tab "EnduranceStints" legacy
// (stint planning per gare 24h vere) resta intatto.
//
// Tab creati dallo script:
//   - EnduranceAuditions       (config sessione)
//   - EnduranceParticipants    (piloti invitati)
//   - EnduranceAuditionStints  (risultati audition)
//
// Esecuzione: editor Apps Script → dropdown funzioni →
//             setupEnduranceTabs → ▶ Esegui (una volta sola).
// ═══════════════════════════════════════════════════════════

const ENDURANCE_SS_ID = '1ADUq7CRy0_PtPqbPYS42iCNgpdxZrNlSMY3HX6T8XQA';

const ENDURANCE_AUDITIONS_HEADERS = [
  'audition_id',
  'name',
  'date',
  'sim',
  'track_id',
  'pilot_class',
  'mandatory_car_id',
  'setup_url',
  'setup_notes',
  'duration_minutes_real',
  'time_multiplier',
  'duration_minutes_ingame',
  'start_time_ingame',
  'end_time_ingame',
  'ai_strength_pct',
  'field_size_hypercar',
  'field_size_lmp2',
  'field_size_gt3',
  'weather_condition',
  'status',
  'created_by',
  'created_at',
  'notes_internal'
];

const ENDURANCE_PARTICIPANTS_HEADERS = [
  'participant_id',
  'audition_id',
  'driver_id',
  'status',
  'invited_at',
  'confirmed_at',
  'notes'
];

const ENDURANCE_AUDITION_STINTS_HEADERS = [
  'stint_id',
  'audition_id',
  'driver_id',
  'best_lap_ms',
  'avg_lap_ms',
  'std_dev_ms',
  'laps_count',
  'day_pace_avg_ms',
  'twilight_pace_avg_ms',
  'night_pace_avg_ms',
  'incidents',
  'clean_overtakes',
  'dirty_contacts',
  'dns',
  'dnf',
  'dnf_reason',
  'notes_pilot',
  'notes_coach',
  'created_at',
  'created_by'
];

function setupEnduranceTabs() {
  const ss = SpreadsheetApp.openById(ENDURANCE_SS_ID);

  const tabs = [
    { name: 'EnduranceAuditions',       headers: ENDURANCE_AUDITIONS_HEADERS },
    { name: 'EnduranceParticipants',    headers: ENDURANCE_PARTICIPANTS_HEADERS },
    { name: 'EnduranceAuditionStints',  headers: ENDURANCE_AUDITION_STINTS_HEADERS },
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
  Logger.log('  Setup Endurance Tabs — Risultati');
  Logger.log('═══════════════════════════════════════');
  results.forEach(r => Logger.log(r));
  Logger.log('═══════════════════════════════════════');
}

// ═══════════════════════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════════════════════

function verifyEnduranceTabs() {
  const ss = SpreadsheetApp.openById(ENDURANCE_SS_ID);

  const expected = {
    'EnduranceAuditions':      ENDURANCE_AUDITIONS_HEADERS,
    'EnduranceParticipants':   ENDURANCE_PARTICIPANTS_HEADERS,
    'EnduranceAuditionStints': ENDURANCE_AUDITION_STINTS_HEADERS,
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

// DANGER ZONE — solo per dev reset
// function dropEnduranceTabs_DANGER() {
//   const ss = SpreadsheetApp.openById(ENDURANCE_SS_ID);
//   const tabs = ['EnduranceAuditions', 'EnduranceParticipants', 'EnduranceAuditionStints'];
//   tabs.forEach(name => {
//     const sheet = ss.getSheetByName(name);
//     if (sheet) {
//       ss.deleteSheet(sheet);
//       Logger.log(`✗ Tab "${name}" eliminato`);
//     }
//   });
// }
