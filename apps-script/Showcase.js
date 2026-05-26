// ═══════════════════════════════════════════════════════════
// SHOWCASE — Endpoint pubblico per /joinus
// ═══════════════════════════════════════════════════════════
// Nessuna autenticazione richiesta.
// I dati di gare e best lap sono "denormalizzati": il backend
// joina con Tracks e Cars per dare al frontend nomi leggibili
// senza richiedere endpoint lookup separati.
// ═══════════════════════════════════════════════════════════

function handleShowcaseSummary(payload, ctx) {
  const drivers = sheetToObjects(SHEETS.DRIVERS);
  const races = sheetToObjects(SHEETS.RACES);
  const reports = sheetToObjects(SHEETS.RACE_REPORTS);
  const manualLaps = sheetToObjects(SHEETS.BEST_LAPS);
  const raceResults = sheetToObjects(SHEETS.RACE_RESULTS);
  const tracks = sheetToObjects(SHEETS.TRACKS);
  const cars = sheetToObjects(SHEETS.CARS);

  // Lookup maps per join veloce (case-insensitive)
  const trackById = {};
  tracks.forEach(t => { trackById[String(t.track_id).toLowerCase()] = t; });
  const carById = {};
  cars.forEach(c => { carById[String(c.car_id).toLowerCase()] = c; });
  const raceById = {};
  races.forEach(r => { raceById[r.race_id] = r; });

  function getTrackName(track_id) {
    if (!track_id) return null;
    const t = trackById[String(track_id).toLowerCase()];
    return t ? t.track_name : track_id;
  }
  function getCarName(car_id) {
    if (!car_id) return null;
    const c = carById[String(car_id).toLowerCase()];
    return c ? c.car_name : car_id;
  }
  function getCarCategory(car_id) {
    if (!car_id) return null;
    const c = carById[String(car_id).toLowerCase()];
    return c ? (c.category || null) : null;
  }

  // --- Stats aggregate ---
  const activeDrivers = drivers.filter(d => String(d.status).toLowerCase() === 'active');
  const completedRaces = races.filter(r => String(r.status).toLowerCase() === 'completed');
  // --- Podi: union RaceReports (self-submitted) + RaceResults (imported) ---
  const podiumsFromReports = reports.filter(r => {
    const pos = Number(r.finish_position);
    return !isNaN(pos) && pos > 0 && pos <= 3;
  });

  const podiumsFromResults = raceResults.filter(rr => {
    if (String(rr.session_type).toLowerCase() !== 'race') return false;
    if (String(rr.is_vsd_driver).toUpperCase() !== 'TRUE') return false;
    if (String(rr.dnf).toUpperCase() === 'TRUE') return false;
    if (String(rr.dns).toUpperCase() === 'TRUE') return false;
    const pos = Number(rr.finish_position);
    return !isNaN(pos) && pos > 0 && pos <= 3;
  });

  // Dedup per (race_id, driver_id) — un pilota appare al massimo una volta per gara
  const seenPodiums = new Set();
  const podiums = [];
  [...podiumsFromReports, ...podiumsFromResults].forEach(p => {
    const key = `${p.race_id}__${p.driver_id}`;
    if (!seenPodiums.has(key)) {
      seenPodiums.add(key);
      podiums.push(p);
    }
  });

  // --- Best laps verificati: manuali (con verified_by) + race laps di piloti VSD ---
  const verifiedManualLaps = manualLaps.filter(l => l.verified_by && String(l.verified_by).trim());

  const raceLaps = raceResults
    .filter(rr => {
      const isVsd = String(rr.is_vsd_driver).toUpperCase() === 'TRUE';
      const lapMs = Number(rr.best_lap_ms);
      return isVsd && !isNaN(lapMs) && lapMs > 0;
    })
    .map(rr => {
      const race = raceById[rr.race_id];
      return {
        driver_id: rr.driver_id,
        lap_time_ms: Number(rr.best_lap_ms),
        lap_time_display: rr.best_lap_display,
        sim: rr.sim || (race ? race.sim : null),
        track_id: rr.track_id || (race ? race.track_id : null),
        car_id: race ? race.car_id : null,
        car_external_name: rr.car_external_name ? String(rr.car_external_name).trim() : null,
        set_date: rr.set_date || (race ? race.date : null),
      };
    })
    .filter(l => l.set_date && l.lap_time_display);

  const allVerifiedLaps = [...verifiedManualLaps, ...raceLaps];

  const stats = {
    drivers_count: activeDrivers.length,
    races_count: completedRaces.length,
    podiums_count: podiums.length,
    verified_laps_count: allVerifiedLaps.length,
  };

  // --- Top 5 piloti per numero podi ---
  const podiumByDriver = {};
  podiums.forEach(r => {
    podiumByDriver[r.driver_id] = (podiumByDriver[r.driver_id] || 0) + 1;
  });

  const topDrivers = activeDrivers
    .map(d => ({
      driver_id: d.driver_id,
      display_name: d.display_name,
      avatar_url: d.avatar_url || null,
      podiums: podiumByDriver[d.driver_id] || 0,
    }))
    .sort((a, b) => b.podiums - a.podiums)
    .slice(0, 5);

  // --- Prossime 3 gare programmate ---
  const now = new Date();
  const upcomingRaces = races
    .filter(r => {
      if (String(r.status).toLowerCase() !== 'scheduled') return false;
      const raceDate = new Date(r.date);
      return !isNaN(raceDate.getTime()) && raceDate > now;
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 3)
    .map(r => ({
      race_id: r.race_id,
      race_name: r.race_name,
      sim: r.sim,
      track_id: r.track_id,
      track_name: getTrackName(r.track_id),
      car_id: r.car_id,
      car_name: getCarName(r.car_id),
      car_category: getCarCategory(r.car_id),
      date: r.date,
      duration_minutes: r.duration_minutes,
      championship: r.championship,
    }));

  // --- Best lap più recente (merge manuali + race) ---
  const recentLaps = allVerifiedLaps
    .filter(l => l.set_date)
    .sort((a, b) => new Date(b.set_date) - new Date(a.set_date));

  let latestBestLap = null;
  if (recentLaps.length > 0) {
    const l = recentLaps[0];
    const driver = drivers.find(d => d.driver_id === l.driver_id);
    latestBestLap = {
      driver_name: driver ? driver.display_name : l.driver_id,
      lap_time_display: l.lap_time_display,
      lap_time_ms: l.lap_time_ms,
      sim: l.sim,
      track_id: l.track_id,
      track_name: getTrackName(l.track_id),
      car_id: l.car_id,
      car_name: l.car_external_name || getCarName(l.car_id),
      set_date: l.set_date,
    };
  }

  return ok({
    stats,
    topDrivers,
    upcomingRaces,
    latestBestLap,
  });
}

// ═══════════════════════════════════════════════════════════
// TEST
// ═══════════════════════════════════════════════════════════

function testShowcaseSummary() {
  const result = handleShowcaseSummary({}, null);
  Logger.log(JSON.stringify(result, null, 2));
}