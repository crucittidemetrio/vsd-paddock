// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Lap Data (Obiettivo 3: Analisi di Passo da SimHub)
// ═══════════════════════════════════════════════════════════
// Import CSV per-giro generato dal plugin SimHub (vedi
// simhub-plugin/VsdLapDataLoggerPlugin.cs) — upload manuale a fine
// sessione, stesso gesto già in uso per raceResults.import.
//
// Schema CSV atteso (header, ordine libero — matchato per nome):
//   session_id, driver_name, sim, lap_number, lap_time_ms, in_pits,
//   yellow_flag, track_temp_c, air_temp_c, fuel_l, timestamp_iso
//
// Niente colonna "valid"/LapStatus a 6 stati: la shared memory nativa
// LMU non espone un'invalidazione giro per taglio pista (solo
// mInPits/mYellowFlagState — vedi companion/vendor/lmu_data.py),
// quindi usiamo in_pits + yellow_flag, stessa convenzione già in
// produzione in FuelLog (isCleanLap_) invece di un enum che non
// potremmo popolare onestamente per LMU.
// ═══════════════════════════════════════════════════════════

const LAP_DATA_HEADERS = [
  'lap_id', 'session_id', 'driver_id', 'driver_name_external', 'is_vsd_driver',
  'sim', 'lap_number', 'lap_time_ms', 'in_pits', 'yellow_flag',
  'track_temp_c', 'air_temp_c', 'fuel_l', 'source_timestamp', 'imported_at',
];

/**
 * setupLapDataTab — Editor Apps Script → ▶ Esegui (una tantum, idempotente).
 */
function setupLapDataTab() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEETS.LAP_DATA);
  if (sheet) {
    Logger.log('✓ Tab "' + SHEETS.LAP_DATA + '" già esistente, nessuna modifica.');
    return;
  }
  sheet = ss.insertSheet(SHEETS.LAP_DATA);
  sheet.getRange(1, 1, 1, LAP_DATA_HEADERS.length).setValues([LAP_DATA_HEADERS]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, LAP_DATA_HEADERS.length).setFontWeight('bold');
  Logger.log('✅ Tab "' + SHEETS.LAP_DATA + '" creata con ' + LAP_DATA_HEADERS.length + ' colonne.');
}

// ═══════════════════════════════════════════════════════════
// CSV PARSING — niente XmlService, più semplice del session.xml
// già gestito altrove. Parser minimale ma corretto su virgolette
// (RFC4180-ish): gestisce campi quotati con virgole/newline interni,
// coerente con l'escaping che VsdLapDataLoggerPlugin.cs applica in
// scrittura (Csv() nel plugin).
// ═══════════════════════════════════════════════════════════

function parseLapDataCsv_(csvText) {
  const text = String(csvText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') { inQuotes = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }
    field += c;
  }
  // ultima riga senza newline finale
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmptyRows = rows.filter(r => r.some(v => String(v).trim() !== ''));
  if (nonEmptyRows.length === 0) return { headers: [], records: [] };

  const headers = nonEmptyRows[0].map(h => String(h).trim());
  const records = nonEmptyRows.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = r[idx] !== undefined ? String(r[idx]).trim() : ''; });
    return obj;
  });

  return { headers, records };
}

// ═══════════════════════════════════════════════════════════
// IMPORT
// ═══════════════════════════════════════════════════════════

/**
 * lapData.import — wrapper frontend-callable.
 * Gated su staff/admin (stesso livello di raceResults.import).
 *
 * @param {Object} payload - { csv_text: string }
 * @param {Object} ctx - Auth context (richiesto, isStaff)
 * @returns {Object} ok({ imported, vsd_matched, external, laps_per_driver, session_id, skipped_duplicates }) oppure fail
 */
