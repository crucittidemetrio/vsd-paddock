// ===========================================
// VSD PADDOCK — API client
// Facciata pubblica usata dai componenti.
// ===========================================

import { callApi } from './realApi';
import { STORAGE, TIERS } from '../utils/constants';

/**
 * Recupera il contesto auth corrente da localStorage.
 * Iniettato automaticamente in ogni chiamata API.
 *
 * Wave 10: ora legge anche tier dal localStorage. isStaff/isAdmin derivano
 * dal tier (non più da driver.role) perché Discord OAuth salva un driver
 * minimale {driver_id} senza role.
 */
function getAuthContext() {
  try {
    const savedTier = localStorage.getItem(STORAGE.TIER);
    const savedDriver = localStorage.getItem(STORAGE.DRIVER);
    const driver = savedDriver ? JSON.parse(savedDriver) : null;
    // Wave 10.3 — anonymous è un tier valido: sempre ritorna un ctx,
    // così il backend può servire dati pubblici a visitatori non loggati.
    const tier = savedTier || TIERS.ANONYMOUS;
    return {
      driver_id: driver?.driver_id || null,
      role: driver?.role || null,
      tier,
      isStaff: tier === TIERS.STAFF || tier === TIERS.ADMIN,
      isAdmin: tier === TIERS.ADMIN,
    };
  } catch {
    return {
      driver_id: null,
      role: null,
      tier: TIERS.ANONYMOUS,
      isStaff: false,
      isAdmin: false,
    };
  }
}

/**
 * Wrapper interno: chiama API e auto-throw su errore.
 * I componenti useranno hooks React Query, che gestiscono error/loading.
 */
async function call(action, payload = {}) {
  console.log('[API CALL]', action, payload);
  const ctx = getAuthContext();
  console.log('[API CTX]', ctx);
  const res = await callApi(action, payload, ctx);
  console.log('[API RES]', action, res);
  if (!res.ok) {
    throw new Error(res.error || `API error: ${action}`);
  }
  return res.data;
}

/**
 * API pubblica organizzata per dominio.
 * Esempio uso: const drivers = await api.roster.list({ status: 'active' });
 */
export const api = {
  // Wave 10.X: auth.login legacy rimosso. L'unico metodo di login è Discord OAuth.
  auth: {
    verify: (token) => call('auth.verify', { token }),
    discordStart: () => call('auth.discordStart', {}),                            // Wave 10
    discordCallback: (code, state) => call('auth.discordCallback', { code, state }),  // Wave 10
  },

  roster: {
    list: (filters = {}) => call('roster.list', { filters }),
    get: (driver_id) => call('roster.get', { driver_id }),
  },

  lookups: {
    tracks: (sim) => call('lookups.tracks', { sim }),
    cars: (sim) => call('lookups.cars', { sim }),
  },

  laps: {
    list: (filters = {}, limit) => call('laps.list', { filters, limit }),
    leaderboard: (sim, track_id, car_id) =>
      call('laps.leaderboard', { sim, track_id, car_id }),
    raceLaps: () => call('laps.raceLaps'),
   syncFromGarage61: () => call('laps.syncFromGarage61'), 
  },

  races: {
    list: (status) => call('races.list', { status }),
    upcoming: () => call('races.upcoming'),
    get: (race_id) => call('races.get', { race_id }),
     updatePoster: ({ race_id, poster_url }) =>
      call('races.updatePoster', { race_id, poster_url }),
  },

  raceResults: {
    list: (params = {}) => call('raceResults.list', params),
    import: ({ race_id, json_data }) =>
      call('raceResults.import', { race_id, json_data }),
  },

 championships: {
    list: (filters = {}) => call('championships.list', filters),
    importStandings: ({ championship_id, json_data }) =>
      call('championships.importStandings', { championship_id, json_data }),
  },

  standings: {                                                              // ← NEW BLOCK
    byChampionship: (championship_id) =>
      call('standings.byChampionship', { championship_id }),
  },
  
  reports: {
    list: (filters = {}) => call('reports.list', filters),
    recent: (limit = 5) => call('reports.recent', { limit }),
  },

 showcase: {
    summary: () => call('showcase.summary'),
  },

  endurance: {
    auditions: {
      list: (payload = {}) => call('endurance.auditions.list', payload),
      get: (audition_id) => call('endurance.auditions.get', { audition_id }),
      create: (payload) => call('endurance.auditions.create', payload),
      update: (payload) => call('endurance.auditions.update', payload),
    },
  },
};
