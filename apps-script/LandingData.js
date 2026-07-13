// ═══════════════════════════════════════════════════════════
// LANDING DATA — Endpoint aggregato per la Landing page
// ═══════════════════════════════════════════════════════════
// Restituisce in UNA sola chiamata tutti i dati necessari alla
// Landing: races, laps, reports, drivers, tracks, race results.
// Riduce le fetch da ~9 a 1, eliminando la serializzazione
// Apps Script come causa di lentezza e 404 intermittenti.
//
// Tutti gli handler interni leggono da getCachedSheetData_ →
// zero letture duplicate dello sheet.
// ═══════════════════════════════════════════════════════════

/**
 * landing.data — Aggregato dati Landing.
 * Auth: richiesta (pilota autenticato).
 *
 * @param {Object} payload - { driver_id?: string } (opzionale, usa ctx se assente)
 * @param {Object} ctx - Auth context
 */
function handleLandingData(payload, ctx) {
  if (!ctx || !ctx.driver_id) return fail('Auth richiesta');

  const driverId = ctx.driver_id;

  const racesAll        = handleRacesList({}, ctx);
  const racesUpcoming   = handleRacesUpcoming({}, ctx);
  const manualLaps      = handleLapsList({}, ctx);
  const raceLaps        = handleLapsRaceLaps({}, ctx);
  const allReports      = handleReportsList({}, ctx);
  const myReports       = handleReportsList({ driver_id: driverId }, ctx);
  const drivers         = handleRosterList({}, ctx);
  const tracks          = handleLookupsTracks({}, ctx);
  const myRaceResults   = handleRaceResultsList(
    { driver_id: driverId, session_type: 'race', limit: 200, sort: 'date_desc' }, ctx
  );
  const teamRaceResults = handleRaceResultsList(
    { session_type: 'race', limit: 20, sort: 'date_desc' }, ctx
  );

  return ok({
    all_races:         racesAll.ok      ? racesAll.data.races      : [],
    upcoming_races:    racesUpcoming.ok ? racesUpcoming.data.races  : [],
    manual_laps:       manualLaps.ok    ? manualLaps.data.laps      : [],
    race_laps:         raceLaps.ok      ? raceLaps.data.laps        : [],
    all_reports:       allReports.ok    ? allReports.data.reports   : [],
    my_reports:        myReports.ok     ? myReports.data.reports    : [],
    drivers:           drivers.ok       ? drivers.data.drivers      : [],
    tracks:            tracks.ok        ? tracks.data.tracks        : [],
    my_race_results:   myRaceResults.results   || [],
    team_race_results: teamRaceResults.results || [],
  });
}