function handleLapDataImport(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');
  if (!ctx.isStaff) return fail('Forbidden: solo staff può importare dati di passo');

  if (!payload || !payload.csv_text) return fail('csv_text mancante');

  const parsed = parseLapDataCsv_(payload.csv_text);
  if (parsed.records.length === 0) return fail('CSV vuoto o non parsabile');

  const requiredCols = ['session_id', 'lap_number'];
  const missingCols = requiredCols.filter(c => parsed.headers.indexOf(c) === -1);
  if (missingCols.length > 0) {
    return fail('Colonne CSV mancanti: ' + missingCols.join(', '));
  }

  try {
    const stats = importLapData_(parsed.records);
    return ok(stats);
  } catch (e) {
    return fail('Errore durante import: ' + e.message);
  }
}

function importLapData_(records) {
  const sheet = getSheet(SHEETS.LAP_DATA);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const driverNameMap = buildDriverNameMap_(); // riuso da Academy.js, stessa mappa di raceResults.import
  const timestamp = Date.now();
  const importedAt = new Date().toISOString();

  // Dedup: (session_id, driver_key, lap_number) già presenti — utile se
  // lo stesso CSV viene ricaricato per errore.
  const existingKeys = new Set();
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    const allData = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    const idxSession = headers.indexOf('session_id');
    const idxDriverId = headers.indexOf('driver_id');
    const idxDriverExt = headers.indexOf('driver_name_external');
    const idxLap = headers.indexOf('lap_number');
    for (let i = 0; i < allData.length; i++) {
      const sid = String(allData[i][idxSession] || '').trim();
      const did = String(allData[i][idxDriverId] || '').trim();
      const dext = String(allData[i][idxDriverExt] || '').trim().toLowerCase();
      const driverKey = did || dext;
      const lap = String(allData[i][idxLap] || '').trim();
      if (sid && lap) existingKeys.add(sid + '|' + driverKey + '|' + lap);
    }
  }

  const allRows = [];
  let skippedCount = 0;
  let sessionId = '';
  const lapsPerDriver = {};

  records.forEach((r, idx) => {
    const matchedDriverId = matchDriverName_(r.driver_name, driverNameMap) || '';
    const driverKey = matchedDriverId || String(r.driver_name || '').toLowerCase().trim();
    const sid = String(r.session_id || '').trim();
    const lapNum = String(r.lap_number || '').trim();
    sessionId = sid || sessionId;

    const dedupKey = sid + '|' + driverKey + '|' + lapNum;
    if (dedupKey && existingKeys.has(dedupKey)) {
      skippedCount++;
      return;
    }
    if (dedupKey) existingKeys.add(dedupKey);

    const obj = {
      lap_id: `LAP-${timestamp}-${idx}`,
      session_id: sid,
      driver_id: matchedDriverId,
      driver_name_external: r.driver_name || '',
      is_vsd_driver: matchedDriverId ? 'TRUE' : 'FALSE',
      sim: r.sim || '',
      lap_number: r.lap_number !== undefined && r.lap_number !== '' ? Number(r.lap_number) : '',
      lap_time_ms: r.lap_time_ms !== undefined && r.lap_time_ms !== '' ? Number(r.lap_time_ms) : '',
      in_pits: String(r.in_pits || '').toUpperCase() === 'TRUE' ? 'TRUE' : 'FALSE',
      yellow_flag: String(r.yellow_flag || '').toUpperCase() === 'TRUE' ? 'TRUE' : 'FALSE',
      track_temp_c: r.track_temp_c !== undefined && r.track_temp_c !== '' ? Number(r.track_temp_c) : '',
      air_temp_c: r.air_temp_c !== undefined && r.air_temp_c !== '' ? Number(r.air_temp_c) : '',
      fuel_l: r.fuel_l !== undefined && r.fuel_l !== '' ? Number(r.fuel_l) : '',
      source_timestamp: r.timestamp_iso || '',
      imported_at: importedAt,
    };

    const driverLabel = matchedDriverId || (r.driver_name || 'sconosciuto');
    lapsPerDriver[driverLabel] = (lapsPerDriver[driverLabel] || 0) + 1;

    const row = headers.map(h => obj[h] !== undefined ? obj[h] : '');
    allRows.push(row);
  });

  if (allRows.length === 0) {
    Logger.log(`⚠️ Nessuna riga da importare (skipped duplicati: ${skippedCount})`);
    return { imported: 0, vsd_matched: 0, external: 0, session_id: sessionId, skipped_duplicates: skippedCount, laps_per_driver: {} };
  }

  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, allRows.length, headers.length).setValues(allRows);

  const vsdIdx = headers.indexOf('is_vsd_driver');
  const vsdCount = allRows.filter(r => r[vsdIdx] === 'TRUE').length;

  invalidateSheetCache_(SHEETS.LAP_DATA);

  Logger.log(`✅ Importate ${allRows.length} righe in LapData (sessione ${sessionId})`);
  Logger.log(`   - VSD drivers: ${vsdCount}`);
  Logger.log(`   - Esterni/non abbinati: ${allRows.length - vsdCount}`);
  Logger.log(`   - Skipped (duplicati): ${skippedCount}`);

  return {
    imported: allRows.length,
    vsd_matched: vsdCount,
    external: allRows.length - vsdCount,
    session_id: sessionId,
    skipped_duplicates: skippedCount,
    laps_per_driver: lapsPerDriver,
  };
}

