// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Training Insights
// ═══════════════════════════════════════════════════════════
//
// Dashboard di allenamento calcolata a runtime da BestLaps, stesso
// principio di Records.js / Academy.js: nessuna tabella dedicata, nessun
// SECONDO log da compilare oltre a quello che già esiste.
//
// Motivazione: il tab TrainingSessions (log manuale di sessioni) è rimasto
// vuoto — inutile chiedere ai piloti un secondo form quando il dato può
// essere derivato da BestLaps, che è già la fonte di verità in uso.
//
// ATTENZIONE — precisazione importante (corretta 1 ago 2026, la prima
// versione di questo commento affermava il contrario): l'integrazione
// Garage61 (garage61.js) sincronizza SOLO IRC — vedi i filtri
// `platform === 'iracing'` / `sim: 'IRC'` in tutto il file. I giri LMU in
// BestLaps NON arrivano da sync automatico: sono inseriti a mano da uno
// staff via laps.add (richiede ctx.isStaff, non self-service piloti).
// Quindi per IRC questa dashboard è davvero "a costo zero" (il dato
// arriva da solo); per LMU mostra dati che qualcuno ha comunque dovuto
// trascrivere — il vantaggio reale su LMU è "niente SECONDO log", non
// "niente log".
//
// Scope Fase 1 (deciso 1 ago 2026): solo sim=LMU di default, per le
// stakes competitive (campionato UE144, 6 round, via dal 13/9/2026), non
// per volume di dati o per costo-zero — su quei due criteri IRC vincerebbe.
// Il parametro `sim` resta generico apposta: quando si costruisce la
// sezione IRC la stessa action si riusa senza modifiche.
//
// Definizione "giro di allenamento": session_type 'practice' o
// 'time_trial'. La qualifica/gara NON conta come allenamento anche se
// il giro finisce comunque in BestLaps — altrimenti il segnale di
// "quanto ti stai allenando" si confonde con "quanto corri".
//
// Il gap dal record squadra è invece calcolato su TUTTI i giri del sim
// (stesso criterio di Records.js: "il giro più veloce mai fatto a
// quella pista da chiunque"), non solo quelli di allenamento — altrimenti
// un record fatto in qualifica non comparirebbe come riferimento.
//
// Deliberatamente FUORI da questa fase: nessun post automatico su
// Discord della leaderboard settimanale. L'infrastruttura webhook esiste
// già (vedi SocialManager.js) ma agganciarla qui è un secondo giro di
// lavoro, non un prerequisito per rendere utile la pagina.
// ═══════════════════════════════════════════════════════════

const TRAINING_SESSION_TYPES_ = ['practice', 'time_trial'];
const TRAINING_WINDOW_7D_MS_ = 7 * 24 * 60 * 60 * 1000;
const TRAINING_WINDOW_30D_MS_ = 30 * 24 * 60 * 60 * 1000;

