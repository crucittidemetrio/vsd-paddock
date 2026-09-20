import { getSupabaseSession } from './supabaseAuth';
import { supabaseAnonKey } from './supabaseClient';

// ═══════════════════════════════════════════════════════════
// VSD-Paddock — Transport layer Supabase (#264/#328)
// ═══════════════════════════════════════════════════════════
// Drop-in replacement di src/api/realApi.js: espone lo stesso
// `callApi(action, payload)` usato da src/api/client.js, così che il
// cutover — quando arriverà, un dominio alla volta (#329-340) — sia
// solo un cambio dell'import in client.js, non una riscrittura.
//
// NON ancora collegato a client.js: costruito "spento" come da
// approccio staged concordato con l'utente per #264.
//
// ─── Come è stato costruito (importante) ───
// La prima versione di questo file si basava sulla tabella di
// routing #326, costruita guardando gli SLUG delle Edge Function e
// indovinando i nomi azione lato frontend per simmetria. Si è rivelato
// un errore: confrontando riga per riga client.js (chi chiama) e
// realApi.js (l'adapter Apps Script attuale, 1512 righe, letto per
// intero) sono emerse discrepanze reali, es.:
//   - il frontend chiama `laps.list/leaderboard/raceLaps/add/...`,
//     MAI `bestLaps.*` (nome che avevo inventato dal nome dello slug
//     Edge Function `best-laps-*`)
//   - `pitwall.sessions`/`pitwall.session`, non `pitwall.sessions.list`/
//     `pitwall.session.get`
//   - `recap.mine`, non `season.recap`
//   - il dominio Social Manager (#260) è raggiunto con prefisso
//     `social.` (`social.posts.list` → il dispatcher si aspetta
//     `posts.list`), MA i domini aggiunti allo stesso slug in fasi
//     successive (#261/#262/#263: Race Reports, Reazioni, landing.data,
//     Showcase, laps.raceLaps, laps.syncFromGarage61, lapSubmissions.*,
//     pitwall.broadcastLive) sono chiamati SENZA prefisso, già identici
//     al nome interno — stesso slug, due convenzioni diverse.
//   - un'unica vera eccezione dentro il gruppo prefissato: il frontend
//     chiama `social.plan.dismissed.list` ma il dispatcher si aspetta
//     `plan.dismissedList` (camelCase) — nessuna regola di strip
//     prefisso generica copre questo caso, serve un rename esplicito.
// Il codice sotto è stato quindi riscritto leggendo DAVVERO ogni
// adapter di realApi.js (per lo shape di richiesta/risposta) e il
// sorgente deployato del dispatcher `social-manager`/slug
// `endurance-auditions-get` (via get_edge_function, per i nomi azione
// esatti) — non più per simmetria assunta. I domini NON ancora
// verificati byte-per-byte contro il loro Edge Function reale (perché
// non ancora letto in questa sessione) sono quelli dove realApi.js fa
// puro pass-through (`return await postToBackend(...)` o `ok(res.data)`
// senza unwrap) — per questi il rischio residuo è basso: se lo shape
// non coincidesse, il fallimento sarebbe visibile e immediato alla
// prima chiamata in Chrome durante il cutover di quel dominio
// (#330-340), non un mismatch silenzioso.
//
// ─── Auth ───
// Il token non viene più letto da localStorage (vecchio
// 'vsd_paddock_token', gestito da AuthContext legacy) ma dalla
// sessione Supabase reale via supabaseAuth.getSupabaseSession() —
// sessione persistita da supabase-js (#327). Senza sessione, le
// Edge Function pubbliche (Clash of Classes, ChampionshipInterest,
// Showcase, PrequalCandidates, e ora Roster — vedi sotto) gestiscono
// il caso anonimo via `team_slug`.
//
// FIX #329 (importante, trovato in validazione): con sessione
// assente NON si può semplicemente omettere Authorization. Tutte le
// Edge Function di questo progetto sono deployate con
// verify_jwt=true (default piattaforma Supabase): senza un JWT
// valido in Authorization, la richiesta viene rifiutata dal GATEWAY
// prima ancora che il codice della funzione (incluso il ramo
// team_slug) venga eseguito. La anon key stessa È un JWT valido,
// quindi va sempre inviata come fallback — vedi supabaseClient.js.
//
// ─── team_slug per azioni pubbliche (#329) ───
// roster.list/roster.get NON sono azioni realmente pubbliche lato
// RLS (drivers/drivers_public non concedono nulla ad anon — verrebbe
// comunque zero righe anche con l'anon key, per design deliberato
// dell'hardening #177), ma /roster è oggi una rotta pubblica sul
// sito reale: un visitatore anonimo la vede senza login. Le Edge
// Function roster-list/roster-get sono state riscritte in #329 con
// lo stesso pattern service-role+team_slug già usato per Clash of
// Classes/ChampionshipInterest/Showcase (bypassano RLS, risolvono il
// team dalla sessione se presente, altrimenti da `team_slug`). Come
// showcase.summary/mediaKit (già pubbliche dal design originale in
// #261), queste azioni ricevono `team_slug` di default quando non
// c'è sessione. Progetto a singolo team oggi: hardcoded a 'vsd' —
// da rivedere se/quando #181 (billing multi-team) onboarda un
// secondo team reale.
const DEFAULT_TEAM_SLUG = 'vsd';
const ANON_TEAM_SLUG_ACTIONS = new Set([
  'roster.list', 'roster.get', 'showcase.summary', 'showcase.mediaKit',
  // #333 — Clash of Classes: clash.participants.list/register,
  // clash.standings e clash.incidents.report sono pubbliche per
  // design fin dal sorgente originale (community non tesserata può
  // iscriversi/segnalare senza login, cap. 2.2 regolamento) — le
  // Edge Function le gestiscono già con lo stesso pattern service-
  // role+team_slug di roster.*/showcase.*, mancava solo l'iniezione
  // automatica di team_slug qui lato client per il visitatore
  // anonimo (senza, ClashOfClasses.jsx avrebbe fallito con "team_slug
  // obbligatorio" per ogni chiamata non autenticata).
  'clash.participants.list', 'clash.participants.register', 'clash.standings', 'clash.incidents.report',
  // #351 — Incidents: form nativo pubblico che sostituisce il vecchio
  // Google Form esterno. Community-wide come il Form (UE144 è una lega
  // multi-team, non solo VSD) — stesso pattern anon+team_slug.
  'incidents.report',
  // #334 — pubbliche per design nel sorgente legacy (verificato negli
  // index.ts deployati): interest.list/register (community-wide, come
  // clash.participants.*), prequal.list (nessuna distinzione staff/
  // pubblico nel sorgente) e consent.socialFlags (serve al Roster
  // pubblico per decidere se mostrare la foto vera di un pilota).
  'interest.list', 'interest.register', 'prequal.list', 'consent.socialFlags',
  // #337 — Endurance: /endurance e /endurance/:auditionId sono pagine
  // pubbliche (Endurance.jsx/EnduranceDetail.jsx, nessun gate auth nel
  // routing) e chiamano auditions.list/get/participants.list senza mai
  // passare team_slug — la Edge Function già supporta l'accesso anonimo
  // via team_slug (resolvePublicTeam, stesso helper di Clash/Interest),
  // mancava solo l'iniezione automatica qui lato client.
  'endurance.auditions.list', 'endurance.auditions.get', 'endurance.participants.list',
]);

