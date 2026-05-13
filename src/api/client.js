// ===========================================
// VSD PADDOCK — API client
// Facciata pubblica usata dai componenti.
// ===========================================

import { callApi } from './realApi';
import { STORAGE, ROLES } from '../utils/constants';

/**
 * Recupera il contesto auth corrente da localStorage.
 * Iniettato automaticamente in ogni chiamata API.
 */
function getAuthContext() {
  try {
    const raw = localStorage.getItem(STORAGE.DRIVER);
    if (!raw) return null;
    const driver = JSON.parse(raw);
    return {
      driver_id: driver.driver_id,
      role: driver.role,
      isStaff: driver.role === ROLES.STAFF || driver.role === ROLES.ADMIN,
      isAdmin: driver.role === ROLES.ADMIN,
    };
  } catch {
    return null;
  }
}

/**
 * Wrapper interno: chiama API e auto-throw su errore.
 * I componenti useranno hooks React Query, che gestiscono error/loading.
 */
async function call(action, payload = {}) {
  const ctx = getAuthContext();
  const res = await callApi(action, payload, ctx);
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
  auth: {
    login: (code) => call('auth.login', { code }),
    verify: (token) => call('auth.verify', { token }),
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
  },

  races: {
    list: (status) => call('races.list', { status }),
    upcoming: () => call('races.upcoming'),
    get: (race_id) => call('races.get', { race_id }),
  },

  raceResults: {
    list: (params = {}) => call('raceResults.list', params),
    import: ({ race_id, json_data }) =>
      call('raceResults.import', { race_id, json_data }),
  },

  championships: {
    list: (filters = {}) => call('championships.list', filters),
  },
  
  reports: {
    list: (filters = {}) => call('reports.list', filters),
    recent: (limit = 5) => call('reports.recent', { limit }),
  },

  showcase: {
    summary: () => call('showcase.summary'),
  },
};