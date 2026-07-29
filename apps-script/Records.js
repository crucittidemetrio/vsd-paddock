// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Muro dei Record
// ═══════════════════════════════════════════════════════════
//
// Per ogni combinazione (sim, track_id), il giro più veloce mai
// registrato dal team — calcolato a runtime da BestLaps (manuali +
// import Garage61), nessuna tabella dedicata, stesso principio di
// Academy.js e SeasonRecap.js.
//
// Decisioni di scope:
//   - Solo tesserati attualmente attivi (stesso criterio di
//     handleAcademyRanking): un pilota che ha lasciato il team non
//     compare come detentore, anche se il giro esiste ancora in
//     BestLaps. Applicato per coerenza con la decisione già presa
//     per il VR — se in futuro serve un archivio storico che include
//     anche gli ex, è una scelta diversa e va fatta esplicitamente.
//   - Nessun filtro/raggruppamento per auto o classe: il record è
//     "il giro più veloce mai fatto a quella pista da chiunque",
//     non normalizzato per vettura. Scelta deliberata per tenere il
//     muro leggibile invece che frammentato in decine di combinazioni
//     pista+auto con un solo giro ciascuna.
//   - Campo `verified`: true se il giro viene da garage61_lap_id
//     valorizzato (import telemetria automatico), false se inserito
//     a mano — stesso discriminatore già usato per useManualBestLaps.
//
// Deliberatamente FUORI da questa fase: nessun annuncio automatico
// su Discord quando un record viene battuto. Richiederebbe agganciare
// un controllo "è un nuovo record?" dentro handleLapsAdd e dentro il
// sync Garage61 (garage61SyncLaps_) — tocca percorsi di scrittura
// esistenti, va fatto con più cautela di una semplice pagina di
// lettura. Fase 1 qui è solo il muro, in sola lettura.

/**
 * records.team — record di pista per sim, dal roster attivo.
 *
 * @param {Object} payload - { sim? } — se assente, tutti i sim
 * @param {Object} ctx - richiede ctx.driver_id
 */
function handleTeamRecords(payload, ctx) {
  if (!ctx || !ctx.driver_id) return fail('Auth richiesto');

  const simFilter = payload && payload.sim;

  const allLaps = getCachedSheetData_(SHEETS.BEST_LAPS, 600);
  const drivers = getCachedSheetData_(SHEETS.DRIVERS, 600);
  const driverMap = {};
  drivers.forEach(d => { driverMap[d.driver_id] = d; });

  function isCurrentTesserato_(driverId) {
    const d = driverMap[driverId];
    if (!d) return false;
    if (driverId === 'VSD001') return false;
    if (d.removed_at) return false;
    return d.status === 'active';
  }

  const laps = allLaps.filter(l => {
    if (!l.driver_id || !l.sim || !l.track_id) return false;
    if (simFilter && l.sim !== simFilter) return false;
    const ms = Number(l.lap_time_ms);
    if (!ms || ms <= 0) return false;
    return isCurrentTesserato_(l.driver_id);
  });

  const recordsByKey = {};
  laps.forEach(l => {
    const key = l.sim + '|' + l.track_id;
    const ms = Number(l.lap_time_ms);
    if (!recordsByKey[key] || ms < Number(recordsByKey[key].lap_time_ms)) {
      recordsByKey[key] = l;
    }
  });

  const records = Object.values(recordsByKey)
    .map(l => ({
      sim: l.sim,
      track_id: l.track_id,
      driver_id: l.driver_id,
      display_name: (driverMap[l.driver_id] && driverMap[l.driver_id].display_name) || l.driver_id,
      lap_time_ms: Number(l.lap_time_ms),
      lap_time_display: l.lap_time_display || '',
      car_id: l.car_id || '',
      set_date: l.set_date || '',
      verified: Boolean(l.garage61_lap_id),
    }))
    .sort((a, b) => a.sim.localeCompare(b.sim) || a.track_id.localeCompare(b.track_id));

  return ok({ records, count: records.length });
}

// ═══════════════════════════════════════════════════════════
// TEST FUNCTION (utile per debug nell'editor)
// ═══════════════════════════════════════════════════════════

function testTeamRecords() {
  const ctx = { driver_id: 'VSD005', role: 'admin', tier: 'admin', isStaff: true, isAdmin: true };
  const result = handleTeamRecords({}, ctx);
  if (!result.ok) {
    Logger.log('Errore: ' + result.error);
    return;
  }
  Logger.log('Record trovati: ' + result.data.count);
  result.data.records.forEach(r => {
    Logger.log(
      `${r.sim} ${r.track_id}: ${r.display_name} — ${r.lap_time_display}` +
      (r.verified ? ' (Garage61)' : ' (manuale)')
    );
  });
}
