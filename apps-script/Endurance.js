// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Endurance Endpoints (Phase 1A)
// ═══════════════════════════════════════════════════════════
// Gestione audition endurance: sessioni di selezione piloti
// per gare lunghe (es. Le Mans 24h).
//
// Auth model:
//   - List/Get: pubblico. Anonymous vede solo audition pubblicate
//                          (status != draft). Staff vede tutto.
//   - Create/Update: staff/admin only.
//
// Validation: tipi base + enums + presence required fields.
// Soft-delete: status = 'cancelled' invece di eliminazione fisica.
// ═══════════════════════════════════════════════════════════

const ENDURANCE_PILOT_CLASSES = ['Hypercar', 'LMP2', 'GT3', 'Open'];
const ENDURANCE_WEATHER = ['asciutto', 'dinamico', 'bagnato'];
const ENDURANCE_STATUSES = ['draft', 'scheduled', 'in_progress', 'completed', 'cancelled'];

const ENDURANCE_AUDITION_FIELDS = [
  'audition_id', 'name', 'date', 'sim', 'track_id',
  'pilot_class', 'mandatory_car_id', 'setup_url', 'setup_notes',
  'duration_minutes_real', 'time_multiplier', 'duration_minutes_ingame',
  'start_time_ingame', 'end_time_ingame', 'ai_strength_pct',
  'field_size_hypercar', 'field_size_lmp2', 'field_size_gt3',
  'weather_condition', 'status', 'created_by', 'created_at',
  'notes_internal'
];

// Campi visibili pubblicamente (anonymous viewer).
// notes_internal NON è pubblico: contiene valutazioni criteri staff.
const ENDURANCE_AUDITION_PUBLIC_FIELDS = ENDURANCE_AUDITION_FIELDS
  .filter(f => f !== 'notes_internal');

// ═══════════════════════════════════════════════════════════
// LIST
// ═══════════════════════════════════════════════════════════

function handleEnduranceAuditionsList(payload, ctx) {
  const rows = sheetToObjects(SHEETS.ENDURANCE_AUDITIONS);

  let filtered = rows;

  if (!ctx.isStaff) {
    filtered = filtered.filter(a => a.status !== 'draft');
  }

  if (payload && payload.status) {
    filtered = filtered.filter(a => a.status === payload.status);
  }
  if (payload && payload.sim) {
    filtered = filtered.filter(a => a.sim === payload.sim);
  }

  filtered.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  const level = ctx.isStaff ? 'private' : 'public';
  const sanitized = filtered.map(a => sanitizeAudition_(a, level));

  return ok({ auditions: sanitized, count: sanitized.length });
}

// ═══════════════════════════════════════════════════════════
// GET
// ═══════════════════════════════════════════════════════════

function handleEnduranceAuditionsGet(payload, ctx) {
  const id = payload && payload.audition_id;
  if (!id) return fail('audition_id mancante');

  const rows = sheetToObjects(SHEETS.ENDURANCE_AUDITIONS);
  const audition = rows.find(a => a.audition_id === id);
  if (!audition) return fail('Audition non trovata: ' + id);

  if (audition.status === 'draft' && !ctx.isStaff) {
    return fail('Audition non disponibile');
  }

  const level = ctx.isStaff ? 'private' : 'public';
  return ok({ audition: sanitizeAudition_(audition, level) });
}

// ═══════════════════════════════════════════════════════════
// CREATE
// ═══════════════════════════════════════════════════════════