// #334 FIX REGRESSIONE (19/09-20/09/2026): consent.accept spostato su
// Supabase richiedeva una sessione Supabase reale per risolvere il
// driver chiamante. Nessun pilota reale (tranne l'account admin di
// test) ha mai ottenuto una sessione Supabase — l'UNICO login reale è
// Discord OAuth legacy via Apps Script (vedi Login.jsx/AuthContext.jsx),
// che produce solo `localStorage.vsd_paddock_token`. Bug reale
// riportato dall'utente: "Adone ha compilato il consenso ma non viene
// registrato" — causa: 401 silenzioso su consent-accept per qualunque
// pilota che non fosse Demetrio.
// Fix approvato dall'utente (opzione "Fallback token legacy"): le 19
// Edge Function sottostanti sono state ridistribuite con un fallback
// che, in assenza di un Authorization Supabase valido, verifica
// `payload.legacy_token` contro `auth.verify` su Apps Script (stesso
// meccanismo già usato in api/media-upload.js). Questo Set dice al
// client QUANDO iniettare quel token nel body — vedi callEdgeFunction.
const LEGACY_TOKEN_FALLBACK_ACTIONS = new Set([
  'interest.update', 'interest.remove',
  'prequal.add', 'prequal.remove',
  'candidates.list', 'candidates.add', 'candidates.update', 'candidates.remove',
  'sponsors.list', 'sponsors.add', 'sponsors.update', 'sponsors.remove',
  'treasury.list', 'treasury.add', 'treasury.update', 'treasury.remove',
  'consent.status', 'consent.accept', 'consent.adminList',
  // #331 FIX REGRESSIONE (20/09/2026): stessa causa radice di #334,
  // trovata sul dispatcher condiviso `social-manager` (slug
  // `endurance-auditions-get`, vedi header di
  // cloud/functions/social-manager/index.ts) — segnalata dall'utente:
  // "Casesi non riesce comunque ad inviare il proprio Best Laps con
  // errore Auth richiesto". Stesso fallback aggiunto lato Edge
  // Function; qui solo le azioni self-service (auth: qualsiasi pilota
  // nel sorgente) — quelle admin-only dello stesso dispatcher
  // (Social Manager, lapSubmissions.listPending/approve/reject/remove,
  // reports.update/seedForRace) restano fuori per ora: nessun caso
  // reale segnalato per un admin/staff senza sessione Supabase.
  'lapSubmissions.submit', 'lapSubmissions.listMine',
  'reports.list', 'reports.recent', 'reportReactions.list', 'reportReactions.toggle',
  'landing.data', 'laps.raceLaps',
  // #359 (20/09/2026): stesso gap trovato validando il fix sopra —
  // l'INTERO dominio Best Laps/Academy/Records/Training non aveva mai
  // ricevuto il fallback legacy token (mai incluso nel giro di #331
  // originale). Qualsiasi pilota reale (solo token legacy, mai una
  // sessione Supabase vera) riceveva "Auth richiesto" aprendo Best
  // Laps, Muro dei Record, Academy o Training Insights.
  'laps.list', 'laps.leaderboard', 'laps.update', 'laps.remove',
  'records.team', 'academy.ranking', 'training.insights',
  // #360 (20/09/2026): roster.updateSelf era ESCLUSO da
  // SUPABASE_MIGRATED_ACTIONS in client.js fin da #329 proprio perché
  // non aveva questo fallback — il salvataggio "Modifica profilo"
  // andava sempre al vecchio backend Apps Script, invisibile per
  // roster.get/list (che leggono da Supabase). Segnalato da Demetrio:
  // "ho cambiato da Roster Competitivo a Roster Amatoriale ma non lo
  // cambia". Ora roster-update-self ha lo stesso resolveLegacyDriver
  // di #358/#359 (qui scrive, non solo legge) ed è stato aggiunto
  // anche a SUPABASE_MIGRATED_ACTIONS in client.js.
  'roster.updateSelf',
  // #337 (20/09/2026): stesso gap trovato PRIMA del cutover — RaceDetail.jsx
  // (pagina pubblica /race/:raceId) chiama endurance.stints.list per ogni
  // gara endurance incondizionatamente, e handleStintsList richiede sempre
  // una sessione reale (nessun fallback team_slug per design, a differenza
  // di auditions/participants). Senza questo fallback, ogni pilota con solo
  // il token legacy avrebbe visto silenziosamente zero stint in StintTimeline
  // sulla pagina gara — stesso pattern esatto di #358/#359. Fix gemello
  // applicato lato Edge Function (resolveLegacyDriver in endurance-read/
  // index.ts, v4). Le azioni di scrittura (participants.add/stints.*)
  // restano fuori: sono admin/staff-only e Demetrio (unico admin reale)
  // ha già una sessione Supabase vera.
  'endurance.stints.list',
]);
const LEGACY_TOKEN_STORAGE_KEY = 'vsd_paddock_token';
// ═══════════════════════════════════════════════════════════

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const FUNCTIONS_BASE = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1` : null;

function ok(data) { return { ok: true, data }; }
function fail(error) { return { ok: false, error }; }

// ─── Dispatcher consolidati (#326) ───
const ENDURANCE_READ_SLUG = 'endurance-auditions-list';
const ENDURANCE_WRITE_SLUG = 'endurance-auditions-create';
const SOCIAL_MANAGER_SLUG = 'endurance-auditions-get';

const ENDURANCE_READ_INNER = new Set(['auditions.list', 'auditions.get', 'participants.list', 'stints.list']);

// Azioni Social Manager originali (#260): il frontend le chiama con
// prefisso `social.`, il dispatcher si aspetta il nome SENZA prefisso.
// Un solo rename esplicito (dismissedList) non segue lo strip semplice.
const SOCIAL_PREFIXED_RENAME = {
  'plan.dismissed.list': 'plan.dismissedList',
};

// Azioni aggiunte allo stesso slug in #261/#262/#263: il frontend le
// chiama SENZA prefisso, già uguali al nome interno del dispatcher.
const SOCIAL_DIRECT_ACTIONS = new Set([
  'reports.list', 'reports.recent', 'reports.update', 'reports.seedForRace',
  'reportReactions.list', 'reportReactions.toggle',
  'landing.data',
  'showcase.summary', 'showcase.mediaKit',
  'laps.raceLaps', 'laps.syncFromGarage61',
  'lapSubmissions.submit', 'lapSubmissions.listMine', 'lapSubmissions.listPending',
  'lapSubmissions.approve', 'lapSubmissions.reject', 'lapSubmissions.remove',
  'pitwall.broadcastLive',
  // Roster Admin (NUOVA, 19/09/2026): stesso slug consolidato, vedi
  // header di cloud/functions/social-manager/index.ts per il perché
  // (piano free fermo a 100/100 Edge Function).
  'roster.adminUpdate', 'roster.deletionCandidates', 'roster.adminDelete',
  // Aggiungi pilota (NUOVA, 19/09/2026): vedi header di
  // cloud/functions/social-manager/index.ts per il perché stesso slug.
  'roster.availableSlots', 'roster.adminCreate',
]);

/** Azioni note SENZA equivalente Supabase (gap #326). */
const NO_BACKEND_STUBS = {
  'presence.heartbeat': () => ok({ alive: true }),
  'presence.online': () => ok({ online: [] }),
};

/** auth.* sostituito interamente da src/api/supabaseAuth.js (#327). */
const AUTH_ACTIONS = new Set(['auth.verify', 'auth.discordStart', 'auth.discordCallback', 'auth.login']);

// ─── Tabella di routing 1:1 (azione frontend → slug Edge Function) ───
// Verificata contro client.js (chiamante reale) + realApi.js (adapter
// reale) — vedi commento in testa al file per le correzioni rispetto
// alla prima stesura di #326.
const ROUTING = {
  'roster.list': 'roster-list',
  'roster.get': 'roster-get',
  'roster.updateSelf': 'roster-update-self',

  'teamSessions.list': 'team-sessions-list',
  'teamSessions.create': 'team-sessions-create',
  'teamSessions.update': 'team-sessions-update',
  'teamSessions.remove': 'team-sessions-remove',
  'sessionRsvp.list': 'session-rsvp-list',
  'sessionRsvp.set': 'session-rsvp-set',

  'lookups.cars': 'lookups-cars',
  'lookups.tracks': 'lookups-tracks',

  'laps.list': 'best-laps-list',
  'laps.leaderboard': 'best-laps-leaderboard',
  'laps.add': 'best-laps-add',
  'laps.update': 'best-laps-update',
  'laps.remove': 'best-laps-remove',
  'records.team': 'records-team',
  'pitwall.sessions': 'pitwall-sessions-list',
  'pitwall.session': 'pitwall-session-get',
  'pitwall.logSession': 'pitwall-log-session',

  'races.list': 'races-list',
  'races.upcoming': 'races-upcoming',
  'races.get': 'races-get',
  'races.add': 'races-add',
  'races.update': 'races-update',
  'races.remove': 'races-remove',
  'races.updatePoster': 'races-update-poster',
  'races.updateGallery': 'races-update-gallery',
  'raceResults.list': 'race-results-list',
  'raceResults.import': 'race-results-import',
  'incidents.report': 'incidents-report',
  'incidents.list': 'incidents-list',
  'incidents.resolve': 'incidents-resolve',

  'championships.list': 'championships-list',
  'championships.add': 'championships-add',
  'championships.update': 'championships-update',
  'standings.byChampionship': 'standings-by-championship',
  'standings.progression': 'standings-progression',
  'standings.byDriver': 'standings-by-driver',
  'championships.importStandings': 'championships-import-standings',
  'championships.saveAdjustments': 'championships-save-adjustments',
  'academy.ranking': 'academy-ranking',
  'recap.mine': 'season-recap',
  'skillIndex.list': 'skill-index-list',
  'skillIndex.history': 'skill-index-history',
  'skillIndex.snapshot': 'skill-index-snapshot',

  'rsvp.list': 'rsvp-list',
  'rsvp.set': 'rsvp-set',
  'raceCrews.list': 'race-crews-list',
  'raceCrews.add': 'race-crews-add',
  'raceCrews.remove': 'race-crews-remove',
  'training.insights': 'training-insights',
  'clash.participants.list': 'clash-participants-list',
  'clash.participants.register': 'clash-participants-register',
  'clash.participants.add': 'clash-participants-add',
  'clash.participants.update': 'clash-participants-update',
  'clash.participants.remove': 'clash-participants-remove',
  'clash.results.submitRound': 'clash-results-submit-round',
  'clash.standings': 'clash-standings',
  'clash.incidents.report': 'clash-incidents-report',
  'clash.incidents.list': 'clash-incidents-list',

  'interest.list': 'interest-list',
  'interest.register': 'interest-register',
  'interest.update': 'interest-update',
  'interest.remove': 'interest-remove',
  'prequal.list': 'prequal-list',
  'prequal.add': 'prequal-add',
  'prequal.remove': 'prequal-remove',
  'candidates.list': 'candidates-list',
  'candidates.add': 'candidates-add',
  'candidates.update': 'candidates-update',
  'candidates.remove': 'candidates-remove',
  'sponsors.list': 'sponsors-list',
  'sponsors.add': 'sponsors-add',
  'sponsors.update': 'sponsors-update',
  'sponsors.remove': 'sponsors-remove',

  'treasury.list': 'treasury-list',
  'treasury.add': 'treasury-add',
  'treasury.update': 'treasury-update',
  'treasury.remove': 'treasury-remove',
  'consent.status': 'consent-status',
  'consent.accept': 'consent-accept',
  'consent.adminList': 'consent-admin-list',
  'consent.socialFlags': 'consent-social-flags',
  'auditLog.list': 'audit-log-list',
  'push.subscribe': 'push-subscribe',
  'push.unsubscribe': 'push-unsubscribe',
  'devices.createToken': 'devices-create-token',

  'fuel.logSample': 'fuel-log-sample',
  'fuel.logLive': 'fuel-log-live',
  'fuel.summary': 'fuel-summary',
  'fuel.mySession': 'fuel-my-session',
  'fuel.stints': 'fuel-stints',
  'lapData.import': 'lap-data-import',
  'lapData.sessions': 'lap-data-sessions',
  'lapData.session': 'lap-data-session',
};

// ─── Unwrap: azioni dove realApi.js estrae UN campo da res.data
// invece di restituire res.data così com'è. Verificato leggendo ogni
// adapter corrispondente in realApi.js. Tutto ciò che NON è in questa
// mappa è pass-through di res.data (comportamento di default sotto).
const UNWRAP_KEY = {
  'roster.get': 'driver',
  'lookups.tracks': 'tracks',
  'lookups.cars': 'cars',
  'laps.leaderboard': 'laps',
  'laps.raceLaps': 'laps',
  'races.list': 'races',
  'races.upcoming': 'races',
  'races.get': 'race',
  'endurance.auditions.list': 'auditions',
  'endurance.auditions.get': 'audition',
  'endurance.auditions.create': 'audition',
  'endurance.auditions.update': 'audition',
  'championships.list': 'championships',
  'reports.list': 'reports',
  'reports.recent': 'reports',
  'reportReactions.list': 'reactions',
  'teamSessions.list': 'sessions',
  // FIX #338 (trovato in validazione live via Chrome, non a tavolino,
  // subito dopo il deploy: pagina /admin/social-manager con schermo
  // bianco e "TypeError: e.forEach is not a function" in console):
  // SocialManager.jsx fa `const posts = postsQuery.data || []` /
  // `const metrics = metricsQuery.data || []` aspettandosi un ARRAY
  // diretto (stesso contratto di roster.list/races.list sopra), ma
  // senza voce qui applyUnwrap faceva pass-through dell'intero oggetto
  // `{ posts: [...], count }` / `{ metrics: [...], count }` restituito
  // dal dispatcher — ogni `.forEach`/`.filter`/`.map` su quell'oggetto
  // falliva. Verificato contro i rispettivi adapter in realApi.js
  // (socialPostsListAdapter → res.data.posts, socialMetricsListAdapter
  // → res.data.metrics, socialMediaListAdapter → res.data.media,
  // socialPlanDismissedListAdapter → res.data.dismissed) — le altre
  // azioni social.* (create/update/remove/add/generateText/
  // discord.stats/plan.dismiss/undismiss) restano pass-through
  // dell'intero res.data, fedeli ai rispettivi adapter.
  'social.posts.list': 'posts',
  'social.metrics.list': 'metrics',
  'social.media.list': 'media',
  'social.plan.dismissed.list': 'dismissed',
};

function applyUnwrap(action, res) {
  if (!res.ok) return res;
  const key = UNWRAP_KEY[action];
  if (!key) return ok(res.data);
  return ok(res.data ? res.data[key] : undefined);
}

// ─── FIX #329 (trovato in validazione live, non a tavolino): schema
// Postgres usa `preferred_sims`/`specialties` come `text[]` nativo,
// deviazione deliberata e documentata in 001_foundation.sql ("era CSV
// in una cella, qui array nativo"). Il frontend però — DriverCard.jsx
// e DriverProfile.jsx, mai toccati finché roster.* parlava solo con
// Apps Script — fa `(driver.preferred_sims || '').split(',')`,
// aspettandosi la stringa CSV che Apps Script restituiva dal foglio.
// Un array nativo mandato lì rompe con `TypeError: .split is not a
// function` (confermato live: pagina /roster bianca, crash in
// console). Fix nell'adapter, non nel frontend: si normalizza
// array→CSV qui, esattamente il ruolo di supabaseApi.js (far
// sembrare la risposta Supabase identica a quella di realApi.js).
// ─── FIX #330 (trovato validando Best Laps dopo il cutover Roster,
// non da analisi statica): lo schema Postgres usa `driver_code` come
// colonna per il codice pilota (VSD005, ...) — `id` è l'UUID interno,
// mai esposto come identificatore lato frontend prima d'ora. TUTTO il
// resto del sito (43 file, verificato via grep: DriverCard.jsx,
// Roster.jsx, useBestLaps.js/driverStatus.js, Standings, Training,
// RaceCrews, StintPlanner, ...) si aspetta invece `driver.driver_id`
// come nome campo — è il contratto usato da sempre da realApi.js
// (roster.get({driver_id}), laps[].driver_id, ecc.). Senza questo
// alias, `driver.driver_id` è `undefined` per ogni pilota restituito
// da Supabase: rompe silenziosamente qualunque incrocio client-side
// tra roster e altri dati chiave-per-driver_id (case scoperto in
// produzione: useTeamLeaderboard/activeDriverIdSet in useBestLaps.js
// costruisce un Set con un solo `undefined`, quindi NESSUN giro
// supera più il filtro "pilota attivo" → Best Laps/Muro dei Record
// mostrano "Nessun record" per qualunque combinazione di filtri,
// anche con dati presenti). Fix nell'adapter, stesso principio della
// normalizzazione CSV sotto: si aggiunge l'alias, non si tocca nessuno
// dei 43 file consumer.
function normalizeRosterDriver(d) {
  if (!d) return d;
  const toCsv = v => Array.isArray(v) ? v.join(',') : v;
  return {
    ...d,
    driver_id: d.driver_id || d.driver_code,
    preferred_sims: toCsv(d.preferred_sims),
    specialties: toCsv(d.specialties),
  };
}

