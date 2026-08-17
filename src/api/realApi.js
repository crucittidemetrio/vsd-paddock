// ===========================================
// VSD PADDOCK — Real API client
// Parla con il backend Apps Script (VSD_HUB_DB).
// Tutti gli endpoint del frontend sono implementati sul backend.
// Gli adapter qui sotto traducono lo shape della risposta backend
// ({ entity: [...], count }) in array piatti per il client.
// ===========================================

const API_URL = import.meta.env.VITE_API_URL;

// Wrapper standard di risposta — stesso shape del mock.
function ok(data) { return { ok: true, data }; }
function fail(error) { return { ok: false, error }; }

/**
 * POST verso Apps Script.
 * Apps Script accetta application/x-www-form-urlencoded con campi:
 *   action, token (opzionale), payload (JSON string)
 *
 * NB: usiamo `text/plain` per evitare il preflight CORS che Apps Script
 * non supporta. URLSearchParams produce text/plain compatibile.
 */
async function postToBackend(action, payload, token) {
  if (!API_URL) {
    return fail('VITE_API_URL non configurato in .env.local');
  }

  // Invio come text/plain per evitare preflight CORS.
  // Apps Script leggerà il body grezzo da e.postData.contents
  // e lo parsemo JSON lato server.
  const requestBody = JSON.stringify({
    action,
    token: token || null,
    payload: payload || {},
  });

  let response;
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      body: requestBody,
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      redirect: 'follow',
    });
  } catch (e) {
    console.error('[realApi] network error', action, e);
    return fail('Errore di rete: ' + (e.message || 'connessione fallita'));
  }

  if (!response.ok) {
    return fail(`HTTP ${response.status}: ${response.statusText}`);
  }

  let json;
  try {
    json = await response.json();
  } catch (e) {
    console.error('[realApi] JSON parse error', action, e);
    return fail('Risposta non valida dal server');
  }

  return json;
}

// ─────────────────────────────────────────────
// Adapters — traducono il contratto frontend → backend
// dove le firme non coincidono.
// ─────────────────────────────────────────────

/**
 * Frontend: roster.list({ filters: { status, role, sim } })
 * Backend:  roster.list({ includeInactive })
 *
 * Strategia: chiediamo al backend solo gli active (default) o tutti
 * (se filters.status !== 'active'), poi filtriamo lato client per
 * role/sim/altri attributi.
 */
async function rosterListAdapter(payload, token) {
  const filters = (payload && payload.filters) || {};
  const includeRemoved = filters.includeRemoved === true;
  // carica sempre tutti (active + inactive); viste filtrano client-side.
  // includeRemoved aggiunge anche i piloti con removed_at (is_ex_vsd: true).

  const res = await postToBackend(
    'roster.list',
    { includeInactive: true, includeRemoved },
    token
  );

  if (!res.ok) return res;

  let drivers = res.data.drivers || [];

  // Filtri client-side che il backend non gestisce
  if (filters.status && filters.status !== 'active') {
    drivers = drivers.filter(d => d.status === filters.status);
  }
  if (filters.role) {
    drivers = drivers.filter(d => d.role === filters.role);
  }
  if (filters.sim) {
    drivers = drivers.filter(d =>
      String(d.preferred_sims || '').includes(filters.sim)
    );
  }

  // realApi rispetta lo stesso contratto.
  return ok(drivers);
}

/**
 * Frontend: roster.get({ driver_id })
 * Backend:  roster.get({ driver_id }) → { driver: {...} }
 *
 * Adattiamo: il mock restituiva il driver in `data` direttamente,
 * il backend lo annida in `data.driver`. Sblocchiamo qui.
 */
async function rosterGetAdapter(payload, token) {
  const res = await postToBackend('roster.get', payload, token);
  if (!res.ok) return res;
  return ok(res.data.driver);
}

/**
 * Frontend: presence.heartbeat() → { alive: true }
 * Backend:  presence.heartbeat({}) → stesso shape
 */
async function presenceHeartbeatAdapter(payload, token) {
  const res = await postToBackend('presence.heartbeat', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data);
}

/**
 * Frontend: presence.online() → { online: [driver_id, ...] }
 * Backend:  presence.online({}) → stesso shape
 */
async function presenceOnlineAdapter(payload, token) {
  const res = await postToBackend('presence.online', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data);
}

// Wave 10.X: authLogin() rimosso. auth.login è deprecato lato backend
// e non è più chiamato dal frontend (Discord OAuth è l'unico flusso).

/**
 * Frontend: auth.verify({ token })
 * Backend:  auth.verify (token come parametro top-level, non payload)
 *
 * Il backend valida il token nel dispatcher e poi handleAuthVerify
 * controlla solo che ctx esista. Quindi mandiamo il token come token,
 * non come payload.
 */