function handleEnduranceAuditionsCreate(payload, ctx) {
  if (!ctx.isStaff) return fail('Accesso negato: staff only');
  if (!payload) return fail('Payload mancante');

  const validation = validateAuditionPayload_(payload, 'create');
  if (!validation.ok) return fail(validation.error);

  const sheet = getSheet(SHEETS.ENDURANCE_AUDITIONS);

  const auditionId = 'aud_' + Utilities.getUuid().substring(0, 8);
  const now = new Date().toISOString();

  const durationReal = Number(payload.duration_minutes_real) || 0;
  const multiplier = Number(payload.time_multiplier) || 1;
  const durationIngame = durationReal * multiplier;

  let endTimeIngame = '';
  if (payload.start_time_ingame && durationIngame > 0) {
    endTimeIngame = computeEndTimeIngame_(payload.start_time_ingame, durationIngame);
  }

  const row = ENDURANCE_AUDITION_FIELDS.map(field => {
    switch (field) {
      case 'audition_id': return auditionId;
      case 'duration_minutes_ingame': return durationIngame;
      case 'end_time_ingame': return endTimeIngame;
      case 'created_by': return ctx.driver_id;
      case 'created_at': return now;
      case 'status': return payload.status || 'draft';
      default: return payload[field] != null ? payload[field] : '';
    }
  });

  sheet.appendRow(row);

  try { invalidateSheetCache_(SHEETS.ENDURANCE_AUDITIONS); } catch (e) {}

  const created = sheetToObjects(SHEETS.ENDURANCE_AUDITIONS).find(a => a.audition_id === auditionId);
  return ok({ audition: sanitizeAudition_(created, 'private') });
}

// ═══════════════════════════════════════════════════════════
// UPDATE
// ═══════════════════════════════════════════════════════════

function handleEnduranceAuditionsUpdate(payload, ctx) {
  if (!ctx.isStaff) return fail('Accesso negato: staff only');
  if (!payload || !payload.audition_id) return fail('audition_id mancante');

  const validation = validateAuditionPayload_(payload, 'update');
  if (!validation.ok) return fail(validation.error);

  const sheet = getSheet(SHEETS.ENDURANCE_AUDITIONS);
  const data = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
  const headers = data[0];
  const idCol = headers.indexOf('audition_id');
  if (idCol < 0) return fail('Schema sheet corrotto: audition_id missing');

  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][idCol] === payload.audition_id) {
      rowIndex = i;
      break;
    }
  }
  if (rowIndex < 0) return fail('Audition non trovata: ' + payload.audition_id);

  const immutable = ['audition_id', 'created_by', 'created_at'];

  headers.forEach((field, colIdx) => {
    if (immutable.indexOf(field) >= 0) return;
    if (payload[field] !== undefined) {
      data[rowIndex][colIdx] = payload[field];
    }
  });

  const durationReal = Number(data[rowIndex][headers.indexOf('duration_minutes_real')]) || 0;
  const multiplier = Number(data[rowIndex][headers.indexOf('time_multiplier')]) || 1;
  const durationIngame = durationReal * multiplier;
  data[rowIndex][headers.indexOf('duration_minutes_ingame')] = durationIngame;

  const startTime = data[rowIndex][headers.indexOf('start_time_ingame')];
  if (startTime && durationIngame > 0) {
    data[rowIndex][headers.indexOf('end_time_ingame')] = computeEndTimeIngame_(startTime, durationIngame);
  }

  sheet.getRange(rowIndex + 1, 1, 1, headers.length).setValues([data[rowIndex]]);

  try { invalidateSheetCache_(SHEETS.ENDURANCE_AUDITIONS); } catch (e) {}

  const updated = sheetToObjects(SHEETS.ENDURANCE_AUDITIONS).find(a => a.audition_id === payload.audition_id);
  return ok({ audition: sanitizeAudition_(updated, 'private') });
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

function sanitizeAudition_(audition, level) {
  const fields = level === 'private'
    ? ENDURANCE_AUDITION_FIELDS
    : ENDURANCE_AUDITION_PUBLIC_FIELDS;

  const out = {};
  fields.forEach(f => {
    if (f in audition) out[f] = audition[f];
  });
  return out;
}