// ─── roster.list: filtro client-side (status/role/sim), fedele a
// rosterListAdapter in realApi.js — il backend restituisce sempre
// active+inactive+eventuali removed, i filtri applicativi restano lato
// client (stesso motivo del sorgente: nessun parametro server-side per
// role/sim).
function applyRosterListFilters(drivers, filters) {
  let out = (drivers || []).map(normalizeRosterDriver);
  if (filters.status && filters.status !== 'active') {
    out = out.filter(d => d.status === filters.status);
  }
  if (filters.role) out = out.filter(d => d.role === filters.role);
  if (filters.sim) out = out.filter(d => String(d.preferred_sims || '').includes(filters.sim));
  return out;
}

// ─── laps.list: stesso principio, filtro+limit client-side fedele a
// lapsListAdapter in realApi.js.
function applyLapsListFilters(laps, filters, limit) {
  let out = laps || [];
  if (filters.sim) out = out.filter(l => l.sim === filters.sim);
  if (filters.track_id) out = out.filter(l => l.track_id === filters.track_id);
  if (filters.car_id) out = out.filter(l => l.car_id === filters.car_id);
  if (filters.driver_id) out = out.filter(l => l.driver_id === filters.driver_id);
  if (filters.verified_only) out = out.filter(l => !!l.verified_by);
  if (limit) out = out.slice(0, limit);
  return out;
}

