// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Academy / Pilot Rating (VPR) — Fase 1
// ═══════════════════════════════════════════════════════════
//
// Rating "VR" per pilota, per simulatore, calcolato a runtime da
// RaceResults — nessuna tabella dedicata (unica fonte di verità,
// nessun dato duplicato che può disallinearsi). Spec completa:
// "VSD Pilot Rating System — Documento Teorico e Piano di
// Integrazione" v1.2 (Demetrio Crucitti).
//
// Questa è una CLASSIFICA DI ANTEPRIMA, non il VR definitivo della
// spec. Fase 1 implementa deliberatamente un sottoinsieme:
//
//   INCLUSO:
//   - PM_base per finish_position (già class-relative — vedi
//     RaceResultsImport.js, sort dentro classGroup prima di
//     assegnare la posizione), scala F1 ricalibrata
//     25-18-15-12-10-8-6-4-2-1.
//   - Bonus giro veloce in gara (+1): best_lap_ms minimo nel
//     gruppo (race_id + car_class + session_type='race').
//   - Bonus presenza ≥75% giri (+1): total_laps rispetto al
//     leader dello stesso gruppo.
//   - Bonus pole (+1): SOLO se esiste una sessione 'qualifying'
//     gemella per lo stesso race_id + car_class — non garantito
//     per import LMU manuali, quindi opportunistico per design.
//   - VR = somma PM su TUTTE le gare disponibili per quel sim
//     (nessuno scoping per stagione — vedi sotto).
//
//   DELIBERATAMENTE FUORI (arrivano con le fasi successive):
//   - Punti Penalità (PP) — richiede il tab DriverPenalties
//     (Fase 2). VR qui è solo PM.
//   - Bonus fair play (+5, ha senso solo con PP≥0 tracciato) e
//     full attendance (+3, richiede un calendario stagionale
//     definito) — entrambi bonus di fine stagione, non per-gara.
//   - Scarto del risultato peggiore — richiede un confine di
//     stagione (Championships.season via Races.championship_id),
//     volutamente non ancora agganciato per tenere Fase 1 ridotta
//     a un singolo consumo di RaceResults.
//   - Badge (Bronzo/Argento/Oro/Platino) — Fase 3, dopo che PP è
//     incluso e le soglie sono calibrate su dati reali (Fase 4).
//
// Solo sessioni con session_type === 'race' contribuiscono al PM
// (le sessioni 'heat' esistono nello schema ma non sono nella
// spec — escluse per non introdurre un doppio conteggio non
// richiesto).
//
// Auth: riservato ai tesserati loggati (ctx.driver_id), stesso
// gate di reports.list — non è un endpoint pubblico.

// ═══════════════════════════════════════════════════════════
// FASE 2 — Punti Penalità (PP)
// ═══════════════════════════════════════════════════════════
// Letti a runtime da IncidentResolutions (Incidents.js) — NESSUNA tabella
// DriverPenalties dedicata: stessa scelta "unica fonte di verità" già
// usata per il PM sopra. Un incidente contribuisce ai PP solo se lo staff
// ha compilato ESPLICITAMENTE sia "sim" che "penalized_driver_id" in fase
// di risoluzione (vedi handleIncidentsResolve) — gli incidenti risolti
// PRIMA dell'introduzione di questi due campi restano a 0 PP finché non
// vengono riclassificati a mano: nessun ricalcolo retroattivo automatico,
// per scelta esplicita (non penalizzare nessuno senza revisione).
//
// Mappa punti — BOZZA iniziale, calibrazione reale rimandata a Fase 4
// come da spec (§ soglie su dati reali). Facilmente rivedibile qui.
const PP_PENALTY_POINTS = {
  '': 0,
  'nessuna': 0,
  'warning': -1,
  'penalità lieve': -2,
  'penalità media': -4,
  'penalità pesante': -7,
  'squalifica': -10,
};

/**
 * Somma i PP per (sim, driver_id) da IncidentResolutions. Non scoping
 * stagionale (stessa scelta già fatta per il PM in Fase 1) — somma su
 * TUTTI gli incidenti risolti per quel sim.
 * @returns {Object} driver_id → { pp, penalties_count }
 */
function computePenaltyPoints_(sim) {
  const resolutions = sheetToObjects(SHEETS.INCIDENT_RESOLUTIONS);
  const ppByDriver = {};
  resolutions.forEach(r => {
    const driverId = String(r.penalized_driver_id || '').trim();
    const resSim = String(r.sim || '').trim();
    if (!driverId || resSim !== sim) return; // non riclassificato o altro sim
    const points = PP_PENALTY_POINTS[String(r.penalty_type || '')];
    if (points === undefined) return; // penalty_type non mappato, ignora invece di rompere
    if (!ppByDriver[driverId]) ppByDriver[driverId] = { pp: 0, penalties_count: 0 };
    ppByDriver[driverId].pp += points;
    if (points !== 0) ppByDriver[driverId].penalties_count += 1;
  });
  return ppByDriver;
}