function validateAuditionPayload_(payload, mode) {
  if (mode === 'create') {
    if (!payload.name || !String(payload.name).trim()) {
      return { ok: false, error: 'name obbligatorio' };
    }
    if (!payload.date) {
      return { ok: false, error: 'date obbligatoria' };
    }
    if (!payload.sim) {
      return { ok: false, error: 'sim obbligatorio' };
    }
  }

  if (payload.pilot_class !== undefined && payload.pilot_class !== '') {
    if (ENDURANCE_PILOT_CLASSES.indexOf(payload.pilot_class) < 0) {
      return { ok: false, error: 'pilot_class non valida. Valori: ' + ENDURANCE_PILOT_CLASSES.join(', ') };
    }
  }
  if (payload.weather_condition !== undefined && payload.weather_condition !== '') {
    if (ENDURANCE_WEATHER.indexOf(payload.weather_condition) < 0) {
      return { ok: false, error: 'weather_condition non valida. Valori: ' + ENDURANCE_WEATHER.join(', ') };
    }
  }
  if (payload.status !== undefined && payload.status !== '') {
    if (ENDURANCE_STATUSES.indexOf(payload.status) < 0) {
      return { ok: false, error: 'status non valido. Valori: ' + ENDURANCE_STATUSES.join(', ') };
    }
  }

  const numericFields = [
    'duration_minutes_real', 'time_multiplier', 'ai_strength_pct',
    'field_size_hypercar', 'field_size_lmp2', 'field_size_gt3'
  ];
  for (const f of numericFields) {
    if (payload[f] !== undefined && payload[f] !== '') {
      const n = Number(payload[f]);
      if (isNaN(n) || n < 0) {
        return { ok: false, error: f + ' deve essere numerico >= 0' };
      }
    }
  }

  return { ok: true };
}

function computeEndTimeIngame_(startHHMM, durationMinutes) {
  const parts = String(startHHMM).split(':');
  if (parts.length !== 2) return '';
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (isNaN(h) || isNaN(m)) return '';

  let totalMinutes = (h * 60 + m + Number(durationMinutes)) % (24 * 60);
  const endH = Math.floor(totalMinutes / 60);
  const endM = totalMinutes % 60;
  return String(endH).padStart(2, '0') + ':' + String(endM).padStart(2, '0');
}

// ═══════════════════════════════════════════════════════════
// TEST FUNCTIONS (editor only — bypass auth deprecato)
// ═══════════════════════════════════════════════════════════

function getMockStaffCtx_() {
  return {
    driver_id: 'VSD005',
    role: 'admin',
    tier: 'admin',
    sims: ['LMU', 'IRC', 'ACE'],
    isStaff: true,
    isAdmin: true
  };
}

function testEnduranceAuditionsList() {
  const ctx = getMockStaffCtx_();
  const result = handleEnduranceAuditionsList({}, ctx);
  Logger.log('endurance.auditions.list:');
  Logger.log(JSON.stringify(result, null, 2));
}

function testEnduranceAuditionsCreate() {
  const ctx = getMockStaffCtx_();

  const payload = {
    name: 'Test Audition Le Mans Hypercar',
    date: '2026-06-14T20:00:00',
    sim: 'LMU',
    track_id: 'lmu-le-mans-circuit',
    pilot_class: 'Hypercar',
    mandatory_car_id: 'lmu-ferrari-499p',
    setup_url: 'https://drive.google.com/example',
    setup_notes: 'TC 4, ABS 6, brake bias 56%',
    duration_minutes_real: 60,
    time_multiplier: 6,
    start_time_ingame: '16:30',
    ai_strength_pct: 105,
    field_size_hypercar: 5,
    field_size_lmp2: 10,
    field_size_gt3: 15,
    weather_condition: 'asciutto',
    status: 'draft',
    notes_internal: 'Test audition primo del sistema'
  };

  const result = handleEnduranceAuditionsCreate(payload, ctx);
  Logger.log('endurance.auditions.create:');
  Logger.log(JSON.stringify(result, null, 2));
}
