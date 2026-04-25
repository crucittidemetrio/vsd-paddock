// ===========================================
// VSD PADDOCK — Mock API client
// Imita esattamente il contratto di Apps Script.
// Quando passiamo al backend reale (Tappa 4),
// si sostituisce solo questo file.
// ===========================================

import { DRIVERS, TRACKS, CARS, BEST_LAPS, RACES, RACE_REPORTS } from './mockData';

// Simula latenza di rete realistica per Apps Script (300-700ms)
function fakeLatency(min = 300, max = 700) {
  const ms = Math.floor(Math.random() * (max - min) + min);
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Wrapper standard di risposta — stesso shape che useremo da Apps Script
function ok(data) {
  return { ok: true, data };
}
function fail(error) {
  return { ok: false, error };
}

// ---------- ROUTING ACTIONS ----------
const handlers = {
  // ========== AUTH ==========
  'auth.login': async ({ code }) => {
    const trimmed = (code || '').trim().toUpperCase();
    if (!trimmed) return fail('Codice mancante');

    // Cerca pilota per access_code (in realtà non lo abbiamo nei mock,
    // quindi qui usiamo il driver_id come codice. Quando colleghiamo
    // davvero Sheets useremo la colonna access_code.)
    const isStaffCode = trimmed.startsWith('STAFF') || trimmed.startsWith('ADMIN');
    let driver;
    if (isStaffCode) {
      driver = DRIVERS.find(d => d.role === 'admin' || d.role === 'staff');
    } else {
      // Per la demo: qualsiasi codice non-staff → primo driver con ruolo "driver"
      driver = DRIVERS.find(d => d.role === 'driver' && d.status === 'active');
    }
    if (!driver) return fail('Codice non riconosciuto');

    const token = `mock.${driver.driver_id}.${Date.now()}`;
    return ok({ token, driver });
  },

  'auth.verify': async ({ token }) => {
    if (!token || !token.startsWith('mock.')) return fail('Token invalido');
    const parts = token.split('.');
    const driver = DRIVERS.find(d => d.driver_id === parts[1]);
    if (!driver) return fail('Pilota non trovato');
    return ok({ valid: true, driver });
  },

  // ========== ROSTER ==========
  'roster.list': async ({ filters = {} }, ctx) => {
    let list = [...DRIVERS];
    if (filters.status) list = list.filter(d => d.status === filters.status);
    if (filters.role) list = list.filter(d => d.role === filters.role);
    if (filters.sim) list = list.filter(d => d.preferred_sims?.includes(filters.sim));

    // Privacy: piloti non-staff non vedono email/real_name degli altri
    if (!ctx?.isStaff) {
      list = list.map(d => ({
        ...d,
        email: d.driver_id === ctx?.driver_id ? d.email : '',
        real_name: d.driver_id === ctx?.driver_id ? d.real_name : '',
      }));
    }
    return ok(list);
  },

  'roster.get': async ({ driver_id }, ctx) => {
    const d = DRIVERS.find(x => x.driver_id === driver_id);
    if (!d) return fail('Pilota non trovato');
    // Idem: oscura privati se non self/staff
    if (!ctx?.isStaff && ctx?.driver_id !== driver_id) {
      return ok({ ...d, email: '', real_name: '' });
    }
    return ok(d);
  },

  // ========== LOOKUPS ==========
  'lookups.tracks': async ({ sim } = {}) => {
    let list = [...TRACKS];
    if (sim) list = list.filter(t => t.sim === sim);
    return ok(list);
  },
  'lookups.cars': async ({ sim } = {}) => {
    let list = [...CARS];
    if (sim) list = list.filter(c => c.sim === sim);
    return ok(list);
  },

  // ========== BEST LAPS ==========
  'laps.list': async ({ filters = {}, limit } = {}) => {
    let list = [...BEST_LAPS];
    if (filters.sim) list = list.filter(l => l.sim === filters.sim);
    if (filters.track_id) list = list.filter(l => l.track_id === filters.track_id);
    if (filters.car_id) list = list.filter(l => l.car_id === filters.car_id);
    if (filters.driver_id) list = list.filter(l => l.driver_id === filters.driver_id);
    if (filters.verified_only) list = list.filter(l => !!l.verified_by);
    list.sort((a, b) => a.lap_time_ms - b.lap_time_ms);
    if (limit) list = list.slice(0, limit);
    return ok(list);
  },

  'laps.leaderboard': async ({ sim, track_id, car_id }) => {
    let list = BEST_LAPS.filter(l =>
      l.sim === sim &&
      l.track_id === track_id &&
      (!car_id || l.car_id === car_id)
    );
    // Best per pilota
    const byDriver = {};
    list.forEach(l => {
      if (!byDriver[l.driver_id] || byDriver[l.driver_id].lap_time_ms > l.lap_time_ms) {
        byDriver[l.driver_id] = l;
      }
    });
    const sorted = Object.values(byDriver).sort((a, b) => a.lap_time_ms - b.lap_time_ms);
    return ok(sorted);
  },

  // ========== RACES ==========
  'races.list': async ({ status } = {}) => {
    let list = [...RACES];
    if (status) list = list.filter(r => r.status === status);
    list.sort((a, b) => new Date(a.date) - new Date(b.date));
    return ok(list);
  },

  'races.upcoming': async () => {
    const now = new Date();
    const list = RACES
      .filter(r => r.status === 'scheduled' && new Date(r.date) > now)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 3);
    return ok(list);
  },

  'races.get': async ({ race_id }) => {
    const r = RACES.find(x => x.race_id === race_id);
    if (!r) return fail('Gara non trovata');
    return ok(r);
  },

  // ========== REPORTS ==========
  'reports.list': async ({ race_id, driver_id } = {}) => {
    let list = [...RACE_REPORTS];
    if (race_id) list = list.filter(r => r.race_id === race_id);
    if (driver_id) list = list.filter(r => r.driver_id === driver_id);
    list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return ok(list);
  },

  'reports.recent': async ({ limit = 5 } = {}) => {
    const list = [...RACE_REPORTS]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, limit);
    return ok(list);
  },
};

/**
 * Entry point unico — stesso contratto che useremo per Apps Script.
 * Usage: const res = await callApi('roster.list', { filters: { status: 'active' } });
 *
 * @param action  Nome azione, es. 'roster.list'
 * @param payload Oggetto parametri
 * @param ctx     Contesto auth (driver_id, isStaff) — iniettato dal client
 */
export async function callApi(action, payload = {}, ctx = null) {
  await fakeLatency();
  const handler = handlers[action];
  if (!handler) {
    return fail(`Action sconosciuta: ${action}`);
  }
  try {
    return await handler(payload, ctx);
  } catch (e) {
    console.error('[mockApi]', action, e);
    return fail(e.message || 'Errore interno');
  }
}