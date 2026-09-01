// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Pit Wall Sessions (best lap per pilota, live da griglia)
// ═══════════════════════════════════════════════════════════
// Il VSD Pitwall Bridge (cartella vsd-pitwall-bridge/, eseguibile .NET
// locale) legge lo Scoring buffer di LMU per l'INTERA griglia — non solo
// il pilota locale — e a fine sessione manda uno snapshot con il miglior
// giro di ogni pilota visto in griglia. Stesso contratto JSON usato dalla
// companion app Python per fuel.logSample: body {action, token, payload}
// come text/plain (niente preflight CORS), token personale generato dal
// profilo VSD-Paddock ("Genera token companion").
//
// Deliberatamente NON scrive nel tab "manuale" di BestLaps (quello dietro
// laps.add/Muro dei Record): un giro catturato in una sessione di prove
// libere qualsiasi non è automaticamente un record ufficiale da esporre
// in classifica — track_name/vehicle_name qui restano testo libero (stesso
// problema di matching già noto e non ancora risolto sul tab Tracks, vedi
// backlog "duplicati Le Mans"). Se un giro merita di diventare un record
// ufficiale, lo staff lo aggiunge a mano con il flusso già esistente
// (stessa logica di LapData.js/Obiettivo 3: dato "grezzo" separato,
// promozione a record è una scelta editoriale dello staff, non automatica).
// ═══════════════════════════════════════════════════════════

const PITWALL_SESSIONS_HEADERS = [
  'record_id', 'session_id', 'captured_at', 'track_name', 'sim', 'session_type',
  'driver_id', 'driver_name_external', 'is_vsd_driver',
  'vehicle_name', 'vehicle_class', 'best_lap_time_ms', 'laps_completed', 'final_place',
];

/**
 * setupPitwallSessionsTab — Editor Apps Script → ▶ Esegui (una tantum, idempotente).
 */
function setupPitwallSessionsTab() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEETS.PITWALL_SESSIONS);
  if (sheet) {
    Logger.log('✓ Tab "' + SHEETS.PITWALL_SESSIONS + '" già esistente, nessuna modifica.');
    return;
  }
  sheet = ss.insertSheet(SHEETS.PITWALL_SESSIONS);
  sheet.getRange(1, 1, 1, PITWALL_SESSIONS_HEADERS.length).setValues([PITWALL_SESSIONS_HEADERS]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, PITWALL_SESSIONS_HEADERS.length).setFontWeight('bold');
  Logger.log('✅ Tab "' + SHEETS.PITWALL_SESSIONS + '" creata con ' + PITWALL_SESSIONS_HEADERS.length + ' colonne.');
}

// ═══════════════════════════════════════════════════════════
// SCRITTURA — chiamata dal bridge C# a fine sessione (pitwall.logSession)
// ═══════════════════════════════════════════════════════════

/**
 * pitwall.logSession — riceve lo snapshot di fine sessione dal Pitwall
 * Bridge. Gated su staff/admin: chi gestisce il bridge scrive dati per
 * TUTTA la griglia, non solo per sé, stesso livello di lapData.import.
 *
 * @param {Object} payload - {
 *   session_id, track_name, sim, session_type, captured_at,
 *   drivers: [{ driver_name, vehicle_name, vehicle_class,
 *               best_lap_time_ms, laps, final_place }]
 * }
 * @param {Object} ctx - Auth context (richiesto, isStaff)
 */
function handlePitwallLogSession(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');
  if (!ctx.isStaff) return fail('Forbidden: solo staff può registrare sessioni Pit Wall');

  if (!payload || !payload.session_id) return fail('session_id mancante');
  if (!Array.isArray(payload.drivers) || payload.drivers.length === 0) {
    return fail('Nessun pilota nel payload');
  }

  try {
    const stats = importPitwallSession_(payload);
    return ok(stats);
  } catch (e) {
    return fail('Errore durante registrazione sessione: ' + e.message);
  }
}

