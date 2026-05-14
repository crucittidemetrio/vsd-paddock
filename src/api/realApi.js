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
  const includeInactive = filters.status && filters.status !== 'active';

  const res = await postToBackend(
    'roster.list',
    { includeInactive: !!includeInactive },
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
 * Frontend: auth.login({ code })
 * Backend:  auth.login({ code }) → { token, driver }
 * Identico, nessun adapter necessario.
 */
async function authLogin(payload) {
  return postToBackend('auth.login', payload, null);
}

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

// ─────────────────────────────────────────────

/**
 * @param action  es. 'roster.list'
 * @param payload oggetto parametri
 * @param ctx     oggetto contesto. ctx.token (se valorizzato) viene
 *                propagato al backend per autenticazione. Il ctx
 *                completo è dedotto server-side dal token stesso.
 */
export async function callApi(action, payload = {}, ctx = null) {
  // Il token vive nel localStorage, gestito da AuthContext.
  const token = readTokenFromStorage();

  try {
    switch (action) {
      case 'auth.login':
        return await authLogin(payload);
      case 'auth.verify':
        return await authVerify(payload);
      case 'roster.list':
        return await rosterListAdapter(payload, token);
      case 'roster.get':
        return await rosterGetAdapter(payload, token);
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
      case 'races.list':
        return await racesListAdapter(payload, token);
      case 'races.upcoming':
        return await racesUpcomingAdapter(payload, token);
      case 'races.get':
        return await racesGetAdapter(payload, token);
      case 'raceResults.list':
        return await raceResultsListAdapter(payload, token);
     case 'raceResults.import':                              // ← NEW
        return await raceResultsImportAdapter(payload, token); // ← NEW
      case 'championships.list':                              // ← NEW
        return await championshipsListAdapter(payload, token); // ← NEW
       // Aggiungi questo case nello switch, dopo 'championships.list':
case 'championships.importStandings':
  return championshipsImportStandingsAdapter(payload); 
      case 'standings.byChampionship':                                       // ← NEW Wave 9.9
        return await standingsByChampionshipAdapter(payload, token);         // ← NEW Wave 9.9
      case 'reports.list':
        return await reportsListAdapter(payload, token);
      case 'reports.recent':
        return await reportsRecentAdapter(payload, token);
      case 'showcase.summary':
        return await showcaseSummaryAdapter(payload);
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
/**
 * Frontend: raceResults.import({ race_id, json_data }) → stats object
 * Backend:  raceResults.import → { imported, vsd_matched, external, dns, dnf, session_type }
 */
async function raceResultsImportAdapter(payload, token) {
  const res = await postToBackend('raceResults.import', payload || {}, token);
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

function championshipsImportStandingsAdapter(payload) {
  return {
    championship_id: payload.championship_id,
    json_data: payload.json_data,
  };
}