// ═══════════════════════════════════════════════════════════
// LETTURA — dominio lapData.summary per la vista Analisi di Passo
// ═══════════════════════════════════════════════════════════

/**
 * lapData.sessions — elenco sessioni importate (per popolare un
 * selettore lato frontend), più recenti prima.
 * Auth: richiesta.
 */
function handleLapDataSessions(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');

  const rows = sheetToObjects(SHEETS.LAP_DATA);
  const bySession = {};
  rows.forEach(r => {
    const sid = String(r.session_id || '').trim();
    if (!sid) return;
    if (!bySession[sid]) {
      bySession[sid] = {
        session_id: sid,
        sim: r.sim || '',
        laps: 0,
        drivers: new Set(),
        imported_at: r.imported_at || '',
      };
    }
    bySession[sid].laps++;
    bySession[sid].drivers.add(r.driver_id || r.driver_name_external || '?');
  });

  const sessions = Object.values(bySession)
    .map(s => ({
      session_id: s.session_id,
      sim: s.sim,
      laps: s.laps,
      driver_count: s.drivers.size,
      imported_at: s.imported_at,
    }))
    .sort((a, b) => String(b.imported_at).localeCompare(String(a.imported_at)));

  return ok({ sessions });
}

/**
 * lapData.session — dettaglio giri di UNA sessione (per grafico passo +
 * trend carburante/temperature + confronto piloti).
 * Auth: richiesta.
 *
 * @param {Object} payload - { session_id }
 */
function handleLapDataSession(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');
  const sessionId = payload && String(payload.session_id || '').trim();
  if (!sessionId) return fail('session_id mancante');

  const rows = sheetToObjects(SHEETS.LAP_DATA)
    .filter(r => String(r.session_id || '').trim() === sessionId)
    .sort((a, b) => (Number(a.lap_number) || 0) - (Number(b.lap_number) || 0));

  if (rows.length === 0) return fail('Sessione non trovata: ' + sessionId);

  const laps = rows.map(r => ({
    driver_id: r.driver_id || '',
    driver_name_external: r.driver_name_external || '',
    lap_number: Number(r.lap_number) || 0,
    lap_time_ms: r.lap_time_ms !== '' ? Number(r.lap_time_ms) : null,
    in_pits: r.in_pits === true || r.in_pits === 'TRUE',
    yellow_flag: r.yellow_flag === true || r.yellow_flag === 'TRUE',
    track_temp_c: r.track_temp_c !== '' ? Number(r.track_temp_c) : null,
    air_temp_c: r.air_temp_c !== '' ? Number(r.air_temp_c) : null,
    fuel_l: r.fuel_l !== '' ? Number(r.fuel_l) : null,
    // "clean" = giro non in/out-lap e non sotto yellow — stessa
    // definizione di isCleanLap_ in FuelLog.js, per coerenza.
    clean: r.in_pits !== true && r.in_pits !== 'TRUE' && r.yellow_flag !== true && r.yellow_flag !== 'TRUE',
  }));

  return ok({ session_id: sessionId, sim: rows[0].sim || '', laps });
}
