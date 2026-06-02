// ═══════════════════════════════════════════════════════════
// RACE RESULTS — list endpoint (con filtri estesi)
// ═══════════════════════════════════════════════════════════

function handleRaceResultsList(payload, ctx) {
   const all = sheetToObjects(SHEETS.RACE_RESULTS);

  const raceIdFilter = payload && payload.race_id ? String(payload.race_id) : null;
  const sessionFilter = payload && payload.session_type ? String(payload.session_type) : null;
  const driverIdFilter = payload && payload.driver_id ? String(payload.driver_id) : null;
  const limit = payload && payload.limit ? Number(payload.limit) : null;
  const sortOrder = payload && payload.sort ? String(payload.sort) : null; // 'date_desc' | 'date_asc'

  let filtered = all;

  if (raceIdFilter) {
    filtered = filtered.filter(r => String(r.race_id) === raceIdFilter);
  }
  if (sessionFilter) {
    filtered = filtered.filter(r => String(r.session_type) === sessionFilter);
  }
  if (driverIdFilter) {
    filtered = filtered.filter(r => String(r.driver_id) === driverIdFilter);
  }

  // Coerce types per il frontend
  const results = filtered.map(r => ({
    result_id: r.result_id,
    race_id: r.race_id || '',
    sim: r.sim || '',
    track_id: r.track_id || '',
    set_date: r.set_date || '',
    session_type: r.session_type || '',
    car_class: r.car_class || '',
    car_num: r.car_num !== '' && r.car_num != null ? Number(r.car_num) : null,
    car_external_name: r.car_external_name || '',
    driver_id: r.driver_id || '',
    driver_name_external: r.driver_name_external || '',
    total_laps: r.total_laps !== '' && r.total_laps != null ? Number(r.total_laps) : null,
    best_lap_ms: r.best_lap_ms !== '' && r.best_lap_ms != null ? Number(r.best_lap_ms) : null,
    best_lap_display: r.best_lap_display || '',
    total_time_ms: r.total_time_ms !== '' && r.total_time_ms != null ? Number(r.total_time_ms) : null,
    total_time_display: r.total_time_display || '',
    finish_position: r.finish_position !== '' && r.finish_position != null ? Number(r.finish_position) : null,
    points_given: r.points_given !== '' && r.points_given != null ? Number(r.points_given) : null,
    penalty_points: r.penalty_points !== '' && r.penalty_points != null ? Number(r.penalty_points) : null,
    point_total: r.point_total !== '' && r.point_total != null ? Number(r.point_total) : null,
    dnf: String(r.dnf).toUpperCase() === 'TRUE',
    dns: String(r.dns).toUpperCase() === 'TRUE',
    is_vsd_driver: String(r.is_vsd_driver).toUpperCase() === 'TRUE',
  }));

  // Sort
  if (sortOrder === 'date_desc') {
    results.sort((a, b) => String(b.set_date).localeCompare(String(a.set_date)));
  } else if (sortOrder === 'date_asc') {
    results.sort((a, b) => String(a.set_date).localeCompare(String(b.set_date)));
  } else {
    // Default: car_class + finish_position
    results.sort((a, b) => {
      if (a.car_class !== b.car_class) return a.car_class.localeCompare(b.car_class);
      return (a.finish_position || 999) - (b.finish_position || 999);
    });
  }

  // Limit
  const finalResults = limit && limit > 0 ? results.slice(0, limit) : results;

  return { results: finalResults, count: finalResults.length, totalAvailable: results.length };
}