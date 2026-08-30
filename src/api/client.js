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
  // Wave 10.X: auth.login legacy rimosso. L'unico metodo di login è Discord OAuth.
  auth: {
    verify: (token) => call('auth.verify', { token }),
    discordStart: () => call('auth.discordStart', {}),                            // Wave 10
    discordCallback: (code, state) => call('auth.discordCallback', { code, state }),  // Wave 10
  },

  roster: {
    list: (filters = {}) => call('roster.list', { filters }),
    get: (driver_id) => call('roster.get', { driver_id }),
    updateSelf: (payload) => call('roster.updateSelf', payload),
  },

  presence: {
    heartbeat: () => call('presence.heartbeat', {}),
    online: () => call('presence.online', {}),
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
    add: (payload) => call('laps.add', payload),
    update: (payload) => call('laps.update', payload),
    remove: (lap_id) => call('laps.remove', { lap_id }),
  },

  lapSubmissions: {
    submit: (payload) => call('lapSubmissions.submit', payload),
    listMine: () => call('lapSubmissions.listMine', {}),
    listPending: () => call('lapSubmissions.listPending', {}),
    approve: (submission_id) => call('lapSubmissions.approve', { submission_id }),
    reject: (submission_id, review_note) =>
      call('lapSubmissions.reject', { submission_id, review_note }),
    remove: (submission_id) => call('lapSubmissions.remove', { submission_id }),
  },

  races: {
    list: (status) => call('races.list', { status }),
    upcoming: () => call('races.upcoming'),
    get: (race_id) => call('races.get', { race_id }),
     updatePoster: ({ race_id, poster_url }) =>
      call('races.updatePoster', { race_id, poster_url }),
     updateGallery: ({ race_id, gallery_urls }) =>
      call('races.updateGallery', { race_id, gallery_urls }),
     add: (payload) => call('races.add', payload),
    update: (payload) => call('races.update', payload),
    remove: (race_id) => call('races.remove', { race_id }),
  },

  raceResults: {
    list: (params = {}) => call('raceResults.list', params),
    import: ({ race_id, json_data }) =>
      call('raceResults.import', { race_id, json_data }),
  },

  academy: {
    ranking: (sim) => call('academy.ranking', { sim }),
  },

  recap: {
    mine: () => call('recap.mine', {}),
  },

  records: {
    team: (sim, includeExVsd) => call('records.team', { sim, include_ex_vsd: includeExVsd }),
  },

  training: {
    insights: (sim, track_id) => call('training.insights', { sim, track_id }),
  },

  clash: {
    participantsList: () => call('clash.participants.list', {}),
    register: (payload) => call('clash.participants.register', payload),
    addParticipant: (payload) => call('clash.participants.add', payload),
    updateParticipant: (payload) => call('clash.participants.update', payload),
    removeParticipant: (participant_id) => call('clash.participants.remove', { participant_id }),
    standings: () => call('clash.standings', {}),
    submitRoundResults: (payload) => call('clash.results.submitRound', payload),
    reportIncident: (payload) => call('clash.incidents.report', payload),
    incidentsList: () => call('clash.incidents.list', {}),
  },

  // Manifestazione di interesse — campionati esterni (ACI, ERA, ...).
  // NON è l'iscrizione ufficiale, vedi ChampionshipInterest.js.
  interest: {
    list: (championship_key) => call('interest.list', { championship_key }),
    register: (payload) => call('interest.register', payload),
    update: (payload) => call('interest.update', payload),
    remove: (interest_id) => call('interest.remove', { interest_id }),
  },

  // Compilatore messaggi Discord — staff (canale o DM)
  messenger: {
    send: (payload) => call('messenger.send', payload),
  },

  social: {
    postsList: (status) => call('social.posts.list', { status }),
    postsCreate: (payload) => call('social.posts.create', payload),
    postsUpdate: (payload) => call('social.posts.update', payload),
    postsRemove: (post_id) => call('social.posts.remove', { post_id }),
    metricsList: (platform) => call('social.metrics.list', { platform }),
    metricsAdd: (payload) => call('social.metrics.add', payload),
    generateText: (prompt, provider) => call('social.generateText', { prompt, provider }),
    discordStats: () => call('social.discord.stats', {}),
    mediaList: (tag) => call('social.media.list', { tag }),
    mediaAdd: (payload) => call('social.media.add', payload),
    mediaRemove: (media_id) => call('social.media.remove', { media_id }),
  },

 consent: {
    status: () => call('consent.status', {}),
    accept: (payload) => call('consent.accept', payload),
    adminList: () => call('consent.adminList', {}),
    socialFlags: () => call('consent.socialFlags', {}),
  },

  championships: {
    list: (filters = {}) => call('championships.list', filters),
    importStandings: ({ championship_id, json_data }) =>
      call('championships.importStandings', { championship_id, json_data }),
    saveAdjustments: ({ championship_id, adjustments }) =>
      call('championships.saveAdjustments', { championship_id, adjustments }),
  },

  auditLog: {
    list: (params = {}) => call('auditLog.list', params),
  },

  candidates: {
    list: (params = {}) => call('candidates.list', params),
    add: (payload) => call('candidates.add', payload),
    update: (payload) => call('candidates.update', payload),
    remove: (candidate_id) => call('candidates.remove', { candidate_id }),
  },

  push: {
    subscribe: (subscription) => call('push.subscribe', subscription),
    unsubscribe: (endpoint) => call('push.unsubscribe', { endpoint }),
  },

  rsvp: {
    list: (race_id) => call('rsvp.list', { race_id }),
    set: (payload) => call('rsvp.set', payload),
  },

  // Sessioni team (allenamenti, qualifiche, riunioni) — ADR-Team-Scheduler Fase 1
  teamSessions: {
    list: () => call('teamSessions.list', {}),
    create: (payload) => call('teamSessions.create', payload),
    update: (payload) => call('teamSessions.update', payload),
    remove: (session_id) => call('teamSessions.remove', { session_id }),
  },

  // RSVP piloti per sessione team — ADR-Team-Scheduler Fase 2
  sessionRsvp: {
    list: (session_id) => call('sessionRsvp.list', { session_id }),
    set: (payload) => call('sessionRsvp.set', payload),
  },

  sponsors: {
    list: (params = {}) => call('sponsors.list', params),
    add: (payload) => call('sponsors.add', payload),
    update: (payload) => call('sponsors.update', payload),
    remove: (sponsor_id) => call('sponsors.remove', { sponsor_id }),
  },

  incidents: {
    list: (params = {}) => call('incidents.list', params),
    resolve: (payload) => call('incidents.resolve', payload),
  },

  skillIndex: {
    list: (params = {}) => call('skillIndex.list', params),
    history: (driver_id) => call('skillIndex.history', { driver_id }),
  },

  standings: {
    byChampionship: (championship_id) =>
      call('standings.byChampionship', { championship_id }),
    byDriver: (driver_id) =>
      call('standings.byDriver', { driver_id }),
    progression: (championship_id, class_name) =>
      call('standings.progression', { championship_id, class_name }),
  },
  
  reports: {
    list: (filters = {}) => call('reports.list', filters),
    recent: (limit = 5) => call('reports.recent', { limit }),
  },

  reportReactions: {
    list: () => call('reportReactions.list', {}),
    toggle: (report_id, emoji) => call('reportReactions.toggle', { report_id, emoji }),
  },

  landing: {
    data: (payload = {}) => call('landing.data', payload),
  },

 showcase: {
    summary: () => call('showcase.summary'),
    mediaKit: () => call('showcase.mediaKit'),
  },