async function authVerify(payload) {
  const tokenToVerify = payload && payload.token;
  return postToBackend('auth.verify', {}, tokenToVerify);
}
async function authDiscordStart() {
  return postToBackend('auth.discordStart', {}, null);
}

async function authDiscordCallback(payload) {
  return postToBackend('auth.discordCallback', payload, null);
}
// ─────────────────────────────────────────────

/**
 * @param action  es. 'roster.list'
 * @param payload oggetto parametri
 *
 * Nota: un tempo la firma accettava anche un terzo argomento ctx (i
 * chiamanti in client.js lo passano ancora, es. callApi(action, payload,
 * ctx)) ma non è mai stato usato qui — il token viene sempre letto da
 * localStorage via readTokenFromStorage(), non da ctx.token. Rimosso
 * dalla firma per pulizia: passarlo comunque dai chiamanti non causa
 * errori (JS ignora argomenti extra), quindi zero rischio a lasciarlo
 * o toglierlo lato chiamante.
 */
export async function callApi(action, payload = {}) {
  // Il token vive nel localStorage, gestito da AuthContext.
  const token = readTokenFromStorage();

  try {
    switch (action) {
      case 'auth.verify':
        return await authVerify(payload);
        case 'auth.discordStart':
        return await authDiscordStart(payload);
      case 'auth.discordCallback':
        return await authDiscordCallback(payload);
      case 'roster.list':
        return await rosterListAdapter(payload, token);
      case 'roster.get':
        return await rosterGetAdapter(payload, token);
      case 'presence.heartbeat':
        return await presenceHeartbeatAdapter(payload, token);
      case 'presence.online':
        return await presenceOnlineAdapter(payload, token);
      case 'lookups.tracks':
        return await lookupsTracksAdapter(payload, token);
      case 'lookups.cars':
        return await lookupsCarsAdapter(payload, token);
      case 'laps.list':
        return await lapsListAdapter(payload, token);
      case 'laps.leaderboard':
        return await lapsLeaderboardAdapter(payload, token);
      case 'laps.raceLaps':
  return await lapsRaceLapsAdapter(payload, token);  
  case 'laps.syncFromGarage61':
        return await lapsSyncFromGarage61Adapter(payload, token);
      case 'laps.add':
        return await lapsAddAdapter(payload, token);
      case 'laps.update':
        return await lapsUpdateAdapter(payload, token);
      case 'laps.remove':
        return await lapsRemoveAdapter(payload, token);
      case 'lapSubmissions.submit':
        return await lapSubmissionsSubmitAdapter(payload, token);
      case 'lapSubmissions.listMine':
        return await lapSubmissionsListMineAdapter(payload, token);
      case 'lapSubmissions.listPending':
        return await lapSubmissionsListPendingAdapter(payload, token);
      case 'lapSubmissions.approve':
        return await lapSubmissionsApproveAdapter(payload, token);
      case 'lapSubmissions.reject':
        return await lapSubmissionsRejectAdapter(payload, token);
      case 'races.list':
        return await racesListAdapter(payload, token);
      case 'races.upcoming':
        return await racesUpcomingAdapter(payload, token);
      case 'races.get':
        return await racesGetAdapter(payload, token);
        case 'races.add':
        return await racesAddAdapter(payload, token);
      case 'races.update':
        return await racesUpdateAdapter(payload, token);
      case 'races.remove':
        return await racesRemoveAdapter(payload, token);
      case 'raceResults.list':
        return await raceResultsListAdapter(payload, token);
     case 'raceResults.import':                              // ← NEW
        return await raceResultsImportAdapter(payload, token); // ← NEW
      case 'academy.ranking':
        return await academyRankingAdapter(payload, token);
      case 'recap.mine':
        return await recapMineAdapter(payload, token);
      case 'records.team':
        return await recordsTeamAdapter(payload, token);
      case 'training.insights':
        return await trainingInsightsAdapter(payload, token);
      case 'clash.participants.list':
        return await clashParticipantsListAdapter(payload, token);
      case 'clash.participants.register':
        return await clashRegisterAdapter(payload, token);
      case 'clash.participants.add':
        return await clashAddParticipantAdapter(payload, token);
      case 'clash.participants.update':
        return await clashUpdateParticipantAdapter(payload, token);
      case 'clash.participants.remove':
        return await clashRemoveParticipantAdapter(payload, token);
      case 'clash.standings':
        return await clashStandingsAdapter(payload, token);
      case 'clash.results.submitRound':
        return await clashSubmitRoundResultsAdapter(payload, token);
      case 'clash.incidents.report':
        return await clashReportIncidentAdapter(payload, token);
      case 'clash.incidents.list':
        return await clashIncidentsListAdapter(payload, token);
      case 'social.posts.list':
        return await socialPostsListAdapter(payload, token);
      case 'social.posts.create':
        return await socialPostsCreateAdapter(payload, token);
      case 'social.posts.update':
        return await socialPostsUpdateAdapter(payload, token);
      case 'social.posts.remove':
        return await socialPostsRemoveAdapter(payload, token);
      case 'social.metrics.list':
        return await socialMetricsListAdapter(payload, token);
      case 'social.metrics.add':
        return await socialMetricsAddAdapter(payload, token);
      case 'social.generateText':
        return await socialGenerateTextAdapter(payload, token);
      case 'social.discord.stats':
        return await socialDiscordStatsAdapter(payload, token);
      case 'social.media.list':
        return await socialMediaListAdapter(payload, token);
      case 'social.media.add':
        return await socialMediaAddAdapter(payload, token);
      case 'social.media.remove':
        return await socialMediaRemoveAdapter(payload, token);
      case 'championships.list':                              // ← NEW
        return await championshipsListAdapter(payload, token); // ← NEW
      case 'championships.importStandings':
        return await championshipsImportStandingsAdapter(payload, token);
      case 'championships.saveAdjustments':
        return await championshipsSaveAdjustmentsAdapter(payload, token);
      case 'auditLog.list':
        return await auditLogListAdapter(payload, token);
      case 'candidates.list':
        return await candidatesListAdapter(payload, token);
      case 'candidates.add':
        return await candidatesAddAdapter(payload, token);
      case 'candidates.update':
        return await candidatesUpdateAdapter(payload, token);
      case 'candidates.remove':
        return await candidatesRemoveAdapter(payload, token);
      case 'push.subscribe':
        return await pushSubscribeAdapter(payload, token);
      case 'push.unsubscribe':
        return await pushUnsubscribeAdapter(payload, token);
      case 'standings.byChampionship':                                       // ← NEW Wave 9.9
        return await standingsByChampionshipAdapter(payload, token);         // ← NEW Wave 9.9
      case 'standings.byDriver':
        return await standingsByDriverAdapter(payload, token);
      case 'standings.progression':
        return await standingsProgressionAdapter(payload, token);
      case 'reports.list':
        return await reportsListAdapter(payload, token);
      case 'reports.recent':
        return await reportsRecentAdapter(payload, token);
      case 'showcase.summary':
        return await showcaseSummaryAdapter(payload);
      case 'showcase.mediaKit':
        return await showcaseMediaKitAdapter(payload);
      case 'races.updatePoster':
        return await racesUpdatePosterAdapter(payload, token);
      case 'races.updateGallery':
        return await racesUpdateGalleryAdapter(payload, token);
      case 'endurance.auditions.list':
        return await enduranceAuditionsListAdapter(payload, token);
      case 'endurance.auditions.get':
        return await enduranceAuditionsGetAdapter(payload, token);
      case 'endurance.auditions.create':
        return await enduranceAuditionsCreateAdapter(payload, token);
      case 'endurance.auditions.update':
        return await enduranceAuditionsUpdateAdapter(payload, token);
      case 'endurance.participants.list':
        return await enduranceParticipantsListAdapter(payload, token);
      case 'endurance.participants.add':
        return await enduranceParticipantsAddAdapter(payload, token);
      case 'endurance.participants.update':
        return await enduranceParticipantsUpdateAdapter(payload, token);
      case 'endurance.participants.remove':
        return await enduranceParticipantsRemoveAdapter(payload, token);
      case 'endurance.stints.list':
        return await enduranceStintsListAdapter(payload, token);
      case 'endurance.stints.add':
        return await enduranceStintsAddAdapter(payload, token);
      case 'endurance.stints.update':
        return await enduranceStintsUpdateAdapter(payload, token);
      case 'endurance.stints.remove':
        return await enduranceStintsRemoveAdapter(payload, token);
      case 'endurance.stints.generate':
        return await enduranceStintsGenerateAdapter(payload, token);
      case 'endurance.stints.validateCoverage':
        return await enduranceStintsValidateCoverageAdapter(payload, token);
      case 'endurance.stints.confirmPlan':
        return await enduranceStintsConfirmPlanAdapter(payload, token);
      case 'raceCrews.list':
        return await raceCrewsListAdapter(payload, token);
      case 'raceCrews.add':
        return await raceCrewsAddAdapter(payload, token);
      case 'raceCrews.remove':
        return await raceCrewsRemoveAdapter(payload, token);
      case 'devices.createToken':
        return await devicesCreateTokenAdapter(payload, token);
      case 'fuel.logSample':
        return await fuelLogSampleAdapter(payload, token);
      case 'fuel.summary':
        return await fuelSummaryAdapter(payload, token);
      case 'landing.data':
        return await landingDataAdapter(payload, token);
      case 'consent.status':
        return await postToBackend('consent.status', payload, token);
      case 'consent.accept':
        return await postToBackend('consent.accept', payload, token);
      case 'consent.adminList':
        return await postToBackend('consent.adminList', payload, token);
      case 'consent.socialFlags':
        return await postToBackend('consent.socialFlags', payload, token);
      default:
        return fail(`Action non instradata: ${action}`);
    }
  } catch (e) {
    console.error('[realApi]', action, e);
    return fail(e.message || 'Errore interno realApi');
  }
}

