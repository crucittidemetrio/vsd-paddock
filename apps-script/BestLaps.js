// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — BestLaps Endpoints
// ═══════════════════════════════════════════════════════════
// Strategia: backend ritorna sempre l'intero set di laps,
// il frontend filtra in memoria. Coerente con roster.list.
// ═══════════════════════════════════════════════════════════

/**
 * laps.list — Tutti i lap times.
 * Auth: richiesta.
 * 
 * Filtri client-side: il backend NON applica filtri arbitrari.
 * L'unica responsabilità qui è ordinare per lap_time_ms ASC.
 *
 * @param {Object} payload - {} (ignorato)
 * @param {Object} ctx - Auth context (richiesto)
 * @returns {Object} { ok, data: { laps: [...], count } }
 */
function handleLapsList(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');

  const laps = sheetToObjects(SHEETS.BEST_LAPS);

  // Ordina per tempo crescente (più veloce prima)
  laps.sort((a, b) => Number(a.lap_time_ms) - Number(b.lap_time_ms));

  return ok({ laps, count: laps.length });
}

/**
 * laps.leaderboard — Best lap per pilota su un dato (sim, track, [car]).
 * Auth: richiesta.
 *
 * Logica: per ogni driver_id, prende il lap col lap_time_ms minore
 * (best assoluto, indipendente da date/conditions/session_type).
 * Coerente col mockApi.
 *
 * @param {Object} payload - { sim, track_id, car_id? }
 * @param {Object} ctx - Auth context (richiesto)
 * @returns {Object} { ok, data: { laps: [...], count } }
 */
function handleLapsLeaderboard(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');

  const sim = payload && payload.sim;
  const trackId = payload && payload.track_id;
  const carId = payload && payload.car_id;

  if (!sim) return fail('sim mancante');
  if (!trackId) return fail('track_id mancante');

  const allLaps = sheetToObjects(SHEETS.BEST_LAPS);

  // Filtra per sim, track, e (opzionalmente) car
  const filtered = allLaps.filter(l => {
    if (l.sim !== sim) return false;
    if (l.track_id !== trackId) return false;
    if (carId && l.car_id !== carId) return false;
    return true;
  });

  // Group by driver_id, mantieni il lap più veloce
  const byDriver = {};
  filtered.forEach(l => {
    const t = Number(l.lap_time_ms);
    if (!byDriver[l.driver_id] || Number(byDriver[l.driver_id].lap_time_ms) > t) {
      byDriver[l.driver_id] = l;
    }
  });

  // Estrai i best e ordina per tempo crescente
  const best = Object.values(byDriver).sort(
    (a, b) => Number(a.lap_time_ms) - Number(b.lap_time_ms)
  );

  return ok({ laps: best, count: best.length });
}

// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// RACE LAPS — laps derivati da RaceResults
// ═══════════════════════════════════════════════════════════

/**
 * laps.raceLaps — Best lap derivati da RaceResults (gare e qualifying).
 * Solo VSD drivers (is_vsd_driver='TRUE') con best_lap_ms valorizzato.
 *
 * Output schema compatibile con laps.list, più campi extra:
 *  - race_id, race_name: gara di origine
 *  - source: 'race' (per distinguere da manuali)
 *
 * @param {Object} payload - {} (ignorato)
 * @param {Object} ctx - Auth context (richiesto)
 * @returns {Object} { ok, data: { laps, count } }
 */
function handleLapsRaceLaps(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');

  const results = sheetToObjects(SHEETS.RACE_RESULTS);
  const races = getCachedSheetData_(SHEETS.RACES, 900);
  const carMatchMap = buildCarNameToIdMap_();

  // race_id -> race_name lookup
  const raceNameMap = {};
  races.forEach(r => { if (r.race_id) raceNameMap[r.race_id] = r.race_name; });

  const laps = results
    .filter(r => {
      if (String(r.is_vsd_driver).toUpperCase() !== 'TRUE') return false;
      const t = Number(r.best_lap_ms);
      return !isNaN(t) && t > 0;
    })
    .map(r => {
      const lapMs = Number(r.best_lap_ms);
      const carId = matchCarName_(r.car_external_name, carMatchMap) || '';
      return {
        lap_id: `RACELAP-${r.result_id}`,
        driver_id: r.driver_id,
        sim: r.sim,
        track_id: r.track_id,
        car_id: carId,
        car_external_name: r.car_external_name || '',
        lap_time_ms: lapMs,
        lap_time_display: msToLapDisplay_(lapMs),
        set_date: r.set_date,
        conditions: 'race',
        session_type: r.session_type || 'race',
        setup_shared: '',
        setup_link: '',
        replay_url: '',
        verified_by: 'auto',
        verified_at: r.imported_at || '',
        notes: '',
        // Extra fields specific to race-derived laps
        race_id: r.race_id,
        race_name: raceNameMap[r.race_id] || '',
        source: 'race',
      };
    })
    .sort((a, b) => a.lap_time_ms - b.lap_time_ms);

  return ok({ laps, count: laps.length });
}

/**
 * Helper: mappa { car_full_name_lowercase: car_id } dal tab Cars.
 * Tenta match tra car_external_name (LMU JSON) e Cars.full_name/name.
 * Difensivo: prova più nomi di campo per robustezza.
 */
function buildCarNameToIdMap_() {
  const cars = getCachedSheetData_(SHEETS.CARS, 21600);
  const map = {};
  cars.forEach(c => {
    if (!c.car_id) return;
    const candidates = [c.full_name, c.name, c.display_name, c.car_name];
    candidates.forEach(name => {
      if (name) {
        const key = String(name).toLowerCase().trim();
        if (!map[key]) map[key] = c.car_id;
      }
    });
  });
  return map;
}

function matchCarName_(externalName, matchMap) {
  if (!externalName) return null;
  const key = String(externalName).toLowerCase().trim();
  return matchMap[key] || null;
}

// Test
function testLapsRaceLaps() {
  const login = handleAuthLogin({ code: 'DEMETRIO-6899' });
  if (!login.ok) { Logger.log('❌ Login: ' + login.error); return; }
  const ctx = verifyToken(login.data.token);

  const result = handleLapsRaceLaps({}, ctx);
  Logger.log(`Race laps: ${result.data.count}`);
  result.data.laps.slice(0, 5).forEach(l => {
    Logger.log(`  ${l.lap_id} | ${l.driver_id} | ${l.lap_time_display} | ${l.track_id} | car_id=${l.car_id || 'NO_MATCH'} (${l.car_external_name})`);
  });
}