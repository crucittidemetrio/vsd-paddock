/**
 * Setup tab EnduranceParticipants nel sheet VSD_HUB_DB.
 *
 * USO NORMALE:
 *   Esegui setupEnduranceParticipantsTab() UNA volta.
 *   Se la tab esiste gia, lo script non fa nulla (idempotente).
 *
 * RICREARE DA ZERO (perde tutti i dati):
 *   Esegui recreateEnduranceParticipantsTab() — cancella e ricrea la tab.
 *
 * Schema:
 *   participation_id | audition_id | driver_id | status | added_at | added_by | notes
 */

const _EP_SHEET_ID = VSD_HUB_SPREADSHEET_ID;
const _EP_TAB_NAME = 'EnduranceParticipants';
const _EP_HEADERS = [
  'participation_id',
  'audition_id',
  'driver_id',
  'status',
  'added_at',
  'added_by',
  'notes',
];
const _EP_STATUS_VALUES = ['registered', 'accepted', 'reserve', 'rejected', 'withdrawn'];


function setupEnduranceParticipantsTab() {
  const ss = SpreadsheetApp.openById(_EP_SHEET_ID);
  const sheet = ss.getSheetByName(_EP_TAB_NAME);

  if (sheet) {
    Logger.log('La tab "' + _EP_TAB_NAME + '" esiste gia. Nessuna azione.');
    Logger.log('Per ricrearla da zero (perde i dati), esegui recreateEnduranceParticipantsTab().');
    return { ok: true, created: false, message: 'tab already exists' };
  }

  _createParticipantsSheet_(ss);
  Logger.log('Tab "' + _EP_TAB_NAME + '" creata con headers e validation status.');
  return { ok: true, created: true };
}


function recreateEnduranceParticipantsTab() {
  const ss = SpreadsheetApp.openById(_EP_SHEET_ID);
  const existing = ss.getSheetByName(_EP_TAB_NAME);

  if (existing) {
    ss.deleteSheet(existing);
    Logger.log('Tab esistente cancellata.');
  }

  _createParticipantsSheet_(ss);
  Logger.log('Tab "' + _EP_TAB_NAME + '" ricreata da zero.');
  return { ok: true, recreated: true };
}


function _createParticipantsSheet_(ss) {
  const sheet = ss.insertSheet(_EP_TAB_NAME);

  // Headers
  sheet.getRange(1, 1, 1, _EP_HEADERS.length).setValues([_EP_HEADERS]);
  sheet.setFrozenRows(1);

  // Style headers
  const headerRange = sheet.getRange(1, 1, 1, _EP_HEADERS.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#1a2942');
  headerRange.setFontColor('#ffffff');
  headerRange.setHorizontalAlignment('left');

  // Column widths
  sheet.setColumnWidth(1, 140);
  sheet.setColumnWidth(2, 140);
  sheet.setColumnWidth(3, 90);
  sheet.setColumnWidth(4, 110);
  sheet.setColumnWidth(5, 190);
  sheet.setColumnWidth(6, 100);
  sheet.setColumnWidth(7, 300);

  // Data validation per il campo status (col D)
  const statusValidation = SpreadsheetApp.newDataValidation()
    .requireValueInList(_EP_STATUS_VALUES, true)
    .setAllowInvalid(false)
    .setHelpText('Valori validi: ' + _EP_STATUS_VALUES.join(', '))
    .build();
  sheet.getRange('D2:D1000').setDataValidation(statusValidation);

  SpreadsheetApp.flush();
  return sheet;
}