/**
 * Frontend: lookups.tracks({ sim? })
 * Backend:  lookups.tracks({ sim? }) → { tracks: [...], count }
 *
 * Adapter: il mock restituiva l'array direttamente in `data`,
 * il backend lo annida in `data.tracks`. Sblocchiamo qui.
 */
async function lookupsTracksAdapter(payload, token) {
  const res = await postToBackend('lookups.tracks', payload, token);
  if (!res.ok) return res;
  return ok(res.data.tracks);
}

/**
 * Frontend: lookups.cars({ sim? })
 * Backend:  lookups.cars({ sim? }) → { cars: [...], count }
 */
async function lookupsCarsAdapter(payload, token) {
  const res = await postToBackend('lookups.cars', payload, token);
  if (!res.ok) return res;
  return ok(res.data.cars);
}

/**
 * Frontend: laps.list({ filters?, limit? }) → array di lap
 * Backend:  laps.list({}) → { laps: [...], count }
 *
 * Strategia: backend ritorna sempre tutti i lap. Filtri e limit
 * sono applicati lato client.
 */
async function lapsListAdapter(payload, token) {
  const res = await postToBackend('laps.list', {}, token);
  if (!res.ok) return res;

  let laps = res.data.laps || [];
  const filters = (payload && payload.filters) || {};
  const limit = payload && payload.limit;

  // Filtri client-side
  if (filters.sim) laps = laps.filter(l => l.sim === filters.sim);
  if (filters.track_id) laps = laps.filter(l => l.track_id === filters.track_id);
  if (filters.car_id) laps = laps.filter(l => l.car_id === filters.car_id);
  if (filters.driver_id) laps = laps.filter(l => l.driver_id === filters.driver_id);
  if (filters.verified_only) laps = laps.filter(l => !!l.verified_by);

  // Limit (i lap sono già ordinati dal backend per lap_time_ms ASC)
  if (limit) laps = laps.slice(0, limit);

  return ok(laps);
}