// ═══════════════════════════════════════════════════════════
// FASE 3 — Badge (Bronzo/Argento/Oro/Platino)
// ═══════════════════════════════════════════════════════════
// DEVIAZIONE DELIBERATA dalla spec originale: la spec parla di "soglie"
// (punti VR fissi), ma i dati reali (testAcademyRanking, verificati il
// 20/08/2026) mostrano che sim con meno gare importate finora (IRC, ACE)
// hanno VR massimi strutturalmente molto più bassi di LMU — una soglia
// fissa penalizzerebbe chi corre su un sim "giovane" sul Paddock, non chi
// è meno forte. Percentili PER SIM invece si autocalibrano sempre, senza
// bisogno di una Fase 4 di ritocco manuale.
//
// Solo i piloti con ALMENO ACADEMY_BADGE_MIN_RACES in quel sim entrano
// nel calcolo — gara singola fortunata non deve poter valere Platino.
// Chi sta sotto soglia non riceve badge (badge: null), non un'etichetta
// "non classificato" — stesso trattamento già scelto per l'Indice Skill.
const ACADEMY_BADGE_MIN_RACES = 5;
const ACADEMY_BADGE_CUTOFFS = { platino: 0.10, oro: 0.35, argento: 0.65 }; // resto → bronzo

// Soglia minima gare per comparire nella classifica "passo puro" (gap %
// medio dal giro veloce di gruppo) — stessa logica di SKILL_INDEX_MIN_RACES:
// una singola gara con un giro fortunato non deve poter valere il primo
// posto in una classifica di costanza sul ritmo.
const ACADEMY_PACE_MIN_RACES = 3;

/**
 * Assegna badge PER-SIM alla ranking già ordinata per vr decrescente.
 * Muta le righe in-place (aggiunge/aggiorna `badge`). Ranking con meno
 * di ACADEMY_BADGE_MIN_RACES restano a badge: null (default già presente
 * dal chiamante).
 */
function assignAcademyBadges_(ranking) {
  const qualifying = ranking.filter(r => r.races >= ACADEMY_BADGE_MIN_RACES);
  const n = qualifying.length;
  if (n === 0) return;

  const platinoEnd = Math.max(1, Math.round(n * ACADEMY_BADGE_CUTOFFS.platino));
  const oroEnd = Math.max(platinoEnd + 1, Math.round(n * ACADEMY_BADGE_CUTOFFS.oro));
  const argentoEnd = Math.max(oroEnd + 1, Math.round(n * ACADEMY_BADGE_CUTOFFS.argento));

  qualifying.forEach((r, idx) => {
    const rank = idx + 1; // qualifying eredita l'ordine già decrescente di ranking
    if (rank <= platinoEnd) r.badge = 'platino';
    else if (rank <= oroEnd) r.badge = 'oro';
    else if (rank <= argentoEnd) r.badge = 'argento';
    else r.badge = 'bronzo';
  });
}

/**
 * academy.ranking — classifica VR (PM + PP, Fase 2) per un simulatore.
 * PM = Punti Merito (posizione, giro veloce, presenza, pole — Fase 1).
 * PP = Punti Penalità (incidenti risolti dallo staff — Fase 2, vedi sopra).
 * Formula trasparente come Skill Index: pm e pp esposti separatamente,
 * mai solo il totale, così chi guarda vede da cosa deriva il numero.
 *
 * Espone anche `paceRanking`: classifica separata "passo puro" (gap %
 * medio dal giro veloce di gruppo + miglior giro in assoluto), scollegata
 * da PM/PP/badge — pura trasparenza sul ritmo, non sostituisce il VR.
 *
 * @param {Object} payload - { sim: 'LMU'|'IRC'|'ACE' } — sim obbligatorio
 * @param {Object} ctx - richiede ctx.driver_id (tesserato loggato)
 * @returns {Object} { ok, data: { sim, ranking: [...], count, paceRanking: [...], paceRankingMinRaces } }
 */