function trainingParseDate_(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * training.insights — riepilogo allenamento per pilota + readiness
 * pre-gara, calcolato da BestLaps.
 *
 * @param {Object} payload - { sim?, track_id? } — sim default 'LMU'.
 *   track_id opzionale: forza la readiness su quel tracciato invece che
 *   sulla pista della prossima gara (che resta comunque il default se
 *   track_id è assente). Utile per guardare la preparazione su una gara
 *   futura non ancora la prossima in calendario, o su un tracciato
 *   qualsiasi indipendente dal calendario gare.
 * @param {Object} ctx - richiede ctx.driver_id (stesso gate di records.team)
 */
function handleTrainingInsights(payload, ctx) {
  if (!ctx || !ctx.driver_id) return fail('Auth richiesto');

  const sim = (payload && payload.sim) || 'LMU';

  const allLaps = getCachedSheetData_(SHEETS.BEST_LAPS, 600);
  const drivers = getCachedSheetData_(SHEETS.DRIVERS, 600);
  const races = getCachedSheetData_(SHEETS.RACES, 900);

  const driverMap = {};
  drivers.forEach(d => { driverMap[d.driver_id] = d; });

  function isCurrentTesserato_(driverId) {
    const d = driverMap[driverId];
    if (!d) return false;
    if (driverId === 'VSD001') return false;
    if (d.removed_at) return false;
    return d.status === 'active';
  }

  // Tutti i giri validi del sim, da tesserati attivi — base sia per il
  // record squadra (ogni session_type) sia per il filtro allenamento.
  const simLaps = allLaps.filter(l => {
    if (!l.driver_id || !l.sim || !l.track_id) return false;
    if (l.sim !== sim) return false;
    const ms = Number(l.lap_time_ms);
    if (!ms || ms <= 0) return false;
    return isCurrentTesserato_(l.driver_id);
  });

  // Record squadra per pista — qualsiasi session_type (stesso criterio
  // di Records.js), riferimento per il gap.
  const teamBestByTrack = {};
  simLaps.forEach(l => {
    const ms = Number(l.lap_time_ms);
    if (!teamBestByTrack[l.track_id] || ms < teamBestByTrack[l.track_id].ms) {
      teamBestByTrack[l.track_id] = {
        ms,
        display: l.lap_time_display || '',
        driver_id: l.driver_id,
      };
    }
  });

  // Solo giri di allenamento (practice + time_trial) per il segnale
  // di attività/preparazione.
  const trainingLaps = simLaps.filter(l => TRAINING_SESSION_TYPES_.indexOf(l.session_type) !== -1);

  const now = new Date();
  const cutoff7 = new Date(now.getTime() - TRAINING_WINDOW_7D_MS_);
  const cutoff30 = new Date(now.getTime() - TRAINING_WINDOW_30D_MS_);

  const byDriver = {};
  function ensureDriver_(driverId) {
    if (!byDriver[driverId]) {
      byDriver[driverId] = {
        driver_id: driverId,
        display_name: (driverMap[driverId] && driverMap[driverId].display_name) || driverId,
        laps_7d: 0,
        laps_30d: 0,
        last_session_date: null,
        bestByTrack: {},
        lapsByTrack: {},
      };
    }
    return byDriver[driverId];
  }

  trainingLaps.forEach(l => {
    const entry = ensureDriver_(l.driver_id);
    const d = trainingParseDate_(l.set_date);
    if (d) {
      if (d >= cutoff30) entry.laps_30d++;
      if (d >= cutoff7) entry.laps_7d++;
      if (!entry.last_session_date || d > entry.last_session_date) entry.last_session_date = d;
    }
    const ms = Number(l.lap_time_ms);
    const tid = l.track_id;
    if (!entry.bestByTrack[tid] || ms < entry.bestByTrack[tid].ms) {
      entry.bestByTrack[tid] = { ms, display: l.lap_time_display || '' };
    }
    entry.lapsByTrack[tid] = (entry.lapsByTrack[tid] || 0) + 1;
  });

  // Includi anche i tesserati attivi senza giri di allenamento: devono
  // comparire in leaderboard a zero, non sparire — il punto della
  // dashboard è anche rendere visibile chi NON si allena.
  drivers.forEach(d => {
    if (isCurrentTesserato_(d.driver_id)) ensureDriver_(d.driver_id);
  });

  const driverSummaries = Object.values(byDriver).map(entry => {
    const tracks = Object.keys(entry.bestByTrack).map(tid => {
      const pb = entry.bestByTrack[tid];
      const teamBest = teamBestByTrack[tid];
      return {
        track_id: tid,
        personal_best_ms: pb.ms,
        personal_best_display: pb.display,
        team_best_ms: teamBest ? teamBest.ms : null,
        team_best_driver_id: teamBest ? teamBest.driver_id : null,
        laps: entry.lapsByTrack[tid] || 0,
      };
    }).sort((a, b) => b.laps - a.laps);

    return {
      driver_id: entry.driver_id,
      display_name: entry.display_name,
      laps_7d: entry.laps_7d,
      laps_30d: entry.laps_30d,
      last_session_date: entry.last_session_date ? entry.last_session_date.toISOString() : null,
      tracks,
    };
  }).sort((a, b) => b.laps_7d - a.laps_7d || b.laps_30d - a.laps_30d || a.display_name.localeCompare(b.display_name));

  // Prossima gara nel sim richiesto + readiness sulla sua pista.
  const nowMs = now.getTime();
  const upcomingSimRaces = races
    .filter(r => r.sim === sim && r.status === 'scheduled' && trainingParseDate_(r.date) && trainingParseDate_(r.date).getTime() > nowMs)
    .sort((a, b) => trainingParseDate_(a.date).getTime() - trainingParseDate_(b.date).getTime());
  const nextRace = upcomingSimRaces.length > 0 ? upcomingSimRaces[0] : null;

  // Tracciato della readiness: se il chiamante ne passa uno esplicito
  // (dropdown manuale in UI) ha priorità; altrimenti default al
  // comportamento di sempre, la pista della prossima gara.
  const requestedTrackId = payload && payload.track_id;
  const readinessTrackId = requestedTrackId || (nextRace && nextRace.track_id) || null;

  let readiness = null;
  if (readinessTrackId) {
    readiness = driverSummaries
      .map(d => ({
        driver_id: d.driver_id,
        display_name: d.display_name,
        laps_on_track: (byDriver[d.driver_id].lapsByTrack[readinessTrackId]) || 0,
      }))
      .sort((a, b) => b.laps_on_track - a.laps_on_track);
  }

  return ok({
    sim,
    generated_at: now.toISOString(),
    drivers: driverSummaries,
    next_race: nextRace ? {
      race_id: nextRace.race_id,
      race_name: nextRace.race_name,
      track_id: nextRace.track_id,
      date: nextRace.date,
    } : null,
    readiness_track_id: readinessTrackId,
    readiness,
  });
}

// ═══════════════════════════════════════════════════════════
// TEST FUNCTION (utile per debug nell'editor)
// ═══════════════════════════════════════════════════════════

function testTrainingInsights() {
  const ctx = { driver_id: 'VSD005', role: 'admin', tier: 'admin', isStaff: true, isAdmin: true };
  const result = handleTrainingInsights({ sim: 'LMU' }, ctx);
  if (!result.ok) {
    Logger.log('Errore: ' + result.error);
    return;
  }
  Logger.log(`Piloti: ${result.data.drivers.length}`);
  result.data.drivers.slice(0, 5).forEach(d => {
    Logger.log(`${d.display_name}: ${d.laps_7d} giri (7g), ${d.laps_30d} giri (30g), ultima sessione ${d.last_session_date || 'mai'}`);
  });
  if (result.data.next_race) {
    Logger.log(`Prossima gara: ${result.data.next_race.race_name} su ${result.data.next_race.track_id} il ${result.data.next_race.date}`);
    Logger.log('Readiness: ' + JSON.stringify(result.data.readiness));
  } else {
    Logger.log('Nessuna gara programmata per questo sim.');
  }
}