/**
 * Frontend: laps.leaderboard(sim, track_id, car_id?) → array di best per pilota
 * Backend:  laps.leaderboard({ sim, track_id, car_id? }) → { laps: [...], count }
 */
async function lapsLeaderboardAdapter(payload, token) {
  const res = await postToBackend('laps.leaderboard', payload, token);
  if (!res.ok) return res;
  return ok(res.data.laps);
}

/**
 * Frontend: laps.raceLaps() → array of race-derived laps
 * Backend:  laps.raceLaps → { laps: [...], count }
 */
async function lapsRaceLapsAdapter(payload, token) {
  const res = await postToBackend('laps.raceLaps', {}, token);
  if (!res.ok) return res;
  return ok(res.data.laps);
}

/**
 * Frontend: laps.syncFromGarage61() → stats object
 * Backend:  laps.syncFromGarage61() → { imported, skippedDedup, skippedCarUnmapped,
 *                                       tracksProcessed, unmappedCars[], unmappedDrivers[], errors }
 * Admin-only mutation. Ritorna le stats direttamente al hook.
 */
async function lapsSyncFromGarage61Adapter(payload, token) {
  const res = await postToBackend('laps.syncFromGarage61', {}, token);
  if (!res.ok) return res;
  return ok(res.data);
}

/**
 * Frontend: laps.add(payload) → { lap_id, lap }
 * Backend:  laps.add → { lap_id, lap }
 */
async function lapsAddAdapter(payload, token) {
  const res = await postToBackend('laps.add', payload, token);
  if (!res.ok) return res;
  return ok(res.data);
}

/**
 * Frontend: laps.update(payload) → { lap_id, updated }
 * Backend:  laps.update → { lap_id, updated }
 */
async function lapsUpdateAdapter(payload, token) {
  const res = await postToBackend('laps.update', payload, token);
  if (!res.ok) return res;
  return ok(res.data);
}

/**
 * Frontend: laps.remove({ lap_id }) → { lap_id, deleted }
 * Backend:  laps.remove → { lap_id, deleted }
 */
async function lapsRemoveAdapter(payload, token) {
  const res = await postToBackend('laps.remove', payload, token);
  if (!res.ok) return res;
  return ok(res.data);
}

/**
 * Frontend: races.list({ status? }) → array of races
 * Backend:  races.list({ status? }) → { races: [...], count }
 */
async function racesListAdapter(payload, token) {
  const res = await postToBackend('races.list', payload, token);
  if (!res.ok) return res;
  return ok(res.data.races);
}

