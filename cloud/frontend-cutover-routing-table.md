# #264 — Tabella di routing azione → Edge Function (task #326)

Riferimento per `src/api/supabaseApi.js` (#328): per ogni `action` che il frontend passa oggi a `realApi.js`/`postToBackend`, lo slug Supabase Edge Function corrispondente e l'eventuale trasformazione del nome azione richiesta nel payload.

**Aggiornamento post-#328**: questa tabella è stata scritta guardando gli SLUG delle Edge Function e inferendo i nomi azione per simmetria — un errore, corretto durante la scrittura di `src/api/supabaseApi.js` leggendo per intero `client.js` (chiamante reale) e `realApi.js` (1512 righe) più il sorgente deployato del dispatcher social-manager. Le correzioni sono marcate inline sotto. `src/api/supabaseApi.js` resta la fonte di verità definitiva (include anche la mappa `UNWRAP_KEY`, non presente qui, per i pochi casi dove realApi.js estrae un campo da `res.data` invece di restituirlo così com'è).

**Regola generale**: la stragrande maggioranza degli slug sono endpoint single-purpose 1:1 — non leggono affatto un campo `action` dal payload, quindi il nome azione del frontend serve solo per lo *smistamento client-side* verso lo slug giusto, non viene inoltrato al backend. Le uniche eccezioni sono i dispatcher consolidati elencati sotto, dove il payload include davvero un campo `action` (o `mode`) che deve avere il nome ESATTO atteso dal dispatcher.

## Dispatcher consolidati (payload contiene `action`/`mode` — richiede remap)

### `endurance-auditions-list` (= "endurance-read")
Frontend chiama con prefisso `endurance.`, il dispatcher si aspetta l'azione SENZA prefisso:

| azione frontend | azione da inviare nel payload |
|---|---|
| `endurance.auditions.list` | `auditions.list` |
| `endurance.auditions.get` | `auditions.get` |
| `endurance.participants.list` | `participants.list` |
| `endurance.stints.list` | `stints.list` |

Auth: `auditions.list/get` e `participants.list` pubbliche (fallback service-role via `team_slug`); `stints.list` richiede sessione valida (no anonimo).

### `endurance-auditions-create` (= "endurance-write")
Stesso principio, strip del prefisso `endurance.`:

| azione frontend | azione da inviare nel payload |
|---|---|
| `endurance.auditions.create` | `auditions.create` |
| `endurance.auditions.update` | `auditions.update` |
| `endurance.participants.add` | `participants.add` |
| `endurance.participants.update` | `participants.update` |
| `endurance.participants.remove` | `participants.remove` |
| `endurance.stints.add` | `stints.add` |
| `endurance.stints.update` | `stints.update` |
| `endurance.stints.remove` | `stints.remove` |
| `endurance.stints.generate` | `stints.generate` |
| `endurance.stints.validateCoverage` | `stints.validateCoverage` |
| `endurance.stints.confirmPlan` | `stints.confirmPlan` |

Auth: sempre autenticato; `auditions.create/update` staff-o-admin, tutto il resto SOLO admin.

### `endurance-auditions-get` (= slug riciclato per "social-manager")
**CORREZIONE rispetto alla prima stesura di questa tabella** (scoperta confrontando client.js + realApi.js + il sorgente deployato reale via `get_edge_function`, non più per simmetria assunta): CI SONO due convenzioni diverse sullo stesso slug.
- Azioni Social Manager originali (#260) — `posts.list/create/update/remove`, `metrics.list/add`, `media.list/add/remove`, `plan.dismiss/undismiss/dismissedList/runDigest`, `generateText`, `discord.stats` — il frontend le chiama con prefisso `social.` (es. `social.posts.create`), il dispatcher si aspetta il nome SENZA prefisso (`posts.create`). **Un'eccezione dentro questo gruppo**: il frontend chiama `social.plan.dismissed.list` ma il dispatcher si aspetta `plan.dismissedList` (camelCase) — un rename esplicito, non uno strip di prefisso regolare. Nota anche: `posts.create` (NON `posts.add`, correzione rispetto alla stesura precedente).
- Azioni aggiunte allo stesso slug in #261/#262/#263 — `reports.list/recent/update/seedForRace`, `reportReactions.list/toggle`, `landing.data`, `showcase.summary/mediaKit`, `laps.raceLaps`, `laps.syncFromGarage61`, `lapSubmissions.submit/listMine/listPending/approve/reject/remove`, `pitwall.broadcastLive` — il frontend le chiama SENZA alcun prefisso, già identiche al nome interno del dispatcher.

Auth per gruppo: Social Manager (`posts.*`/`metrics.*`/`media.*`/`plan.*`/`generateText`/`discord.stats`) → SOLO admin; Race Reports/Reazioni/`landing.data`/`laps.raceLaps`/`lapSubmissions.submit`/`listMine` → pilota autenticato qualsiasi; `lapSubmissions.listPending/approve/reject/remove` → SOLO admin; `laps.syncFromGarage61` → staff-o-admin; `reports.update`/`seedForRace` → staff-o-admin; `pitwall.broadcastLive` → staff-o-admin; Showcase (`showcase.*`) → pubblico (richiede `team_slug` se anonimo).

### `messenger-send` (unico caso di dispatch runtime non basato su `action`)
Il payload usa la chiave `mode` (`'channel'` | `'dm'`), non `action`. Nessuno strip di prefisso, ma la chiave del campo è diversa dalle altre — annotare esplicitamente in `supabaseApi.js`.

## Tutti gli altri slug — 1:1, nessun dispatch by-action

Azione frontend = nome logico = nessuna trasformazione richiesta nel payload (lo slug stesso è la sola cosa che identifica l'operazione). Elenco completo con `verify_jwt` e note auth particolari:

**Roster / Calendario / Best Laps / Pit Wall (snapshot)**
- `roster.list` → `roster-list` (jwt:true)
- `roster.get` → `roster-get` (jwt:true)
- `roster.updateSelf` → `roster-update-self` (jwt:true)
- `teamSessions.list/create/update/remove` → `team-sessions-list/create/update/remove` (jwt:true; create: tipi "aperti" a tutti, altri solo staff; update/remove: staff/admin o autore se sessione aperta)
- `sessionRsvp.list/set` → `session-rsvp-list/set` (jwt:true; `set`: driver_id sempre da auth)
- `lookups.cars/tracks` → `lookups-cars/tracks` (jwt:true)
- `laps.list/leaderboard` → `best-laps-list/leaderboard` (jwt:true) — **CORREZIONE**: il frontend chiama `laps.*`, MAI `bestLaps.*` (nome inventato dal nome dello slug nella prima stesura di questa tabella — verificato in client.js/realApi.js)
- `laps.add` → `best-laps-add` (jwt:**false**, auth verificata a mano via header Authorization)
- `laps.update/remove` → `best-laps-update/remove` (jwt:true)
- `records.team` → `records-team` (jwt:true)
- `pitwall.sessions` → `pitwall-sessions-list` (jwt:true) — **CORREZIONE**: azione frontend è `pitwall.sessions`, non `pitwall.sessions.list`
- `pitwall.session` → `pitwall-session-get` (jwt:true) — **CORREZIONE**: azione frontend è `pitwall.session`, non `pitwall.session.get`
- `pitwall.logSession` → `pitwall-log-session` (jwt:true; bridge-only, NON esposta in `client.js` lato pilota)

**Races / RaceResults / Incidents**
- `races.list/upcoming/get` → `races-list/upcoming/get` (jwt:true)
- `races.add/update/remove` → `races-add/update/remove` (jwt:true, SOLO admin)
- `races.updatePoster/updateGallery` → `races-update-poster/update-gallery` (jwt:true, staff-o-admin)
- `raceResults.list` → `race-results-list` (jwt:true, nessun gate ruolo)
- `raceResults.import` → `race-results-import` (jwt:**false**, JWT riverificato a mano, gate staff/admin)
- `incidents.report/list/resolve` → `incidents-report/list/resolve` (jwt:true; `resolve` SOLO staff/admin, `staff_notes` mascherato ai non-staff in `list`)

**Championships / Standings / Academy**
- `championships.list` → `championships-list` (jwt:true)
- `championships.add/update` → `championships-add/update` (jwt:true, staff/admin; endpoint nuovi, non nel sorgente)
- `standings.byChampionship/progression/byDriver` → `standings-by-championship/progression/by-driver` (jwt:true)
- `championships.importStandings/saveAdjustments` → `championships-import-standings/save-adjustments` (jwt:true, staff/admin)
- `academy.ranking` → `academy-ranking` (jwt:true)
- `recap.mine` → `season-recap` (jwt:true) — **CORREZIONE**: azione frontend è `recap.mine`, non `season.recap`
- `skillIndex.list/history` → `skill-index-list/history` (jwt:true)
- `skillIndex.snapshot` → `skill-index-snapshot` (jwt:true, staff/admin; endpoint nuovo)

**RaceRSVP / RaceCrews / Clash / Training**
- `rsvp.list/set` → `rsvp-list/set` (jwt:true; dominio `race_rsvps`, DISTINTO da `sessionRsvp.*`)
- `raceCrews.list` → `race-crews-list` (jwt:true)
- `raceCrews.add/remove` → `race-crews-add/remove` (jwt:true, staff/admin; `crew_id` uuid)
- `training.insights` → `training-insights` (jwt:true)
- `clash.participants.list/standings` → `clash-participants-list`/`clash-standings` (jwt:true ma nessuna auth applicativa richiesta — pubblico)
- `clash.participants.register` → `clash-participants-register` (jwt:true, auth opzionale/self-service, anche anonimo con `team_slug`)
- `clash.participants.add/update/remove` → `clash-participants-add/update/remove` (jwt:true, staff/admin; `remove` è soft-delete)
- `clash.results.submitRound` → `clash-results-submit-round` (jwt:true, staff/admin)
- `clash.incidents.report` → `clash-incidents-report` (jwt:true, nessuna auth applicativa richiesta — pubblico)
- `clash.incidents.list` → `clash-incidents-list` (jwt:true, staff/admin)

**Interest / Prequal / Candidates / Sponsors**
- `interest.list/register/update/remove` → `interest-list/register/update/remove` (jwt:true; `update` solo la propria riga, `remove` soft-delete)
- `prequal.list/add/remove` → `prequal-list/add/remove` (jwt:true; `remove` hard delete)
- `candidates.list/add/update/remove` → `candidates-list/add/update/remove` (jwt:true; audit log su add/update status, `remove` hard delete)
- `sponsors.list/add/update/remove` → `sponsors-list/add/update/remove` (jwt:true; audit log su add/update, notifica Discord su status→active, `remove` hard delete)

**Treasury / Consent / AuditLog / Push / Messenger / Devices**
- `treasury.list/add/update/remove` → `treasury-list/add/update/remove` (jwt:true, SOLO `role==='admin'`, non basta staff; `remove` hard delete)
- `consent.status/accept` → `consent-status/accept` (jwt:true, self-service; `accept` calcola `is_minor` server-side)
- `consent.adminList` → `consent-admin-list` (jwt:true, SOLO admin)
- `consent.socialFlags` → `consent-social-flags` (jwt:true a livello piattaforma, ma AUTH APPLICATIVA OPZIONALE: se manca `Authorization` richiede `team_slug` nel payload, risolto via service-role)
- `auditLog.list` → `audit-log-list` (jwt:true, staff/admin)
- `push.subscribe/unsubscribe` → `push-subscribe/unsubscribe` (jwt:true)
- `messenger.send` → `messenger-send` (jwt:true; vedi nota dispatcher sopra — payload usa `mode`, non `action`; staff/admin OPPURE driver con `can_message=true`)
- `devices.createToken` → `devices-create-token` (jwt:true STANDARD in ingresso, ma genera un device-token HMAC-SHA256 STATELESS separato per il companion — vedi nota Fuel sotto)

**Fuel / LapData**
- `fuel.logSample/logLive/summary/mySession/stints` → `fuel-log-sample/log-live/summary/my-session/stints` (jwt:**false** a livello piattaforma — auth interamente in-handler: prova prima il device-token HMAC generato da `devices-create-token`, poi fallback a sessione Supabase standard via `auth.getUser()`; `driver_id`/`team_id` mai letti dal payload, sempre risolti dal token; query sempre via client service-role)
- `lapData.import` → `lap-data-import` (jwt:true, staff/admin)
- `lapData.sessions/session` → `lap-data-sessions/session` (jwt:true, nessun gate ruolo)

## Gap noti — nessuna Edge Function equivalente

- **`presence.heartbeat` / `presence.online`**: nessuno slug corrispondente in `list_edge_functions`. Il realtime "chi è online" di Apps Script non è stato portato in nessuna fase precedente. Decisione da prendere in #264/#327: droppare la feature, oppure costruirla ex-novo (candidato naturale: Supabase Realtime Presence, stesso meccanismo già usato per il Pit Wall relay in #263 — coerente con lo stack, ma è lavoro nuovo non nel piano di #326).

## Nota collaterale — disallineamento repo↔deploy (non bloccante per #264)

I sorgenti locali in `cloud/functions/` risultano MANCANTI per gli slug: `rsvp-*`, `race-crews-*`, `training-insights`, `clash-*`, `fuel-*`, `lap-data-*` — le function sono deployate e funzionanti su Supabase ma non committate/sincronizzate nel repo git locale. Non impatta il routing (verificato leggendo il codice deployato via `get_edge_function`), ma è debito da chiudere — probabilmente insieme a #94 ("Pulire deployment sbagliato e versioni vecchie Apps Script") o come task di sync a sé.
