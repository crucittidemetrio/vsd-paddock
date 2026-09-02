// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Muro dei Record
// ═══════════════════════════════════════════════════════════
//
// Per ogni combinazione (sim, track_id, race_class), il giro più
// veloce mai registrato dal team — calcolato a runtime da BestLaps
// (manuali + import Garage61), nessuna tabella dedicata, stesso
// principio di Academy.js e SeasonRecap.js.
//
// Decisioni di scope:
//   - Solo tesserati attualmente attivi (stesso criterio di
//     handleAcademyRanking): un pilota che ha lasciato il team non
//     compare come detentore, anche se il giro esiste ancora in
//     BestLaps. Applicato per coerenza con la decisione già presa
//     per il VR — se in futuro serve un archivio storico che include
//     anche gli ex, è una scelta diversa e va fatta esplicitamente.
//   - Raggruppato per race_class (classe auto, da Cars.race_class):
//     un record separato per ogni categoria su ogni pista, stesso
//     criterio già usato da useTeamLeaderboard in BestLaps. In
//     precedenza il muro mostrava un solo giro per pista senza tener
//     conto della classe — cambiato su richiesta esplicita del team,
//     perché un tempo Hypercar e uno GT3 sulla stessa pista non sono
//     confrontabili. I giri di auto SENZA race_class assegnato in
//     Cars finiscono in un bucket "Non classificato" invece di
//     sparire, per non far perdere record già mostrati in passato.
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
 * @param {Object} payload - { sim?, include_ex_vsd? } — sim: se assente,
 *   tutti i sim. include_ex_vsd: bypassa il filtro "solo tesserati
 *   attivi" e include anche gli ex piloti come detentori — onorato SOLO
 *   se ctx.isAdmin (mai in base al payload da solo, per non permettere a
 *   un pilota qualunque di forzarlo). Pensato per un toggle visibile solo
 *   all'admin lato UI: i confronti restano tra compagni attuali di
 *   default, l'admin può rivelare lo storico completo on-demand.
 * @param {Object} ctx - richiede ctx.driver_id
 */
function handleTeamRecords(payload, ctx) {
  if (!ctx || !ctx.driver_id) return fail('Auth richiesto');

  const simFilter = payload && payload.sim;
  const includeExVsd = Boolean(ctx.isAdmin && payload &&
    (payload.include_ex_vsd === true || payload.include_ex_vsd === 'true'));

  const allLaps = getCachedSheetData_(SHEETS.BEST_LAPS, 600);
  const drivers = getCachedSheetData_(SHEETS.DRIVERS, 600);
  const cars = getCachedSheetData_(SHEETS.CARS, 21600);
  const driverMap = {};
  drivers.forEach(d => { driverMap[d.driver_id] = d; });
  const carRaceClass = {};
  cars.forEach(c => {
    if (c.car_id) carRaceClass[c.car_id] = (c.race_class && String(c.race_class).trim()) || null;
  });

  function isExVsd_(driverId) {
    const d = driverMap[driverId];
    if (!d) return false;
    return Boolean(d.removed_at) || d.status !== 'active';
  }

  function isEligible_(driverId) {
    const d = driverMap[driverId];
    if (!d) return false;
    if (driverId === 'VSD001') return false; // account di sistema, mai un "detentore"
    if (includeExVsd) return true;
    return !isExVsd_(driverId);
  }

  const laps = allLaps.filter(l => {
    if (!l.driver_id || !l.sim || !l.track_id) return false;
    if (simFilter && l.sim !== simFilter) return false;
    const ms = Number(l.lap_time_ms);
    if (!ms || ms <= 0) return false;
    return isEligible_(l.driver_id);
  });

  const recordsByKey = {};
  laps.forEach(l => {
    const raceClass = carRaceClass[l.car_id] || null; // null → bucket "Non classificato"
    const key = l.sim + '|' + l.track_id + '|' + (raceClass || '');
    const ms = Number(l.lap_time_ms);
    if (!recordsByKey[key] || ms < Number(recordsByKey[key].lap.lap_time_ms)) {
      recordsByKey[key] = { lap: l, race_class: raceClass };
    }
  });

  const records = Object.values(recordsByKey)
    .map(entry => {
      const l = entry.lap;
      return {
        sim: l.sim,
        track_id: l.track_id,
        race_class: entry.race_class, // null = non classificato
        driver_id: l.driver_id,
        display_name: (driverMap[l.driver_id] && driverMap[l.driver_id].display_name) || l.driver_id,
        lap_time_ms: Number(l.lap_time_ms),
        lap_time_display: l.lap_time_display || '',
        car_id: l.car_id || '',
        set_date: l.set_date || '',
        verified: Boolean(l.garage61_lap_id),
        is_ex_vsd: isExVsd_(l.driver_id),
      };
    })
    .sort((a, b) =>
      a.sim.localeCompare(b.sim) ||
      a.track_id.localeCompare(b.track_id) ||
      String(a.race_class || 'zzz').localeCompare(String(b.race_class || 'zzz'))
    );

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
      `${r.sim} ${r.track_id} [${r.race_class || 'non classificato'}]: ${r.display_name} — ${r.lap_time_display}` +
      (r.verified ? ' (Garage61)' : ' (manuale)')
    );
  });
}