/**
 * Frontend: races.upcoming() → array di max 3 races
 * Backend:  races.upcoming → { races: [...], count }
 */
async function racesUpcomingAdapter(payload, token) {
  const res = await postToBackend('races.upcoming', {}, token);
  if (!res.ok) return res;
  return ok(res.data.races);
}

/**
 * Frontend: races.get({ race_id }) → singola race
 * Backend:  races.get({ race_id }) → { race: {...} }
 */
async function racesGetAdapter(payload, token) {
  const res = await postToBackend('races.get', payload, token);
  if (!res.ok) return res;
  return ok(res.data.race);
}
/**
 * Frontend: races.add(payload) → { race_id, race }
 * Backend:  races.add → { race_id, race }
 */
async function racesAddAdapter(payload, token) {
  const res = await postToBackend('races.add', payload, token);
  if (!res.ok) return res;
  return ok(res.data);
}

/**
 * Frontend: races.update(payload) → { race_id, updated }
 * Backend:  races.update → { race_id, updated }
 */
async function racesUpdateAdapter(payload, token) {
  const res = await postToBackend('races.update', payload, token);
  if (!res.ok) return res;
  return ok(res.data);
}

/**
 * Frontend: races.remove({ race_id }) → { race_id, deleted }
 * Backend:  races.remove → { race_id, deleted }
 */
async function racesRemoveAdapter(payload, token) {
  const res = await postToBackend('races.remove', payload, token);
  if (!res.ok) return res;
  return ok(res.data);
}
/**
 * Frontend: raceResults.list({ race_id?, session_type? }) → { results, count }
 * Backend:  raceResults.list({ race_id?, session_type? })
 *
 * Tollera due shape di risposta dal backend:
 *  1. wrapped:   { ok: true, data: { results, count } }
 *  2. unwrapped: { results, count }
 */
async function raceResultsListAdapter(payload, token) {
  const res = await postToBackend('raceResults.list', payload || {}, token);
  if (!res) return fail('Nessuna risposta dal backend');
  if (res.ok === false) return res;
  const data = (res.ok === true && res.data) ? res.data : res;
  return ok(data);
}

/**
 * Frontend: reports.list({ race_id?, driver_id? }) → array of reports
 * Backend:  reports.list({ race_id?, driver_id? }) → { reports: [...], count }
 */
async function reportsListAdapter(payload, token) {
  const res = await postToBackend('reports.list', payload, token);
  if (!res.ok) return res;
  return ok(res.data.reports);
}
/**F
 * Frontend: raceResults.import({ race_id, json_data }) → stats object
 * Backend:  raceResults.import → { imported, vsd_matched, external, dns, dnf, session_type }
 */
async function raceResultsImportAdapter(payload, token) {
  const res = await postToBackend('raceResults.import', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data);
}

// ═══════════════════════════════════════════════════════════
// ENDURANCE — Phase 1A adapters
// ═══════════════════════════════════════════════════════════

/**
 * Frontend: endurance.auditions.list({ status?, sim? }) → array
 * Backend:  endurance.auditions.list → { auditions: [...], count }
 */
async function enduranceAuditionsListAdapter(payload, token) {
  const res = await postToBackend('endurance.auditions.list', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data.auditions);
}

/**
 * Frontend: endurance.auditions.get(auditionId) → audition object
 * Backend:  endurance.auditions.get → { audition: {...} }
 */
async function enduranceAuditionsGetAdapter(payload, token) {
  const res = await postToBackend('endurance.auditions.get', payload, token);
  if (!res.ok) return res;
  return ok(res.data.audition);
}

async function enduranceAuditionsCreateAdapter(payload, token) {
  const res = await postToBackend('endurance.auditions.create', payload, token);
  if (!res.ok) return res;
  return ok(res.data.audition);
}

async function enduranceAuditionsUpdateAdapter(payload, token) {
  const res = await postToBackend('endurance.auditions.update', payload, token);
  if (!res.ok) return res;
  return ok(res.data.audition);
}

/**
 * Frontend: academy.ranking(sim) → { sim, ranking: [...], count }
 * Backend:  academy.ranking({ sim }) → { sim, ranking: [...], count }
 * (Fase 1 — vedi apps-script/Academy.js per lo scope esatto: solo PM,
 * niente PP/badge/scarto ancora.)
 */
async function academyRankingAdapter(payload, token) {
  const res = await postToBackend('academy.ranking', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data);
}

/**
 * Frontend: recap.mine() → { season_start, races, podiums, dnfs,
 *   bestFinish, bestLap, mostRacedTrack, bySim }
 * Backend:  recap.mine({}) → stesso shape
 */
async function recapMineAdapter(payload, token) {
  const res = await postToBackend('recap.mine', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data);
}