function handleAcademyRanking(payload, ctx) {
  if (!ctx || !ctx.driver_id) return fail('Auth richiesto');

  const sim = payload && payload.sim;
  if (!sim) return fail('sim mancante');

  const allResults = getCachedSheetData_(SHEETS.RACE_RESULTS, 600);
  const results = allResults.filter(r => r.sim === sim && r.driver_id);

  // Raggruppa per (race_id, car_class, session_type): stesso riferimento
  // usato da RaceResultsImport per calcolare finish_position, così i
  // bonus "in-gruppo" (giro veloce, presenza, pole) sono coerenti con
  // com'è stata giudicata la gara al momento dell'import.
  const groups = {};
  results.forEach(r => {
    const key = [r.race_id, r.car_class, r.session_type].join('|');
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  });

  // driver_id → { pm, races }
  const pmByDriver = {};
  // driver_id → { gapSum, races } — per la classifica "passo puro" sotto,
  // accumulato nello stesso giro dei gruppi per non rileggere RaceResults.
  const paceByDriver = {};

  Object.keys(groups).forEach(key => {
    const group = groups[key];
    const sessionType = group[0].session_type;

    // Il PM si assegna solo alle sessioni di gara. Le sessioni
    // 'qualifying' vengono lette a parte (sotto) solo per il bonus pole.
    if (sessionType !== 'race') return;

    const leaderLaps = Math.max(0, ...group.map(r => Number(r.total_laps) || 0));

    const validLaps = group.filter(r => r.best_lap_ms != null && Number(r.best_lap_ms) > 0);
    const fastestMs = validLaps.length
      ? Math.min(...validLaps.map(r => Number(r.best_lap_ms)))
      : null;

    // Pole: cerca la sessione 'qualifying' gemella per lo stesso
    // race_id + car_class. Se non esiste (import senza quali), nessun
    // pilota prende il bonus per questa gara — comportamento atteso,
    // non un errore.
    const poleKey = [group[0].race_id, group[0].car_class, 'qualifying'].join('|');
    const poleGroup = groups[poleKey];
    let poleDriverId = null;
    if (poleGroup && poleGroup.length) {
      const poleWinner = poleGroup.slice().sort((a, b) =>
        (Number(a.finish_position) || 999) - (Number(b.finish_position) || 999)
      )[0];
      poleDriverId = poleWinner ? poleWinner.driver_id : null;
    }

    group.forEach(r => {
      if (!r.driver_id) return; // solo tesserati matchati, mai piloti esterni

      let pm = pmBase_(Number(r.finish_position));
      if (fastestMs != null && Number(r.best_lap_ms) === fastestMs) pm += 1; // giro veloce
      if (leaderLaps > 0 && (Number(r.total_laps) || 0) / leaderLaps >= 0.75) pm += 1; // presenza
      if (poleDriverId && r.driver_id === poleDriverId) pm += 1; // pole

      if (!pmByDriver[r.driver_id]) pmByDriver[r.driver_id] = { pm: 0, races: 0 };
      pmByDriver[r.driver_id].pm += pm;
      pmByDriver[r.driver_id].races += 1;

      // Passo puro: gap % dal giro più veloce del gruppo (race_id +
      // car_class), indipendente da piazzamento/incidenti/bonus. Solo se
      // il pilota ha un best_lap_ms valido in QUESTA gara — non tutte le
      // gare hanno telemetria per tutti (es. ritiro prima del giro veloce).
      // Traccia anche il giro più veloce IN ASSOLUTO del pilota su tutte
      // le sue gare in questo sim (non solo la media del gap%), su
      // richiesta esplicita: la media premia la costanza ma nasconde il
      // picco di prestazione — utile mostrare entrambi.
      if (fastestMs != null && r.best_lap_ms != null && Number(r.best_lap_ms) > 0) {
        const lapMs = Number(r.best_lap_ms);
        const gapPct = (lapMs - fastestMs) / fastestMs * 100;
        if (!paceByDriver[r.driver_id]) {
          paceByDriver[r.driver_id] = { gapSum: 0, races: 0, bestLapMs: null, bestLapTrackId: null };
        }
        const pace = paceByDriver[r.driver_id];
        pace.gapSum += gapPct;
        pace.races += 1;
        if (pace.bestLapMs == null || lapMs < pace.bestLapMs) {
          pace.bestLapMs = lapMs;
          pace.bestLapTrackId = r.track_id || null;
        }
      }
    });
  });

  const drivers = getCachedSheetData_(SHEETS.DRIVERS, 600);
  const driverMap = {};
  drivers.forEach(d => { driverMap[d.driver_id] = d; });

  // Il VPR è "per i tesserati, punto" (§1 della spec) — un pilota che ha
  // lasciato il team resta nello storico di RaceResults ma non deve
  // comparire in una classifica di merito interna corrente. Stesso
  // filtro di default di handleRosterList (Roster.js): esclude rimossi
  // (removed_at) e non-attivi (status !== 'active'), account di sistema
  // escluso a prescindere.
  function isCurrentTesserato_(driverId) {
    const d = driverMap[driverId];
    if (!d) return false; // driver_id in RaceResults senza corrispondenza in Drivers
    if (driverId === 'VSD001') return false;
    if (d.removed_at) return false;
    return d.status === 'active';
  }

  const ppByDriver = computePenaltyPoints_(sim);

  // Classifica "passo puro": gap % medio dal giro veloce di gruppo,
  // indipendente da PM/PP/badge — trasparenza pura sul ritmo. Soglia
  // minima gare coerente con l'Indice Skill (evita che una gara isolata
  // con un giro fortunato scavalchi chi corre con costanza.
  const paceRanking = Object.keys(paceByDriver)
    .filter(isCurrentTesserato_)
    .filter(driverId => paceByDriver[driverId].races >= ACADEMY_PACE_MIN_RACES)
    .map(driverId => {
      const p = paceByDriver[driverId];
      return {
        driver_id: driverId,
        display_name: (driverMap[driverId] && driverMap[driverId].display_name) || driverId,
        avatar_url: (driverMap[driverId] && driverMap[driverId].avatar_url) || '',
        avg_gap_pct: Math.round((p.gapSum / p.races) * 100) / 100,
        best_lap_ms: p.bestLapMs,
        best_lap_track_id: p.bestLapTrackId,
        races: p.races,
      };
    })
    .sort((a, b) => a.avg_gap_pct - b.avg_gap_pct);

  const ranking = Object.keys(pmByDriver)
    .filter(isCurrentTesserato_)
    .map(driverId => {
      const pm = pmByDriver[driverId].pm;
      const pp = (ppByDriver[driverId] && ppByDriver[driverId].pp) || 0;
      return {
        driver_id: driverId,
        display_name: (driverMap[driverId] && driverMap[driverId].display_name) || driverId,
        avatar_url: (driverMap[driverId] && driverMap[driverId].avatar_url) || '',
        pm,
        pp,
        vr: pm + pp,
        races: pmByDriver[driverId].races,
        penalties_count: (ppByDriver[driverId] && ppByDriver[driverId].penalties_count) || 0,
        badge: null,
      };
    })
    .sort((a, b) => b.vr - a.vr);

  assignAcademyBadges_(ranking);

  return ok({
    sim,
    ranking,
    count: ranking.length,
    paceRanking,
    paceRankingMinRaces: ACADEMY_PACE_MIN_RACES,
  });
}

