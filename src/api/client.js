// ===========================================
// VSD PADDOCK — API client
// Facciata pubblica usata dai componenti.
// ===========================================

import { callApi as callRealApi } from './realApi';
import { callApi as callSupabaseApi } from './supabaseApi';
import { STORAGE, TIERS } from '../utils/constants';

// ═══════════════════════════════════════════════════════════
// Cutover incrementale su Supabase (#264/#329)
// ═══════════════════════════════════════════════════════════
// Solo le azioni elencate qui passano dal nuovo transport layer
// (supabaseApi.js, #328); tutto il resto continua a passare da
// realApi.js/Apps Script, invariato.
//
// FIX #360 (20/09/2026): roster.updateSelf era stato ESCLUSO qui
// deliberatamente fin da #329, perché l'Edge Function richiedeva
// sempre una sessione Supabase reale che la maggior parte dei piloti
// non ha ancora. Ma questo significava che il salvataggio "Modifica
// profilo" andava SEMPRE al vecchio backend Apps Script (mai a
// Supabase), mentre roster.get/roster.list (che mostrano il profilo)
// leggono da Supabase fin da #329 — ogni modifica di bio/instagram/
// facebook/roster_track fatta da un pilota reale spariva nel nulla
// agli occhi del sito, silenziosamente, dal giorno del cutover
// Roster. Segnalato da Demetrio ("ho cambiato da Roster Competitivo
// a Roster Amatoriale ma non lo cambia"). Risolto applicando a
// roster-update-self lo stesso resolveLegacyDriver già usato in
// #358/#359 (fallback token legacy quando non c'è sessione Supabase
// reale) — ora incluso qui sotto, con lo stesso fallback lato
// supabaseApi.js (LEGACY_TOKEN_FALLBACK_ACTIONS).
//
// #330 — teamSessions.*/sessionRsvp.*: gap noto e ACCETTATO
// (deciso con l'utente, non un bug silenzioso). A differenza di
// Roster, le Edge Function team-sessions-*/session-rsvp-* richiedono
// TUTTE una sessione Supabase reale, senza alcun fallback team_slug —
// letto in tutti e 6 i sorgenti deployati, coerente col comportamento
// reale voluto ("visibile a chiunque sia loggato nel team", mai
// pubblico). Chi è ancora loggato solo con la vecchia sessione Apps
// Script (praticamente tutti i piloti reali oggi, tranne l'account
// admin già validato in #327) riceverà un 401 silenzioso dalla query
// react-query — niente crash, ma /calendar smette di mostrare le
// sessioni team finché il pilota non rifà il login Discord via
// Supabase. Considerato un gap a basso impatto visivo e accettato
// per procedere nel piano staged; da richiudere naturalmente quando
// il resto del sito (e quindi il login) passerà tutto su Supabase.
const SUPABASE_MIGRATED_ACTIONS = new Set([
  'roster.list',
  'roster.get',
  // FIX #360 (20/09/2026): vedi commento in testa al file — fallback
  // legacy token aggiunto a roster-update-self, stesso schema di
  // roster.list/roster.get sopra.
  'roster.updateSelf',
  'showcase.summary',
  'showcase.mediaKit',
  'teamSessions.list',
  'teamSessions.create',
  'teamSessions.update',
  'teamSessions.remove',
  'sessionRsvp.list',
  'sessionRsvp.set',
  // Roster Admin (NUOVA, 19/09/2026): scrittura status/role/removed_at
  // + hard-delete ex piloti senza contributi — vedi
  // cloud/functions/social-manager/index.ts per i dettagli. Richiede
  // sessione Supabase reale (staff/admin) — nessun fallback anonimo,
  // stesso principio di teamSessions.*/sessionRsvp.* sopra.
  'roster.adminUpdate',
  'roster.deletionCandidates',
  'roster.adminDelete',
  'roster.availableSlots',
  'roster.adminCreate',

  // #331 — Best Laps/Academy/Records/Training/Submissions/Garage61.
  // GAP NOTO e ACCETTATO, stesso principio di #330 (teamSessions/
  // sessionRsvp sopra): tutte le Edge Function di questo gruppo
  // richiedono SEMPRE una sessione Supabase reale (Authorization
  // Bearer con JWT utente valido via supabase.auth.getUser()),
  // verificato leggendo i 7 sorgenti deployati (best-laps-list/
  // leaderboard/add/update, records-team, training-insights,
  // academy-ranking) — nessun fallback team_slug/anon come per
  // Roster. Un pilota ancora loggato solo con la vecchia sessione
  // Apps Script riceverà 401 silenzioso da react-query finché non
  // rifà il login Discord via Supabase: Best Laps/Academy/Records/
  // Training smetteranno di mostrare dati per lui, niente crash.
  // Fix driver_id→driver_code (uuid interno → codice pilota
  // leggibile, contratto atteso da tutto il frontend) già applicato
  // e redeployato lato Edge Function prima di questo cutover — vedi
  // FIX #331 nei commenti di ciascun index.ts in cloud/functions/ e
  // nel dispatcher endurance-auditions-get (lapSubmissions.*).
  'laps.list',
  'laps.leaderboard',
  'laps.raceLaps',
  'laps.syncFromGarage61',
  'laps.add',
  'laps.update',
  'laps.remove',
  'lapSubmissions.submit',
  'lapSubmissions.listMine',
  'lapSubmissions.listPending',
  'lapSubmissions.approve',
  'lapSubmissions.reject',
  'lapSubmissions.remove',
  'academy.ranking',
  'records.team',
  'training.insights',

  // #332 — Races/RaceResults/Championships/Standings/SkillIndex/SeasonRecap.
  // Stesso GAP NOTO e ACCETTATO di #330/#331: tutte le Edge Function di
  // questo gruppo richiedono sessione Supabase reale (nessun fallback
  // anonimo/team_slug), verificato leggendo ogni sorgente deployato.
  //
  // #351 — Incidents: dominio riprogettato con un form nativo in-app al
  // posto del vecchio Google Form esterno (decisione esplicita di
  // Demetrio, non un porting fedele). incident_reports/incident_resolutions
  // riallineate: reporter_driver_id ora nullable (segnalazioni community,
  // non solo roster VSD), aggiunte reporter_sim/reporter_discord/against.
  // incidents.report è pubblica (community-wide, come lo era il Form —
  // UE144 è una lega multi-team) via anon+team_slug in supabaseApi.js.
  // incidents.list/resolve richiedono sessione reale (stesso gap
  // accettato di #330-333). Fix driver_id→driver_code applicato in
  // incidents-list (v3) su reporter_driver_id/against_driver_id/
  // resolved_by/penalized_driver_id e in incidents-resolve (v2) che
  // risolve driver_code→uuid prima di scrivere penalized_driver_id —
  // stesso bug-pattern trovato in #333, qui prevenuto fin dal disegno.
  //
  // Dati storici: races/race_results/championships sono stati
  // migrati da Apps Script a Supabase in questo stesso giro (#349) —
  // 49 gare, 1479 risultati, 9 campionati. incidents/skill_index_history
  // restano vuote: 0 incidenti mai formalizzati anche lato legacy,
  // skill_index_history è uno snapshot on-demand senza equivalente
  // storico da migrare (il sorgente calcola sempre live da race_results).
  //
  // Fix driver_id→driver_code applicato e redeployato prima di questo
  // cutover su race-results-list, standings-by-championship,
  // standings-by-driver, standings-progression, skill-index-list,
  // skill-index-history (season-recap non necessita fix: opera solo
  // su me.id, mai su un driver_id esterno). Gap chiuso in races-list/
  // races-upcoming: championship_name ora popolato via lookup su
  // championships (era sempre null, dominio non ancora portato quando
  // scritte in Fase 1).
  'races.list',
  'races.upcoming',
  'races.get',
  'races.updatePoster',
  'races.updateGallery',
  'races.add',
  'races.update',
  'races.remove',
  'raceResults.list',
  'raceResults.import',
  'championships.list',
  'championships.importStandings',
  'championships.saveAdjustments',
  'standings.byChampionship',
  'standings.byDriver',
  'standings.progression',
  'skillIndex.list',
  'skillIndex.history',
  'recap.mine',
  'incidents.list',
  'incidents.report',
  'incidents.resolve',

  // #333 — Clash of Classes. clash.participants.list/register/
  // clash.standings/clash.incidents.report sono pubbliche (community
  // non tesserata, cap. 2.2 regolamento) — anon+team_slug via
  // supabaseApi.js (ANON_TEAM_SLUG_ACTIONS), stesso pattern di
  // roster.list/showcase.*. Le altre 5 azioni (add/update/remove
  // partecipanti, submitRound, incidents.list) sono staff/admin,
  // richiedono sessione Supabase reale — stesso gap accettato di
  // #330-332.
  //
  // FIX driver_id→driver_code applicato prima del cutover (stesso
  // principio #329-332) a clash-participants-list/register/add/
  // update e clash-standings. Bug più profondo trovato e corretto in
  // clash-participants-add e clash-results-submit-round: il payload
  // `driver_id` è sempre driver_code nel contratto pubblico (fedele
  // al sorgente legacy e al placeholder "driver_id VSD (opz.)" nel
  // form staff), ma le colonne `clash_participants.driver_id`/
  // `clash_results.driver_id` sono tipizzate `uuid` in Postgres
  // (upgrade deliberato da testo libero a FK vera, #278) — senza
  // risoluzione, digitare un driver_code falliva l'insert con un
  // errore Postgres di tipo (non un mismatch silenzioso come negli
  // altri domini). Ora risolto driver_code→uuid scoped al team prima
  // di ogni insert, con errore chiaro se il codice non esiste.
  'clash.participants.list',
  'clash.participants.register',
  'clash.participants.add',
  'clash.participants.update',
  'clash.participants.remove',
  'clash.standings',
  'clash.results.submitRound',
  'clash.incidents.report',
  'clash.incidents.list',

  // #334 — Interest/Prequal/Candidates/Sponsors/Treasury/Consent.
  // Edge Functions già scritte e deployate in #283-286 (mai collegate
  // al frontend fino ad ora). Routing table già completa in
  // supabaseApi.js (#326). Verificato codice sorgente di tutte le 22
  // Edge Function prima del cutover:
  // - interest.list, interest.register, prequal.list,
  //   consent.socialFlags → pubbliche per design (stesso pattern
  //   anon+team_slug di roster.*/clash.*), aggiunte anche a
  //   ANON_TEAM_SLUG_ACTIONS in supabaseApi.js.
  // - interest.update → richiede login ma NON staff (aggiorna solo la
  //   riga del proprio driver_id) — nessun fallback team_slug.
  // - Tutte le altre (interest.remove, prequal.add/remove,
  //   candidates.*, sponsors.*, treasury.*, consent.status/accept/
  //   adminList) richiedono sessione Supabase reale (staff/admin o
  //   driver loggato) — stesso GAP NOTO e ACCETTATO di #330-333: chi è
  //   ancora loggato solo con la vecchia sessione Apps Script riceverà
  //   401 finché non rifà il login Discord via Supabase.
  //
  // Migrazione dati storici (pre-cutover, stesso principio #333/#349):
  // trovati e migrati 18 movimenti Treasury reali (saldo 174,15€
  // verificato identico al legacy), 12 consensi privacy reali (nessun
  // minorenne), 9 registrazioni ChampionshipInterest reali (2 su
  // aci-lmgt3-challenge-2026, 7 su era-season-3) e 4 PrequalCandidates
  // reali — Candidates e Sponsors erano già vuoti su entrambi i lati,
  // nessuna migrazione necessaria lì.
  //
  // Bug driver_id→driver_code trovato e corretto PRIMA di questo
  // cutover (mai esposto a utenti reali) in consent-social-flags v2
  // (il più grave: rompeva silenziosamente resolvePhotoUrl in quasi
  // ogni pagina del sito), consent-admin-list v2, interest-list v2 e
  // interest-register v2 — vedi commenti nei rispettivi index.ts.
  'interest.list',
  'interest.register',
  'interest.update',
  'interest.remove',
  'prequal.list',
  'prequal.add',
  'prequal.remove',
  'candidates.list',
  'candidates.add',
  'candidates.update',
  'candidates.remove',
  'sponsors.list',
  'sponsors.add',
  'sponsors.update',
  'sponsors.remove',
  'treasury.list',
  'treasury.add',
  'treasury.update',
  'treasury.remove',
  'consent.status',
  'consent.accept',
  'consent.adminList',
  'consent.socialFlags',

  // #335 — Messenger/AuditLog/Push. Edge Functions già scritte e
  // deployate in #290 (messenger-send, audit-log-list, push-subscribe,
  // push-unsubscribe), mai collegate al frontend fino ad ora. Routing
  // table già completa in supabaseApi.js (#326). Verificato codice
  // sorgente dei 4 Edge Function prima del cutover: tutte richiedono
  // sessione Supabase reale (nessun fallback anonimo/team_slug) —
  // stesso GAP NOTO e ACCETTATO di #330-334: chi è ancora loggato solo
  // con la vecchia sessione Apps Script riceverà 401 finché non rifà
  // il login Discord via Supabase.
  //
  // Bug driver_id→driver_code trovato e corretto PRIMA di questo
  // cutover (mai esposto a utenti reali) in messenger-send v2: il ramo
  // DM risolveva i destinatari con `.in('id', payload.driver_ids)`, ma
  // AdminMessenger.jsx invia driver_code ("VSD005", da roster.list()),
  // mai l'uuid interno — stesso pattern trovato in #331/#333/#334.
  // Corretto anche audit-log-list v2 (driver_id nella risposta era
  // l'uuid grezzo invece di driver_code — usato oggi solo come
  // fallback di visualizzazione in AdminAuditLog.jsx, quindi non
  // bloccante, ma corretto per coerenza col resto del progetto).
  'messenger.send',
  'auditLog.list',
  'push.subscribe',
  'push.unsubscribe',

  // #336 — Fuel/Energy/Devices/LapData. Edge Functions già scritte e
  // deployate in #295/#299 (mai collegate al frontend fino ad ora).
  // Routing table già completa in supabaseApi.js (#326). Verificato
  // codice sorgente delle 9 Edge Function prima del cutover: le 5
  // fuel-*/devices-create-token hanno un doppio percorso di auth
  // (sessione Supabase reale O device token HMAC stateless dal
  // companion app — verify_jwt=false a livello deployment, la vera
  // auth è nel codice), le 3 lapData.* richiedono sempre una sessione
  // Supabase reale (nessun fallback) — stesso GAP NOTO E ACCETTATO di
  // #330-335 per queste ultime.
  //
  // TRE bug driver_id→driver_code trovati e corretti PRIMA di questo
  // cutover (mai esposti a utenti reali), stesso pattern di
  // #331/#333/#334/#335: (1) lap-data-session v2 restituiva l'uuid
  // interno come driver_id — PaceAnalysis.jsx lo usa come ETICHETTA
  // PRIMARIA della legenda del grafico passo (`lap.driver_id ||
  // lap.driver_name_external`), quindi ogni pilota VSD riconosciuto
  // avrebbe mostrato un uuid grezzo al posto del nome, sempre (non un
  // caso limite) — risolto con driver_code + driver_name risolti in
  // batch, PaceAnalysis.jsx aggiornato per preferire driver_name; (2)
  // lap-data-import v2: payload.driver_id_override arriva come
  // driver_code dal select di AdminImportLapData.jsx, ma veniva
  // confrontato con la colonna uuid `drivers.id` — avrebbe fallito
  // silenziosamente o causato un errore Postgres invalid-uuid
  // all'insert; risolto risolvendo driver_code→uuid prima dell'uso;
  // (3) fuel-stints v2: stint.driver_id era l'uuid grezzo, usato come
  // fallback display in FuelPanel.jsx quando driver_name manca —
  // corretto per coerenza (bug non bloccante, come in audit-log-list).
  // fuel-log-sample/fuel-log-live/fuel-summary/fuel-my-session/
  // lap-data-sessions non espongono mai driver_id come stringa
  // identificabile in risposta — nessun fix necessario lì.
  'devices.createToken',
  'fuel.logSample',
  'fuel.logLive',
  'fuel.summary',
  'fuel.mySession',
  'fuel.stints',
  'lapData.import',
  'lapData.sessions',
  'lapData.session',

  // #337 — Endurance (Auditions + Participants + Stints). Edge Functions
  // consolidate deployate in #303 (dispatcher endurance-read/endurance-write,
  // dovuto al tetto di 100 Edge Function del piano free — vedi commenti in
  // cloud/functions/endurance-read|write/index.ts). Routing già completo in
  // supabaseApi.js (#326): endurance.auditions.list/get + participants.list +
  // stints.list → ENDURANCE_READ_SLUG, le altre 11 azioni → ENDURANCE_WRITE_SLUG.
  // Auth: auditions.list/get + participants.list pubblici (team_slug o
  // sessione), isStaff reale per masking/draft; stints.list richiede sempre
  // sessione reale (nessun fallback team_slug, fedele al sorgente); tutte le
  // 11 azioni di scrittura richiedono sessione reale + ruolo admin/staff.
  //
  // QUATTRO bug driver_id→driver_code trovati e corretti PRIMA di questo
  // cutover (mai esposti a utenti reali), stesso pattern di
  // #329/#331/#333/#334/#335/#336 — qui però driver_id è una vera colonna
  // uuid con FK su drivers (non un campo libero), quindi il bug non è
  // "silenzioso": scrivere un driver_code come "VSD005" in una colonna uuid
  // fa fallire la query Postgres con "invalid input syntax for type uuid".
  // Senza questi fix, participants.add/stints.add/stints.confirmPlan
  // sarebbero stati rotti al 100% al primo utilizzo reale. Risolto in
  // entrambi i dispatcher: (1) handleParticipantsList/handleStintsList (read)
  // restituivano driver_id come uuid grezzo — AdminEnduranceForm.jsx,
  // EnduranceDetail.jsx, AdminRaceStints.jsx, StintPlanner.jsx, RaceDetail.jsx/
  // StintTimeline.jsx e SwapPilotModal.jsx costruiscono tutti una roster map
  // chiave driver_code e fanno `driverById[x.driver_id]` — con l'uuid il
  // lookup falliva sempre, mostrando un uuid al posto del nome pilota (e un
  // link /roster/:driverId rotto); risolto con risoluzione batch uuid→driver_code
  // in uscita; (2) handleParticipantsAdd/handleStintsAdd/handleStintsUpdate/
  // handleStintsConfirmPlan (write) ricevevano driver_id come driver_code dal
  // frontend ma lo scrivevano/interrogavano direttamente contro la colonna
  // uuid — risolto risolvendo driver_code→uuid PRIMA di ogni query/scrittura,
  // e ri-convertendo a driver_code nella risposta; (3) handleStintsValidateCoverage
  // leggeva driver_id uuid dal DB e lo passava a validateFairShare(), che lo
  // embedda nel testo del messaggio di sbilanciamento mostrato in
  // StintPlanner.jsx — risolto risolvendo uuid→driver_code prima della
  // validazione. handleStintsGenerate è una funzione pura (nessun accesso DB)
  // che riecheggia semplicemente i driver_ids in ingresso — nessun fix
  // necessario, contratto già coerente (driver_code in, driver_code out).
  'endurance.auditions.list',
  'endurance.auditions.get',
  'endurance.auditions.create',
  'endurance.auditions.update',
  'endurance.participants.list',
  'endurance.participants.add',
  'endurance.participants.update',
  'endurance.participants.remove',
  'endurance.stints.list',
  'endurance.stints.add',
  'endurance.stints.update',
  'endurance.stints.remove',
  'endurance.stints.generate',
  'endurance.stints.validateCoverage',
  'endurance.stints.confirmPlan',

  // #338 — Cutover Social Manager/Race Reports/Reazioni/landing.data/
  // Showcase (resto). Dispatcher consolidato endurance-auditions-get
  // (stesso slug riusato di #259/#331, vedi header di
  // cloud/functions/social-manager/index.ts). Social Manager (SOLO
  // admin) richiede sempre sessione Supabase reale — stesso GAP NOTO
  // e ACCETTATO di #330-337. reports.list/recent, reportReactions.*,
  // landing.data richiedono qualsiasi pilota autenticato (fallback
  // legacy token già presente lato Edge Function da #331, quindi
  // NESSUN gap qui: funzionano anche per chi è loggato solo con la
  // vecchia sessione Apps Script). showcase.summary/showcase.mediaKit
  // erano già in questo Set da una fase precedente (pubblici, nessuna
  // auth).
  //
  // SEI bug driver_id→driver_code trovati e corretti PRIMA di questo
  // cutover (stesso pattern di #329/#331/#333/#334/#335/#336/#337),
  // due dei quali in azioni GIÀ LIVE (computeRaceLaps che alimenta
  // laps.raceLaps, e showcase.summary/showcase.mediaKit): vedi FIX
  // #338 nei commenti di cloud/functions/social-manager/index.ts per
  // il dettaglio di ciascuno (reports.list/recent, il filtro
  // payload.driver_id in reports.list, reportReactions.list,
  // landing.data incluso l'alias driver_id mancante sull'array
  // drivers, computeRaceLaps condiviso con laps.raceLaps, e
  // topDrivers/latestBestLap in showcase.summary/mediaKit — questi
  // ultimi rompevano silenziosamente "Piloti in evidenza" sul Media
  // Kit pubblico, mai notato prima).
  'social.posts.list',
  'social.posts.create',
  'social.posts.update',
  'social.posts.remove',
  'social.metrics.list',
  'social.metrics.add',
  'social.generateText',
  'social.discord.stats',
  'social.media.list',
  'social.media.add',
  'social.media.remove',
  'social.plan.dismiss',
  'social.plan.undismiss',
  'social.plan.dismissed.list',
  'reports.list',
  'reports.recent',
  'reportReactions.list',
  'reportReactions.toggle',
  'landing.data',

  // #339 — Cutover Pit Wall (parte storico/sessioni registrate).
  // pitwall.sessions/pitwall.session leggono pitwall_sessions (già
  // popolata dal bridge C# via pitwall.logSession, Edge Function
  // standalone separata, non ancora in questo Set — v. nota in
  // supabaseApi.js: resta bridge-only, mai chiamata dal frontend
  // pilota). Bug driver_id→driver_code trovato e corretto PRIMA di
  // questo cutover in pitwall-session-get v2 (mai esposto finora:
  // PitWall.jsx usa driver_id solo come React key, mai visualizzato).
  // La parte "live" (classifica in tempo reale) resta sul WebSocket
  // locale invariato — vedi nuova pagina /pitwall-live per il canale
  // Supabase Realtime (pitwall.broadcastLive, già deployato da #263).
  'pitwall.sessions',
  'pitwall.session',
]);

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
  if (SUPABASE_MIGRATED_ACTIONS.has(action)) {
    const res = await callSupabaseApi(action, payload);
    if (!res.ok) {
      throw new Error(res.error || `API error: ${action}`);
    }
    return res.data;
  }
  const ctx = getAuthContext();
  const res = await callRealApi(action, payload, ctx);
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
    // Roster Admin (NUOVA, 19/09/2026) — staff/admin: status/removed_at/
    // race_number (role solo admin). Vedi client.js header + Edge
    // Function per dettagli permessi.
    adminUpdate: (payload) => call('roster.adminUpdate', payload),
    // SOLO admin: lista ex piloti VSD senza alcun dato reale collegato
    // (candidati sicuri per hard-delete).
    deletionCandidates: () => call('roster.deletionCandidates', {}),
    // SOLO admin: cancellazione definitiva — irreversibile. Il backend
    // ri-verifica sempre i contributi lato server prima di eseguire.
    adminDelete: (driver_id) => call('roster.adminDelete', { driver_id }),
    // Aggiungi pilota (NUOVA, 19/09/2026) — staff/admin: driver_code e
    // race_number liberi (per pre-compilare il form) + creazione vera
    // e propria. Vedi roster.availableSlots/adminCreate nel backend.
    availableSlots: () => call('roster.availableSlots', {}),
    adminCreate: (payload) => call('roster.adminCreate', payload),
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

  // Obiettivo 3 — Analisi di Passo da SimHub (upload manuale CSV)
  lapData: {
    import: (csv_text, driver_id_override) =>
      call('lapData.import', { csv_text, driver_id_override }),
    sessions: () => call('lapData.sessions'),
    session: (session_id) => call('lapData.session', { session_id }),
  },

  // pitwall.logSession NON è qui: lo chiama solo il bridge C# via HTTP
  // diretto (stesso contratto {action, token, payload} della companion
  // Python), mai il frontend.
  pitwall: {
    sessions: () => call('pitwall.sessions'),
    session: (session_id) => call('pitwall.session', { session_id }),
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

  // Candidati in prequalifica — campionati esterni (ACI, ERA, ...).
  // Elenco a sheet gestibile dallo staff, vedi PrequalCandidates.js.
  prequal: {
    list: (championship_key) => call('prequal.list', { championship_key }),
    add: (payload) => call('prequal.add', payload),
    remove: (candidate_id) => call('prequal.remove', { candidate_id }),
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
    planDismiss: (race_id, pillar) => call('social.plan.dismiss', { race_id, pillar }),
    planUndismiss: (race_id, pillar) => call('social.plan.undismiss', { race_id, pillar }),
    planDismissedList: () => call('social.plan.dismissed.list', {}),
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
  // Cassa / rendiconto team — solo admin (vedi apps-script/Treasury.js)
  treasury: {
    list: (params = {}) => call('treasury.list', params),
    add: (payload) => call('treasury.add', payload),
    update: (payload) => call('treasury.update', payload),
    remove: (entry_id) => call('treasury.remove', { entry_id }),
  },

  incidents: {
    list: (params = {}) => call('incidents.list', params),
    report: (payload) => call('incidents.report', payload),
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