/**
 * Frontend: records.team(sim?) → { records: [...], count }
 * Backend:  records.team({ sim? }) → stesso shape
 */
async function recordsTeamAdapter(payload, token) {
  const res = await postToBackend('records.team', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data);
}

/**
 * Frontend: training.insights(sim?) → { sim, drivers, next_race, readiness }
 * Backend:  training.insights({ sim? }) → stesso shape
 */
async function trainingInsightsAdapter(payload, token) {
  const res = await postToBackend('training.insights', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data);
}

/**
 * Best Lap Submissions — invio autonomo piloti con foto di prova,
 * validazione solo admin. Adapter pass-through.
 */
async function lapSubmissionsSubmitAdapter(payload, token) {
  const res = await postToBackend('lapSubmissions.submit', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data);
}

async function lapSubmissionsListMineAdapter(payload, token) {
  const res = await postToBackend('lapSubmissions.listMine', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data);
}

async function lapSubmissionsListPendingAdapter(payload, token) {
  const res = await postToBackend('lapSubmissions.listPending', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data);
}

async function lapSubmissionsApproveAdapter(payload, token) {
  const res = await postToBackend('lapSubmissions.approve', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data);
}

async function lapSubmissionsRejectAdapter(payload, token) {
  const res = await postToBackend('lapSubmissions.reject', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data);
}

/**
 * Clash of Classes — GTE vs GT3. Adapter pass-through: il backend
 * risponde già nello shape che il frontend consuma direttamente.
 */
async function clashParticipantsListAdapter(payload, token) {
  const res = await postToBackend('clash.participants.list', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data);
}

async function clashRegisterAdapter(payload, token) {
  const res = await postToBackend('clash.participants.register', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data);
}

async function clashAddParticipantAdapter(payload, token) {
  const res = await postToBackend('clash.participants.add', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data);
}

async function clashUpdateParticipantAdapter(payload, token) {
  const res = await postToBackend('clash.participants.update', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data);
}

async function clashRemoveParticipantAdapter(payload, token) {
  const res = await postToBackend('clash.participants.remove', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data);
}

async function clashStandingsAdapter(payload, token) {
  const res = await postToBackend('clash.standings', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data);
}

async function clashSubmitRoundResultsAdapter(payload, token) {
  const res = await postToBackend('clash.results.submitRound', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data);
}

async function clashReportIncidentAdapter(payload, token) {
  const res = await postToBackend('clash.incidents.report', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data);
}

async function clashIncidentsListAdapter(payload, token) {
  const res = await postToBackend('clash.incidents.list', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data);
}

/**
 * Frontend: social.postsList(status?) → array di post
 * Backend:  social.posts.list({ status? }) → { posts: [...], count }
 */
async function socialPostsListAdapter(payload, token) {
  const res = await postToBackend('social.posts.list', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data.posts);
}

/**
 * Frontend: social.postsCreate({ content, platforms, scheduled_date?, link_destination? })
 * Backend:  social.posts.create({...}) → { post_id, post }
 */
async function socialPostsCreateAdapter(payload, token) {
  const res = await postToBackend('social.posts.create', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data);
}

/**
 * Frontend: social.postsUpdate({ post_id, ...campi })
 * Backend:  social.posts.update({...}) → { post_id, updated }
 */
async function socialPostsUpdateAdapter(payload, token) {
  const res = await postToBackend('social.posts.update', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data);
}

/**
 * Frontend: social.postsRemove(post_id)
 * Backend:  social.posts.remove({ post_id }) → { post_id, deleted }
 */
async function socialPostsRemoveAdapter(payload, token) {
  const res = await postToBackend('social.posts.remove', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data);
}

/**
 * Frontend: social.metricsList(platform?) → array di rilevazioni
 * Backend:  social.metrics.list({ platform? }) → { metrics: [...], count }
 */
async function socialMetricsListAdapter(payload, token) {
  const res = await postToBackend('social.metrics.list', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data.metrics);
}

/**
 * Frontend: social.metricsAdd({ platform, followers, recorded_date? })
 * Backend:  social.metrics.add({...}) → { metric_id, metric }
 */
async function socialMetricsAddAdapter(payload, token) {
  const res = await postToBackend('social.metrics.add', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data);
}

/**
 * Frontend: social.generateText(prompt) → { text }
 * Backend:  social.generateText({ prompt }) → { text }
 */
async function socialGenerateTextAdapter(payload, token) {
  const res = await postToBackend('social.generateText', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data);
}

/**
 * Frontend: social.discordStats() → { guild_name, member_count, online_count }
 * Backend:  social.discord.stats({}) → stessa forma
 */
async function socialDiscordStatsAdapter(payload, token) {
  const res = await postToBackend('social.discord.stats', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data);
}

