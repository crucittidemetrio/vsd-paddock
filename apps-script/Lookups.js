// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Lookups Endpoints
// ═══════════════════════════════════════════════════════════
// Espone le lookup tables Tracks e Cars.
// Filtri opzionali: sim (IRC/LMU/ACE).
// Default: ritorna solo record con active = TRUE.
// ═══════════════════════════════════════════════════════════

/**
 * lookups.tracks — Lista circuiti.
 * Auth: richiesta.
 * 
 * @param {Object} payload - { sim?: 'IRC'|'LMU'|'ACE' }
 * @param {Object} ctx - Auth context (richiesto)
 * @returns {Object} { ok, data: { tracks: [...] } }
 */
function handleLookupsTracks(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');

  const sim = payload && payload.sim;
  const tracks = sheetToObjects(SHEETS.TRACKS);

  const filtered = tracks.filter(t => {
    if (t.active !== true && t.active !== 'TRUE') return false;
    if (sim && t.sim !== sim) return false;
    return true;
  });

  // Ordina per track_name (case-insensitive)
  filtered.sort((a, b) => {
    const na = String(a.track_name || '').toLowerCase();
    const nb = String(b.track_name || '').toLowerCase();
    return na.localeCompare(nb);
  });

  return ok({ tracks: filtered, count: filtered.length });
}

/**
 * lookups.cars — Lista auto.
 * Auth: richiesta.
 * 
 * @param {Object} payload - { sim?: 'IRC'|'LMU'|'ACE' }
 * @param {Object} ctx - Auth context (richiesto)
 * @returns {Object} { ok, data: { cars: [...] } }
 */
function handleLookupsCars(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');

  const sim = payload && payload.sim;
  const cars = sheetToObjects(SHEETS.CARS);

  const filtered = cars.filter(c => {
    if (c.active !== true && c.active !== 'TRUE') return false;
    if (sim && c.sim !== sim) return false;
    return true;
  });

  // Ordina per car_name (case-insensitive)
  filtered.sort((a, b) => {
    const na = String(a.car_name || '').toLowerCase();
    const nb = String(b.car_name || '').toLowerCase();
    return na.localeCompare(nb);
  });

  return ok({ cars: filtered, count: filtered.length });
}

// ═══════════════════════════════════════════════════════════
// TEST FUNCTIONS
// ═══════════════════════════════════════════════════════════

/**
 * Test: lookups.tracks senza filtri → tutti i tracks attivi.
 */
function testLookupsTracksAll() {
  const login = handleAuthLogin({ code: 'CRUCITTI-9182' });
  const ctx = verifyToken(login.data.token);

  const result = handleLookupsTracks({}, ctx);
  Logger.log('lookups.tracks (all) result:');
  Logger.log(JSON.stringify(result, null, 2));

  if (result.ok) {
    Logger.log(`Totale tracks attivi: ${result.data.count}`);
  }
}

/**
 * Test: lookups.tracks con filtro sim=LMU.
 */
function testLookupsTracksByLMU() {
  const login = handleAuthLogin({ code: 'CRUCITTI-9182' });
  const ctx = verifyToken(login.data.token);

  const result = handleLookupsTracks({ sim: 'LMU' }, ctx);
  Logger.log('lookups.tracks (sim=LMU) result:');
  Logger.log(JSON.stringify(result, null, 2));

  if (result.ok) {
    Logger.log(`Tracks LMU: ${result.data.count}`);
    const allLMU = result.data.tracks.every(t => t.sim === 'LMU');
    Logger.log(allLMU ? '✓ Filtro sim funziona' : '⚠️ Filtro sim rotto');
  }
}

/**
 * Test: lookups.cars senza filtri.
 */
function testLookupsCarsAll() {
  const login = handleAuthLogin({ code: 'CRUCITTI-9182' });
  const ctx = verifyToken(login.data.token);

  const result = handleLookupsCars({}, ctx);
  Logger.log('lookups.cars (all) result:');
  Logger.log(JSON.stringify(result, null, 2));

  if (result.ok) {
    Logger.log(`Totale cars attivi: ${result.data.count}`);
  }
}

/**
 * Test: lookups.cars con filtro sim=IRC (dovrebbe essere 0).
 */
function testLookupsCarsByIRC() {
  const login = handleAuthLogin({ code: 'CRUCITTI-9182' });
  const ctx = verifyToken(login.data.token);

  const result = handleLookupsCars({ sim: 'IRC' }, ctx);
  Logger.log('lookups.cars (sim=IRC) result:');
  Logger.log(JSON.stringify(result, null, 2));

  if (result.ok) {
    Logger.log(`Cars IRC: ${result.data.count}`);
  }
}