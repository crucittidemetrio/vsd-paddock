// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Season Recap (personale)
// ═══════════════════════════════════════════════════════════
//
// Riepilogo stagionale personale, calcolato a runtime da RaceResults
// — nessuna tabella dedicata, stesso principio di Academy.js.
//
// Fase 1, scope deliberatamente ridotto:
//   - Solo il proprio recap (ctx.driver_id) — niente recap di altri
//     piloti ancora, per non aprire domande di privacy su dati che
//     oggi non sono pubblici in questa forma aggregata.
//   - Confine stagione: stesso criterio già in uso in
//     src/hooks/useBestLaps.js (SEASON_2026_START, 1 gennaio 2026)
//     — nessun nuovo concetto di "stagione", riuso quello esistente.
//   - Cross-sim per le statistiche di conteggio (gare, podi, DNF):
//     qui è legittimo, a differenza del VR — non è un punteggio di
//     merito da confrontare tra sim, sono solo conteggi personali.
//   - Solo sessioni session_type === 'race' contano (stesso criterio
//     di Academy.js).
//
// Deliberatamente FUORI da questa fase:
//   - Recap di un altro pilota (guardare lo storico di qualcun
//     altro in questa forma aggregata solleva domande di privacy
//     diverse dal roster pubblico — da valutare a parte se richiesto).
//   - Confronto con la stagione precedente ("rispetto allo scorso
//     anno") — richiede uno storico multi-stagione non ancora
//     modellato in modo pulito.
//   - Card immagine condivisibile — questa è solo la pagina dati;
//     l'export visivo è un passo successivo, non incluso qui.

const RECAP_SEASON_START = '2026-01-01';

/**
 * recap.mine — riepilogo stagionale del pilota loggato.
 *
 * @param {Object} payload - {} (nessun parametro ancora)
 * @param {Object} ctx - richiede ctx.driver_id
 * @returns {Object} { ok, data: { season_start, races, podiums, dnfs,
 *   bestFinish, bestLap, mostRacedTrack, bySim } }
 */
function handleSeasonRecap(payload, ctx) {
  if (!ctx || !ctx.driver_id) return fail('Auth richiesto');

  const driverId = ctx.driver_id;
  const seasonStartTime = new Date(RECAP_SEASON_START).getTime();

  const allResults = getCachedSheetData_(SHEETS.RACE_RESULTS, 600);
  const results = allResults.filter(r => {
    if (r.driver_id !== driverId) return false;
    if (r.session_type !== 'race') return false;
    const d = r.set_date ? new Date(r.set_date).getTime() : NaN;
    if (Number.isNaN(d)) return false;
    return d >= seasonStartTime;
  });

  const races = results.length;
  const podiums = results.filter(r => {
    const pos = Number(r.finish_position);
    return pos >= 1 && pos <= 3;
  }).length;
  const dnfs = results.filter(r => String(r.dnf).toUpperCase() === 'TRUE').length;

  let bestFinish = null;
  results.forEach(r => {
    const pos = Number(r.finish_position);
    if (!pos || pos < 1) return;
    if (!bestFinish || pos < bestFinish.position) {
      bestFinish = {
        position: pos,
        race_id: r.race_id,
        track_id: r.track_id || '',
        sim: r.sim || '',
        car_class: r.car_class || '',
      };
    }
  });

  let bestLap = null;
  results.forEach(r => {
    const ms = Number(r.best_lap_ms);
    if (!ms || ms <= 0) return;
    if (!bestLap || ms < bestLap.ms) {
      bestLap = {
        ms,
        display: r.best_lap_display || '',
        race_id: r.race_id,
        track_id: r.track_id || '',
        sim: r.sim || '',
      };
    }
  });

  const trackCounts = {};
  results.forEach(r => {
    if (!r.track_id) return;
    trackCounts[r.track_id] = (trackCounts[r.track_id] || 0) + 1;
  });
  let mostRacedTrack = null;
  Object.keys(trackCounts).forEach(trackId => {
    if (!mostRacedTrack || trackCounts[trackId] > mostRacedTrack.count) {
      mostRacedTrack = { track_id: trackId, count: trackCounts[trackId] };
    }
  });

  const simCounts = {};
  results.forEach(r => {
    if (!r.sim) return;
    simCounts[r.sim] = (simCounts[r.sim] || 0) + 1;
  });
  const bySim = Object.keys(simCounts)
    .map(sim => ({ sim, races: simCounts[sim] }))
    .sort((a, b) => b.races - a.races);

  return ok({
    season_start: RECAP_SEASON_START,
    races,
    podiums,
    dnfs,
    bestFinish,
    bestLap,
    mostRacedTrack,
    bySim,
  });
}

// ═══════════════════════════════════════════════════════════
// TEST FUNCTION (utile per debug nell'editor)
// ═══════════════════════════════════════════════════════════

function testSeasonRecap() {
  const ctx = { driver_id: 'VSD005', role: 'admin', tier: 'admin', isStaff: true, isAdmin: true };
  const result = handleSeasonRecap({}, ctx);
  if (!result.ok) {
    Logger.log('Errore: ' + result.error);
    return;
  }
  Logger.log(JSON.stringify(result.data, null, 2));
}