/**
 * Frontend: social.mediaList(tag?) → array di file in libreria
 * Backend:  social.media.list({ tag? }) → { media: [...], count }
 */
async function socialMediaListAdapter(payload, token) {
  const res = await postToBackend('social.media.list', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data.media);
}

/**
 * Frontend: social.mediaAdd({ url, filename, media_type, tags? })
 * Backend:  social.media.add({...}) → { media_id, media }
 */
async function socialMediaAddAdapter(payload, token) {
  const res = await postToBackend('social.media.add', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data);
}

/**
 * Frontend: social.mediaRemove(media_id)
 * Backend:  social.media.remove({ media_id }) → { media_id, deleted }
 */
async function socialMediaRemoveAdapter(payload, token) {
  const res = await postToBackend('social.media.remove', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data);
}

/**
 * Frontend: championships.list({ sim?, status?, season? }) → array of championships
 * Backend:  championships.list({...}) → { championships: [...], count }
 */
async function championshipsListAdapter(payload, token) {
  const res = await postToBackend('championships.list', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data.championships);
}

/**
 * Frontend: standings.byChampionship({ championship_id }) → standings payload
 * Backend:  standings.byChampionship → { championship, classes, rounds, points_configured }
 */
async function standingsByChampionshipAdapter(payload, token) {
  const res = await postToBackend('standings.byChampionship', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data);
}

/**
 * Frontend: standings.byDriver({ driver_id }) → { driver_id, participations }
 * Backend:  standings.byDriver → { driver_id, participations }
 */
async function standingsByDriverAdapter(payload, token) {
  const res = await postToBackend('standings.byDriver', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data);
}

/**
 * Frontend: standings.progression({ championship_id, class_name? }) → { class_name, rounds, series }
 * Backend:  standings.progression → { championship, class_name, rounds, series }
 */
async function standingsProgressionAdapter(payload, token) {
  const res = await postToBackend('standings.progression', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data);
}

/**
 * Frontend: reports.recent({ limit? = 5 }) → array of recent reports
 * Backend:  reports.recent({ limit? }) → { reports: [...], count }
 */
async function reportsRecentAdapter(payload, token) {
  const res = await postToBackend('reports.recent', payload, token);
  if (!res.ok) return res;
  return ok(res.data.reports);
}

/**
 * Legge il token da localStorage senza dipendere da AuthContext
 * (questo file deve poter essere importato da client.js).
 */
function readTokenFromStorage() {
  try {
    // STORAGE.TOKEN = 'vsd_paddock_token' (vedi src/utils/constants.js)
    // Hardcoded qui per evitare un import circolare con client.js
    return localStorage.getItem('vsd_paddock_token');
  } catch {
    return null;
  }
}

/**
 * Frontend: showcase.summary() → { stats, topDrivers, upcomingRaces, latestBestLap }
 * Backend:  showcase.summary → stesso shape, già flat in res.data
 *
 * Endpoint PUBBLICO. Non passiamo token — è marketing, niente auth.
 */
async function showcaseSummaryAdapter(payload) {
  const res = await postToBackend('showcase.summary', payload || {}, null);
  if (!res.ok) return res;
  return ok(res.data);
}

/**
 * Frontend: showcase.mediaKit() → { stats, sims, social, topDrivers }
 * Pubblico, no auth — pagina Sponsor/Media Kit.
 */
async function showcaseMediaKitAdapter(payload) {
  const res = await postToBackend('showcase.mediaKit', payload || {}, null);
  if (!res.ok) return res;
  return ok(res.data);
}

/**
 * Frontend: championships.importStandings({ championship_id, json_data }) → import stats
 * Backend:  championships.importStandings → { championship_id, classes_count, drivers_count, vsd_matched, external }
 */
async function championshipsImportStandingsAdapter(payload, token) {
  const res = await postToBackend('championships.importStandings', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data);
}

/**
 * Frontend: championships.saveAdjustments({ championship_id, adjustments }) → { championship_id, saved }
 * Backend:  championships.saveAdjustments → { championship_id, saved }
 * (case mancante nel dispatcher fino ad ora — client.js/ChampionshipDetail.jsx
 * la chiamavano già, ma cadeva sempre nel default "Action non instradata":
 * il pulsante "Salva" degli aggiustamenti punti in ChampionshipDetail non
 * ha mai funzionato. Il backend, handleChampionshipsSaveAdjustments in
 * Standings.js, era già completo e corretto.)
 */
async function championshipsSaveAdjustmentsAdapter(payload, token) {
  const res = await postToBackend('championships.saveAdjustments', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data);
}

/**
 * Frontend: auditLog.list({ action?, driver_id?, q?, limit?, offset? })
 * → { rows: [...], total, limit, offset }
 */
async function auditLogListAdapter(payload, token) {
  const res = await postToBackend('auditLog.list', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data);
}