endurance: {
      auditions: {
        list: (payload = {}) => call('endurance.auditions.list', payload),
        get: (audition_id) => call('endurance.auditions.get', { audition_id }),
        create: (payload) => call('endurance.auditions.create', payload),
        update: (payload) => call('endurance.auditions.update', payload),
      },
      participants: {
        list: (audition_id) => call('endurance.participants.list', audition_id ? { audition_id } : {}),
        add: (payload) => call('endurance.participants.add', payload),
        update: (payload) => call('endurance.participants.update', payload),
        remove: (participation_id) => call('endurance.participants.remove', { participation_id }),
      },
      stints: {
        list: (race_id) => call('endurance.stints.list', { race_id }),
        add: (payload) => call('endurance.stints.add', payload),
        update: (payload) => call('endurance.stints.update', payload),
        remove: (stint_id) => call('endurance.stints.remove', { stint_id }),
        generate: (payload) => call('endurance.stints.generate', payload),
        validateCoverage: (payload) => call('endurance.stints.validateCoverage', payload),
        confirmPlan: (payload) => call('endurance.stints.confirmPlan', payload),
      },
    },

    raceCrews: {
      list: (race_id) => call('raceCrews.list', { race_id }),
      add: (payload) => call('raceCrews.add', payload),
      remove: (crew_id) => call('raceCrews.remove', { crew_id }),
    },

    devices: {
      createToken: () => call('devices.createToken', {}),
    },

    fuel: {
      logSample: (payload) => call('fuel.logSample', payload),
      summary: (race_id, car_number, opts = {}) =>
        call('fuel.summary', { race_id, car_number, ...opts }),
      mySession: () => call('fuel.mySession', {}),
      stints: (race_id, car_number) => call('fuel.stints', { race_id, car_number }),
    },
};