function importPitwallSession_(payload) {
  const sheet = getSheet(SHEETS.PITWALL_SESSIONS);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const driverNameMap = buildDriverNameMap_(); // riuso da Academy.js, stessa mappa di raceResults.import/lapData.import
  const sessionId = String(payload.session_id).trim();
  const capturedAt = payload.captured_at || new Date().toISOString();

  // Dedup: stessa sessione + stesso pilota già registrati (es. bridge
  // riavviato sulla stessa sessione) — sovrascrive con l'ultimo dato.
  const existingRowByKey = {};
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    const idxSession = headers.indexOf('session_id');
    const idxDriverId = headers.indexOf('driver_id');
    const idxDriverExt = headers.indexOf('driver_name_external');
    const allData = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    for (let i = 0; i < allData.length; i++) {
      const sid = String(allData[i][idxSession] || '').trim();
      if (sid !== sessionId) continue;
      const did = String(allData[i][idxDriverId] || '').trim();
      const dext = String(allData[i][idxDriverExt] || '').trim().toLowerCase();
      existingRowByKey[did || dext] = i + 2; // riga reale nel foglio (1-based + header)
    }
  }

  const newRows = [];
  const updates = []; // { row, values }
  let vsdCount = 0;

  payload.drivers.forEach((d, idx) => {
    const matchedDriverId = matchDriverName_(d.driver_name, driverNameMap) || '';
    const driverKey = matchedDriverId || String(d.driver_name || '').toLowerCase().trim();
    if (!driverKey) return;

    if (matchedDriverId) vsdCount++;

    const obj = {
      record_id: `PW-${sessionId}-${idx}`,
      session_id: sessionId,
      captured_at: capturedAt,
      track_name: payload.track_name || '',
      sim: payload.sim || 'LMU',
      session_type: payload.session_type !== undefined ? Number(payload.session_type) : '',
      driver_id: matchedDriverId,
      driver_name_external: d.driver_name || '',
      is_vsd_driver: matchedDriverId ? 'TRUE' : 'FALSE',
      vehicle_name: d.vehicle_name || '',
      vehicle_class: d.vehicle_class || '',
      best_lap_time_ms: d.best_lap_time_ms !== undefined && d.best_lap_time_ms !== null ? Number(d.best_lap_time_ms) : '',
      laps_completed: d.laps !== undefined ? Number(d.laps) : '',
      final_place: d.final_place !== undefined ? Number(d.final_place) : '',
    };

    const row = headers.map(h => obj[h] !== undefined ? obj[h] : '');

    if (existingRowByKey[driverKey]) {
      updates.push({ row: existingRowByKey[driverKey], values: row });
    } else {
      newRows.push(row);
    }
  });

  updates.forEach(u => {
    sheet.getRange(u.row, 1, 1, headers.length).setValues([u.values]);
  });

  if (newRows.length > 0) {
    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, newRows.length, headers.length).setValues(newRows);
  }

  invalidateSheetCache_(SHEETS.PITWALL_SESSIONS);

  const total = newRows.length + updates.length;
  Logger.log(`✅ Sessione Pit Wall ${sessionId}: ${newRows.length} nuovi, ${updates.length} aggiornati`);

  return {
    session_id: sessionId,
    imported: total,
    new: newRows.length,
    updated: updates.length,
    vsd_matched: vsdCount,
    external: total - vsdCount,
  };
}

// ═══════════════════════════════════════════════════════════
// LETTURA — dominio pitwall.* per la vista frontend
// ═══════════════════════════════════════════════════════════

/**
 * pitwall.sessions — elenco sessioni registrate, più recenti prima.
 * Auth: richiesta.
 */
function handlePitwallSessions(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');

  const rows = sheetToObjects(SHEETS.PITWALL_SESSIONS);
  const bySession = {};
  rows.forEach(r => {
    const sid = String(r.session_id || '').trim();
    if (!sid) return;
    if (!bySession[sid]) {
      bySession[sid] = {
        session_id: sid,
        track_name: r.track_name || '',
        sim: r.sim || '',
        session_type: r.session_type,
        captured_at: r.captured_at || '',
        driverCount: 0,
      };
    }
    bySession[sid].driverCount++;
  });

  const sessions = Object.values(bySession)
    .map(s => ({
      session_id: s.session_id,
      track_name: s.track_name,
      sim: s.sim,
      session_type: s.session_type,
      captured_at: s.captured_at,
      driver_count: s.driverCount,
    }))
    .sort((a, b) => String(b.captured_at).localeCompare(String(a.captured_at)));

  return ok({ sessions });
}

/**
 * pitwall.session — dettaglio di UNA sessione: classifica finale per
 * miglior giro (ordinata ascendente, tempi assenti in coda).
 * Auth: richiesta.
 *
 * @param {Object} payload - { session_id }
 */
function handlePitwallSession(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');
  const sessionId = payload && String(payload.session_id || '').trim();
  if (!sessionId) return fail('session_id mancante');

  const rows = sheetToObjects(SHEETS.PITWALL_SESSIONS)
    .filter(r => String(r.session_id || '').trim() === sessionId);

  if (rows.length === 0) return fail('Sessione non trovata: ' + sessionId);

  const drivers = rows
    .map(r => ({
      driver_id: r.driver_id || '',
      driver_name_external: r.driver_name_external || '',
      vehicle_name: r.vehicle_name || '',
      vehicle_class: r.vehicle_class || '',
      best_lap_time_ms: r.best_lap_time_ms !== '' ? Number(r.best_lap_time_ms) : null,
      laps_completed: r.laps_completed !== '' ? Number(r.laps_completed) : 0,
      final_place: r.final_place !== '' ? Number(r.final_place) : null,
    }))
    .sort((a, b) => {
      if (a.best_lap_time_ms == null && b.best_lap_time_ms == null) return 0;
      if (a.best_lap_time_ms == null) return 1;
      if (b.best_lap_time_ms == null) return -1;
      return a.best_lap_time_ms - b.best_lap_time_ms;
    });

  return ok({
    session_id: sessionId,
    track_name: rows[0].track_name || '',
    sim: rows[0].sim || '',
    session_type: rows[0].session_type,
    captured_at: rows[0].captured_at || '',
    drivers,
  });
}