/**
 * Frontend: candidates.list({ status? }) → { candidates: [...], count }
 */
async function candidatesListAdapter(payload, token) {
  const res = await postToBackend('candidates.list', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data);
}

/**
 * Frontend: candidates.add({ display_name, discord_username?, contact?,
 * sim_preference?, source?, notes? }) → candidato creato
 */
async function candidatesAddAdapter(payload, token) {
  const res = await postToBackend('candidates.add', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data);
}

/**
 * Frontend: candidates.update({ candidate_id, ...campi }) → candidato aggiornato
 */
async function candidatesUpdateAdapter(payload, token) {
  const res = await postToBackend('candidates.update', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data);
}

/**
 * Frontend: candidates.remove({ candidate_id }) → { deleted, candidate_id }
 */
async function candidatesRemoveAdapter(payload, token) {
  const res = await postToBackend('candidates.remove', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data);
}

/**
 * Frontend: push.subscribe({ endpoint, keys:{p256dh,auth}, user_agent? }) → { subscribed }
 */
async function pushSubscribeAdapter(payload, token) {
  const res = await postToBackend('push.subscribe', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data);
}

/**
 * Frontend: push.unsubscribe({ endpoint }) → { unsubscribed }
 */
async function pushUnsubscribeAdapter(payload, token) {
  const res = await postToBackend('push.unsubscribe', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data);
}

/**
 * Frontend: races.updatePoster({ race_id, poster_url }) → { race_id, poster_url }
 */
async function racesUpdatePosterAdapter(payload, token) {
  const res = await postToBackend('races.updatePoster', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data);
}

/**
 * Frontend: races.updateGallery({ race_id, gallery_urls: [...] }) → { race_id, gallery_urls }
 */
async function racesUpdateGalleryAdapter(payload, token) {
  const res = await postToBackend('races.updateGallery', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data);
}


// ════ Endurance Participants adapters ════
async function enduranceParticipantsListAdapter(payload, token) {
  return await postToBackend('endurance.participants.list', payload || {}, token);
}
async function enduranceParticipantsAddAdapter(payload, token) {
  return await postToBackend('endurance.participants.add', payload || {}, token);
}
async function enduranceParticipantsUpdateAdapter(payload, token) {
  return await postToBackend('endurance.participants.update', payload || {}, token);
}
async function enduranceParticipantsRemoveAdapter(payload, token) {
  return await postToBackend('endurance.participants.remove', payload || {}, token);
}

// ════ Endurance Stints adapters ════
async function enduranceStintsListAdapter(payload, token) {
  return await postToBackend('endurance.stints.list', payload || {}, token);
}
async function enduranceStintsAddAdapter(payload, token) {
  return await postToBackend('endurance.stints.add', payload || {}, token);
}
async function enduranceStintsUpdateAdapter(payload, token) {
  return await postToBackend('endurance.stints.update', payload || {}, token);
}
async function enduranceStintsRemoveAdapter(payload, token) {
  return await postToBackend('endurance.stints.remove', payload || {}, token);
}
async function enduranceStintsGenerateAdapter(payload, token) {
  return await postToBackend('endurance.stints.generate', payload || {}, token);
}
async function enduranceStintsValidateCoverageAdapter(payload, token) {
  return await postToBackend('endurance.stints.validateCoverage', payload || {}, token);
}
async function enduranceStintsConfirmPlanAdapter(payload, token) {
  return await postToBackend('endurance.stints.confirmPlan', payload || {}, token);
}

// ════ Race Crews adapters ════
async function raceCrewsListAdapter(payload, token) {
  return await postToBackend('raceCrews.list', payload || {}, token);
}
async function raceCrewsAddAdapter(payload, token) {
  return await postToBackend('raceCrews.add', payload || {}, token);
}
async function raceCrewsRemoveAdapter(payload, token) {
  return await postToBackend('raceCrews.remove', payload || {}, token);
}

// ════ Device tokens (companion app fuel/energy) ════
async function devicesCreateTokenAdapter(payload, token) {
  return await postToBackend('devices.createToken', payload || {}, token);
}

// ════ Fuel/Energy adapters ════
async function fuelLogSampleAdapter(payload, token) {
  return await postToBackend('fuel.logSample', payload || {}, token);
}
async function fuelSummaryAdapter(payload, token) {
  return await postToBackend('fuel.summary', payload || {}, token);
}

/**
 * Frontend: landing.data({ driver_id }) → oggetto aggregato con tutti i dati della Landing
 * Backend:  landing.data → { all_races, upcoming_races, manual_laps, race_laps,
 *                            all_reports, my_reports, drivers, tracks,
 *                            my_race_results, team_race_results }
 */
async function landingDataAdapter(payload, token) {
  const res = await postToBackend('landing.data', payload || {}, token);
  if (!res.ok) return res;
  return ok(res.data);
}