function buildRequest(action, payload) {
  if (action.startsWith('endurance.')) {
    const inner = action.slice('endurance.'.length);
    const slug = ENDURANCE_READ_INNER.has(inner) ? ENDURANCE_READ_SLUG : ENDURANCE_WRITE_SLUG;
    return { slug, body: { action: inner, ...payload }, innerAction: inner };
  }
  if (action === 'messenger.send') {
    return { slug: 'messenger-send', body: payload }; // payload usa già `mode`
  }
  if (action.startsWith('social.')) {
    const inner = action.slice('social.'.length);
    const renamed = SOCIAL_PREFIXED_RENAME[inner] || inner;
    return { slug: SOCIAL_MANAGER_SLUG, body: { action: renamed, ...payload } };
  }
  if (SOCIAL_DIRECT_ACTIONS.has(action)) {
    return { slug: SOCIAL_MANAGER_SLUG, body: { action, ...payload } };
  }
  if (ROUTING[action]) {
    return { slug: ROUTING[action], body: payload };
  }
  return null;
}

async function callEdgeFunction(slug, body, action) {
  if (!FUNCTIONS_BASE) return fail('VITE_SUPABASE_URL non configurato in .env.local');

  const session = await getSupabaseSession();
  const headers = { 'Content-Type': 'application/json' };
  // Sempre un JWT valido in Authorization — vedi nota in testa al file
  // (verify_jwt=true a livello di piattaforma su ogni Edge Function).
  headers.Authorization = `Bearer ${session?.access_token || supabaseAnonKey}`;

  let finalBody = body || {};
  if (!session?.access_token && action && ANON_TEAM_SLUG_ACTIONS.has(action) && !finalBody.team_slug) {
    finalBody = { ...finalBody, team_slug: DEFAULT_TEAM_SLUG };
  }
  // #334 fix regressione consenso/treasury/candidates/sponsors/prequal:
  // vedi nota su LEGACY_TOKEN_FALLBACK_ACTIONS in testa al file.
  if (!session?.access_token && action && LEGACY_TOKEN_FALLBACK_ACTIONS.has(action) && !finalBody.legacy_token) {
    const legacyToken = typeof localStorage !== 'undefined' ? localStorage.getItem(LEGACY_TOKEN_STORAGE_KEY) : null;
    if (legacyToken) finalBody = { ...finalBody, legacy_token: legacyToken };
  }

  let response;
  try {
    response = await fetch(`${FUNCTIONS_BASE}/${slug}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(finalBody),
    });
  } catch (e) {
    console.error('[supabaseApi] network error', slug, e);
    return fail('Errore di rete: ' + (e.message || 'connessione fallita'));
  }

  let json;
  try {
    json = await response.json();
  } catch (e) {
    console.error('[supabaseApi] JSON parse error', slug, e);
    return fail(`Risposta non valida dal server (HTTP ${response.status})`);
  }

  if (json?.ok === undefined) {
    return fail(json?.error || `HTTP ${response.status}: ${response.statusText}`);
  }
  return json;
}

/** Stesso identico contratto di realApi.js:callApi(action, payload). */
export async function callApi(action, payload = {}) {
  if (AUTH_ACTIONS.has(action)) {
    return fail(`Azione '${action}' non instradata: l'auth reale passa da src/api/supabaseAuth.js (#327), non da callApi.`);
  }
  if (NO_BACKEND_STUBS[action]) {
    return NO_BACKEND_STUBS[action]();
  }

  try {
    // ── Casi con logica request/response oltre il routing puro ──
    if (action === 'roster.list') {
      const filters = (payload && payload.filters) || {};
      const res = await callEdgeFunction('roster-list', {
        includeInactive: true,
        includeRemoved: filters.includeRemoved === true,
      }, action);
      if (!res.ok) return res;
      return ok(applyRosterListFilters(res.data?.drivers, filters));
    }

    if (action === 'laps.list') {
      const filters = (payload && payload.filters) || {};
      const limit = payload && payload.limit;
      const res = await callEdgeFunction('best-laps-list', {});
      if (!res.ok) return res;
      return ok(applyLapsListFilters(res.data?.laps, filters, limit));
    }

    const request = buildRequest(action, payload);
    if (!request) return fail(`Action non instradata verso Supabase: ${action}`);

    const res = await callEdgeFunction(request.slug, request.body, action);
    const unwrapped = applyUnwrap(action, res);
    // roster.get: stessa normalizzazione array→CSV di roster.list (vedi
    // normalizeRosterDriver) — DriverProfile.jsx fa lo stesso .split(',').
    if (action === 'roster.get' && unwrapped.ok) {
      return ok(normalizeRosterDriver(unwrapped.data));
    }
    return unwrapped;
  } catch (e) {
    console.error('[supabaseApi]', action, e);
    return fail(e.message || 'Errore interno supabaseApi');
  }
}