/**
 * Scala F1-ricalibrata (§3.2 della spec VPR) per finish_position
 * dentro la propria classe. Posizioni oltre la 10° o assenti → 0.
 */
const ACADEMY_PM_BASE_TABLE = { 1: 25, 2: 18, 3: 15, 4: 12, 5: 10, 6: 8, 7: 6, 8: 4, 9: 2, 10: 1 };

function pmBase_(position) {
  if (!position || position < 1) return 0;
  return ACADEMY_PM_BASE_TABLE[position] || 0;
}

// ═══════════════════════════════════════════════════════════
// TEST FUNCTION (utile per debug nell'editor)
// ═══════════════════════════════════════════════════════════

function testAcademyRanking() {
  const ctx = { driver_id: 'VSD005', role: 'admin', tier: 'admin', isStaff: true, isAdmin: true };
  ['LMU', 'IRC', 'ACE'].forEach(sim => {
    const result = handleAcademyRanking({ sim }, ctx);
    Logger.log('=== ' + sim + ' ===');
    if (!result.ok) {
      Logger.log('Errore: ' + result.error);
      return;
    }
    Logger.log('Piloti in classifica: ' + result.data.count);
    result.data.ranking.forEach((r, i) => {
      const ppNote = r.pp !== 0 ? ` [PM ${r.pm} + PP ${r.pp}]` : '';
      const badgeNote = r.badge ? ` 🏅${r.badge}` : '';
      Logger.log(`  ${i + 1}. ${r.display_name} — VR ${r.vr}${ppNote} (${r.races} gare)${badgeNote}`);
    });

    Logger.log('--- Passo puro (min ' + result.data.paceRankingMinRaces + ' gare) ---');
    result.data.paceRanking.forEach((r, i) => {
      Logger.log(`  ${i + 1}. ${r.display_name} — gap medio ${r.avg_gap_pct}% — miglior giro ${r.best_lap_ms}ms su ${r.best_lap_track_id} (${r.races} gare)`);
    });
  });
}
