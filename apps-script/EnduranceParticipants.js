/**
 * Endpoint handlers per EnduranceParticipants.
 *
 * Schema sheet:
 *   participation_id | audition_id | driver_id | status | added_at | added_by | notes
 *
 * Registrate in Codice.js dispatcher come:
 *   'endurance.participants.list':   handleEnduranceParticipantsList
 *   'endurance.participants.add':    handleEnduranceParticipantsAdd
 *   'endurance.participants.update': handleEnduranceParticipantsUpdate
 *   'endurance.participants.remove': handleEnduranceParticipantsRemove
 */

const EP_SHEET_ID = VSD_HUB_SPREADSHEET_ID;
const EP_TAB = 'EnduranceParticipants';
const EP_FIELDS = [
  'participation_id', 'audition_id', 'driver_id', 'status',
  'added_at', 'added_by', 'notes',
];
const EP_STATUSES = ['registered', 'accepted', 'reserve', 'rejected', 'withdrawn'];

const EP_AUDITIONS_TAB = 'EnduranceAuditions';
const EP_DRIVERS_TAB = 'Drivers';


// ====== Helpers ======

function _epGetSheet_() {
  const ss = SpreadsheetApp.openById(EP_SHEET_ID);
  const sheet = ss.getSheetByName(EP_TAB);
  if (!sheet) throw new Error('Sheet ' + EP_TAB + ' not found');
  return sheet;
}

function _epRowToObj_(row) {
  const obj = {};
  EP_FIELDS.forEach((f, i) => { obj[f] = row[i]; });
  return obj;
}

function _epLoadAll_() {
  const sheet = _epGetSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, EP_FIELDS.length).getValues();
  return values.filter(row => row[0]).map(_epRowToObj_);
}

function _epFindById_(participationId) {
  if (!participationId) return null;
  const sheet = _epGetSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (ids[i][0] === participationId) {
      const row = sheet.getRange(i + 2, 1, 1, EP_FIELDS.length).getValues()[0];
      const obj = _epRowToObj_(row);
      obj._rowIndex = i + 2;
      return obj;
    }
  }
  return null;
}

function _epFindByAuditionAndDriver_(auditionId, driverId) {
  if (!auditionId || !driverId) return null;
  const all = _epLoadAll_();
  return all.find(p => p.audition_id === auditionId && p.driver_id === driverId) || null;
}

function _epGenerateId_() {
  const uuid = Utilities.getUuid().replace(/-/g, '');
  return 'part_' + uuid.substring(0, 8);
}

function _epAuditionExists_(auditionId) {
  if (!auditionId) return false;
  const ss = SpreadsheetApp.openById(EP_SHEET_ID);
  const sheet = ss.getSheetByName(EP_AUDITIONS_TAB);
  if (!sheet) return false;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (ids[i][0] === auditionId) return true;
  }
  return false;
}

function _epDriverExists_(driverId) {
  if (!driverId) return false;
  const ss = SpreadsheetApp.openById(EP_SHEET_ID);
  const sheet = ss.getSheetByName(EP_DRIVERS_TAB);
  if (!sheet) return false;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (ids[i][0] === driverId) return true;
  }
  return false;
}

function _epIsAdmin_(context) {
  return context && (context.role === 'admin' || context.tier === 'admin');
}


// ====== HANDLERS (registrati in Codice.js dispatcher) ======

function handleEnduranceParticipantsList(payload, context) {
  const auditionId = (payload && payload.audition_id) || null;
  const all = _epLoadAll_();
  const data = auditionId
    ? all.filter(p => p.audition_id === auditionId)
    : all;
  return { ok: true, data: data };
}


function handleEnduranceParticipantsAdd(payload, context) {
  if (!_epIsAdmin_(context)) {
    return { ok: false, error: 'admin role required' };
  }

  payload = payload || {};
  const auditionId = String(payload.audition_id || '').trim();
  const driverId = String(payload.driver_id || '').trim();
  const status = String(payload.status || 'registered').trim();
  const notes = String(payload.notes || '');

  if (!auditionId) return { ok: false, error: 'audition_id required' };
  if (!driverId) return { ok: false, error: 'driver_id required' };
  if (EP_STATUSES.indexOf(status) === -1) {
    return { ok: false, error: 'invalid status. allowed: ' + EP_STATUSES.join(', ') };
  }

  if (!_epAuditionExists_(auditionId)) {
    return { ok: false, error: 'audition ' + auditionId + ' not found' };
  }
  if (!_epDriverExists_(driverId)) {
    return { ok: false, error: 'driver ' + driverId + ' not found' };
  }

  const existing = _epFindByAuditionAndDriver_(auditionId, driverId);
  if (existing) {
    return { ok: false, error: 'driver ' + driverId + ' already in audition ' + auditionId };
  }

  const participationId = _epGenerateId_();
  const now = new Date().toISOString();
  const addedBy = (context && context.driver_id) || 'unknown';

  const sheet = _epGetSheet_();
  const newRow = [participationId, auditionId, driverId, status, now, addedBy, notes];
  sheet.appendRow(newRow);

  return {
    ok: true,
    data: {
      participation_id: participationId,
      audition_id: auditionId,
      driver_id: driverId,
      status: status,
      added_at: now,
      added_by: addedBy,
      notes: notes,
    },
  };
}


function handleEnduranceParticipantsUpdate(payload, context) {
  if (!_epIsAdmin_(context)) {
    return { ok: false, error: 'admin role required' };
  }

  payload = payload || {};
  const participationId = String(payload.participation_id || '').trim();
  if (!participationId) return { ok: false, error: 'participation_id required' };

  const existing = _epFindById_(participationId);
  if (!existing) {
    return { ok: false, error: 'participation ' + participationId + ' not found' };
  }

  if (payload.status !== undefined) {
    const newStatus = String(payload.status).trim();
    if (EP_STATUSES.indexOf(newStatus) === -1) {
      return { ok: false, error: 'invalid status' };
    }
    existing.status = newStatus;
  }
  if (payload.notes !== undefined) {
    existing.notes = String(payload.notes);
  }

  const sheet = _epGetSheet_();
  const newRow = EP_FIELDS.map(f => existing[f]);
  sheet.getRange(existing._rowIndex, 1, 1, newRow.length).setValues([newRow]);

  delete existing._rowIndex;
  return { ok: true, data: existing };
}


function handleEnduranceParticipantsRemove(payload, context) {
  if (!_epIsAdmin_(context)) {
    return { ok: false, error: 'admin role required' };
  }

  payload = payload || {};
  const participationId = String(payload.participation_id || '').trim();
  if (!participationId) return { ok: false, error: 'participation_id required' };

  const existing = _epFindById_(participationId);
  if (!existing) {
    return { ok: false, error: 'participation ' + participationId + ' not found' };
  }

  const sheet = _epGetSheet_();
  sheet.deleteRow(existing._rowIndex);

  return { ok: true, data: { deleted: true, participation_id: participationId } };
}
