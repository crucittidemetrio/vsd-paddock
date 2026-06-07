# VSD Paddock — Documento di Passaggio Consegne e Architettura Master

> **Versione**: 1.0 — generato 5 giugno 2026
> **Owner**: Demetrio Crucitti (Team Principal, VSD005)
> **Repo**: `crucittidemetrio/vsd-paddock` (GitHub, branch principale: `main`)
> **Produzione**: https://vsd-paddock.vercel.app
> **Status**: Sprint 0 in chiusura, Phase 3 MVP live

---

## 1. Panoramica del Progetto

### 1.1 Cosa è VSD Paddock

**VSD Paddock** è il *data hub* centrale del team di sim racing esports italiano **Virtual Sim Driver (VSD)**. È un'applicazione web full-stack che funge da:

- **Single source of truth** per dati dei piloti, gare, tempi sul giro, championship standings
- **Portale pubblico** di showcase per il team (landing pubblica, roster, audition endurance)
- **Console admin** per il Team Principal: gestione audizioni endurance, import risultati gare, sincronizzazione lap data da Garage61, gestione championship
- **Hub di comunicazione** con notifiche Discord automatiche (webhook) verso il server team

### 1.2 Target utenti

| Tier | Identificazione | Cosa vede |
|---|---|---|
| **Anonymous** | Nessun login | Landing pubblica, roster pubblico, audizioni endurance, best laps leaderboard |
| **Guest (Discord member)** | Discord OAuth, no ruolo VSD | Stesso pubblico + identità Discord visibile |
| **Pilot VSD** | Discord OAuth + ruolo VSD su Discord server | Pubblico + "I miei tempi" + race details privati |
| **Staff / Admin** | Sheet Drivers `role='admin'` o `role='staff'` | Tutto + admin console (import, gestione audizioni, sync Garage61) |

### 1.3 Macro-funzionalità

**Implementate** (vedi `Stato Attuale` §5 per dettaglio):
- Roster pubblico 27 piloti attivi (28 totali, 1 service account VSD001 nascosto)
- Best Laps con leaderboard, "I miei tempi", filtri sim/track/class
- Race Hub con calendario, risultati gare, race poster
- Championship standings con import automatico
- Activity feed (Mission Control) con eventi recenti del team
- Race Reports (anonimi/pubblici/privati con privacy model B+a)
- **Endurance Audition System** (Phase 1A-3 MVP): creazione audizioni, gestione partecipanti, target_race con countdown
- Discord OAuth login flow completo
- Garage61 sync automatico ogni 4h (best laps "puliti" iRacing only)

**In sviluppo / pianificate**:
- **Phase 4**: Race Management Console (StintPlanner, FuelPlan, TyrePlan, EnergyPlan LMH hybrid, Strategy Sheet in-gara) — target metà agosto 2026
- **Phase 5**: Live race data via polling Apps Script ogni 30s
- **Wave 9.8**: Race Laps tab (lap di gara, non solo clean best laps)
- **Wave 9.9**: Championship standings extension

### 1.4 Sim coperti

- **LMU** = Le Mans Ultimate (endurance focus)
- **IRC** = iRacing (multi-class + single-make championship)
- **ACE** = Assetto Corsa Evo

Garage61 sincronizza **solo iRacing** (limite API upstream). LMU usa import manuale via JSON file.

---

## 2. Stack Tecnologico e Ambiente

### 2.1 Frontend

| Componente | Versione/Dettaglio | Note |
|---|---|---|
| **Framework** | React 19 | Functional components + hooks only |
| **Build tool** | Vite | Hot module reload, dev server su `:5173` |
| **Routing** | React Router v6 | File-based pages in `src/pages/` |
| **State** | TanStack Query (React Query v5) | Cache aggressiva, staleTime 30-60s default |
| **Styling** | CSS Modules + design tokens | No Tailwind, no styled-components |
| **HTTP** | Fetch API nativa con wrapper `postToBackend` | POST con body JSON in `text/plain` per evitare CORS preflight |

### 2.2 Backend

| Componente | Dettaglio | Note |
|---|---|---|
| **Runtime** | Google Apps Script V8 | Standalone project, NON bound a uno spreadsheet |
| **Storage** | Google Sheets (`VSD_HUB_DB`) | ID: `1ADUq7CRy0_PtPqbPYS42iCNgpdxZrNlSMY3HX6T8XQA` |
| **Deploy tool** | `clasp` (CLI Google) | Push da locale al cloud Apps Script |
| **Endpoint** | Single `doPost` web app `/exec` | Action-based dispatcher (vedi §4.1) |
| **Auth** | HMAC-SHA256 token | Custom token format, TTL 7 giorni |
| **Cache** | `CacheService.getScriptCache()` | 600s default per sheet reads via `getCachedSheetData_` |

### 2.3 Hosting & Servizi esterni

| Servizio | Uso |
|---|---|
| **Vercel** | Hosting frontend, auto-deploy on push to `main` |
| **GitHub** | Repo: `crucittidemetrio/vsd-paddock` |
| **Google Sheets** | Database backend |
| **Google Apps Script** | Logic backend |
| **Discord OAuth 2.0** | Login utenti (Client ID `1508540322173685870`, app "VSD Paddock") |
| **Discord Webhooks** | Notifiche automatiche su nuovo race results / report |
| **Garage61 API** | Sync clean best laps iRacing |
| **iRacing JSON export** | Import manuale race results |

### 2.4 Ambiente sviluppo

| Aspetto | Configurazione |
|---|---|
| **OS** | Windows (Demetrio dev) |
| **Shell** | PowerShell (NON bash) |
| **IDE** | VS Code |
| **Path locale** | `C:\Users\Demetrio\Dev\vsd-paddock` (post-migration da OneDrive) |
| **Branch strategy** | Feature branch `wave-X.X-descrizione`, merge in `main` via fast-forward o squash |

### 2.5 Brand tokens (rigorosi)

```css
--color-bg-dark: #060d1f;       /* dark blue base */
--color-cyan: #00d4ff;          /* accent primary */
--color-blue: #3b8bff;          /* accent secondary */
--color-orange: #f5a623;        /* warning/highlight */
--color-red: #ef3340;           /* error/alert */

/* Typography */
--font-display: 'Rajdhani', sans-serif;  /* headings, brand */
--font-body: 'Inter', sans-serif;        /* body text */
--font-mono: 'JetBrains Mono', monospace; /* IDs, codes, badges */
```

Italian Google Sheets: **semicolons** come separatori di formule (non virgole).

---

## 3. Architettura dei Dati e Database

### 3.1 Storage: Google Sheets `VSD_HUB_DB`

Database principale = singolo spreadsheet con N tabs. Ogni tab è una "tabella". Pro/contro questo approccio:

**Pro**:
- Demetrio modifica dati direttamente nel UI di Google Sheets
- Audit log naturale (revision history Sheets)
- Zero costo infrastrutturale
- Backup automatico Google

**Contro**:
- No transactions (race conditions possibili su write concorrenti)
- No foreign key constraints (integrità referenziale a livello applicativo)
- Lettura batch O(n) (no indici)
- Limit ~10M celle totali per spreadsheet (lontani dal limite ora)
- ID generati manualmente dall'app (no auto-increment)

### 3.2 Tabs principali (schema)

#### `Drivers` (28 righe, 1 service account)
```
driver_id (PK)  | display_name | full_name | role (admin/staff/pilot) | status (active/inactive/service) |
discord_id      | iracing_account | race_number | sims_csv ('LMU,IRC,ACE') | photo_url | bio | ...
```
Convenzioni:
- `driver_id` format: `VSD###` (es. `VSD005` = Demetrio)
- `display_name` format: `Nome IniL.` (es. `Mattia A.`) — eccezione: `Demetrio` only
- `VSD001` = team service account (`v.sim.driver@gmail.com`), status NON 'active', escluso da tutte le UI
- `discord_id`: snowflake string, plain text (evita auto-corruption Sheets)

#### `Laps`
```
lap_id (PK)  | driver_id (FK) | sim | track_id (FK) | car_id (FK) | car_class |
lap_time_ms  | session_type (race/qualifying/practice) | source (garage61/manual) |
garage61_id  | created_at | ...
```
Convenzioni:
- `lap_id` format: `LAP###` sequenziale
- `lap_time_ms`: tempo in millisecondi (integer)
- Dedup logic: `(driver_id, track_id, car_id, lap_time_ms, source)` deve essere unique

#### `Races`
```
race_id (PK) | championship_id (FK) | round | name | sim | track_id | car_class |
date         | duration_min | format (sprint/endurance) | status (scheduled/in_progress/completed/cancelled) |
weather      | poster_url | notes
```

#### `RaceResults` (Wave 9.7+)
```
result_id (PK) | race_id (FK) | driver_id (FK, nullable) | driver_name_external |
session_type   | position | best_lap_ms | total_laps | gap_to_winner |
points_awarded | raw_payload (JSON dump) | imported_at
```
- Match logic in `RaceResultsImport.js`: `matchDriverName_()` con cascade exact → firstname+initial → single-word

#### `Championships`
```
championship_id (PK) | name | sim | season | scoring_system | banner_url | ...
```

#### `Standings`
```
standing_id (PK) | championship_id (FK) | driver_id (FK) | total_points |
position | races_completed | imported_at
```

#### `Tracks` (lookup)
```
track_id (PK) | sim | display_name | length_km | layout
```
- `track_id` format: `{sim}-{slug}` lowercase, es. `lmu-lemans-gp`, `irc-summit-point-raceway`
- **CASE-SENSITIVE** (bug noto: `lmu-spa-gp` duplicato in 2 case)

#### `Cars` (lookup)
```
car_id (PK) | sim | car_name | manufacturer | category | race_class | garage61_id | active
```
- `car_id` format: `{sim}-{slug}` lowercase, es. `lmu-ferrari-499P`, `irc-toyota-gr86`
- Auto LMU usa case mixed (es. `lmu-ferrari-499P` con `P` maiuscolo)
- Auto draftate automaticamente da Garage61 sync se mancano (modalità `unmapped` → admin completa `manufacturer/category/race_class`)

#### `EnduranceAuditions` (Phase 1A, 23 colonne)
Audizioni per ingaggi endurance racing:
```
audition_id (PK) | name | sim | track_id | mandatory_car_id | pilot_class |
date | duration_minutes_real | time_multiplier | duration_minutes_ingame |
start_time_ingame | end_time_ingame | ai_strength_pct |
field_size_hypercar | field_size_lmp2 | field_size_gt3 | weather_condition |
setup_url | setup_notes | target_race | target_race_date |
status (draft/scheduled/in_progress/completed/cancelled) |
created_at | created_by
```
Convenzioni:
- `audition_id` format: `aud_{8-char hex}` (es. `aud_ed33752e`)
- Computed fields: `duration_minutes_ingame = duration_minutes_real * time_multiplier`, `end_time_ingame = start_time_ingame + duration_minutes_ingame` (formato `hh:mm`)
- Soft delete: status = `cancelled` (no DELETE row)

#### `EnduranceParticipants` (Phase 3 MVP, 7 colonne)
```
participation_id (PK) | audition_id (FK) | driver_id (FK) |
status (registered/accepted/reserve/rejected/withdrawn) |
added_at | added_by | notes
```
- UNIQUE constraint: `(audition_id, driver_id)` enforced a livello applicativo
- Status `rejected`/`withdrawn` nascosti dalle UI pubbliche (visibili solo admin)

#### `EnduranceAuditionStints` (Phase 1A, 20 colonne)
Stint individuali pianificati per ogni partecipante. Schema esteso non riportato qui per brevità.

### 3.3 Convenzioni di nomenclatura (RIGOROSE)

#### Backend Apps Script

| Tipo | Convenzione | Esempio |
|---|---|---|
| File | PascalCase con `.js` locale, Apps Script li rinomina `.gs` cloud | `EnduranceParticipants.js` → `EnduranceParticipants.gs` |
| Handler functions (HTTP) | `handle{Domain}{Action}` | `handleEnduranceParticipantsList`, `handleRosterList` |
| Helper privati | `_camelCase_` suffisso `_` o `camelCase_` | `_epLoadAll_()`, `findDriverByDiscordId_()` |
| Action dispatcher map | `'domain.method'` lowercase | `'endurance.participants.list'`, `'auth.discordCallback'` |
| Script Properties | `UPPER_SNAKE_CASE` | `AUTH_SECRET`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID` |

#### Frontend React

| Tipo | Convenzione | Esempio |
|---|---|---|
| Component file | PascalCase + `.jsx` | `EnduranceDetail.jsx`, `AdminEnduranceForm.jsx` |
| Hook file | `useCamelCase.js` | `useEnduranceParticipants.js`, `useRoster.js` |
| CSS Modules | Component-paired `.module.css` | `EnduranceDetail.module.css` |
| API adapter | `{action}Adapter` | `enduranceParticipantsListAdapter`, `racesListAdapter` |
| API namespace | nested objects in `client.js` | `api.endurance.participants.list()`, `api.auth.discordStart()` |
| Hook export | `useDomainAction` o `useDomain` (collection) | `useDrivers`, `useAddParticipant` |

#### Sheets

| Tipo | Convenzione | Esempio |
|---|---|---|
| Column names | `snake_case` | `driver_id`, `lap_time_ms`, `created_at` |
| IDs | `{prefix}_{value}` o sim-prefixed | `aud_ed33752e`, `lmu-lemans-gp`, `VSD005` |
| Booleans | UPPERCASE | `TRUE` / `FALSE` |
| Dates | ISO 8601 string | `2026-06-04T19:20:00.000Z` o `2026-06-04 21:20:00` |
| Empty values | Empty string, NOT `null` | `""` |

### 3.4 Auth: HMAC token format

Token frontend (post Discord OAuth) format:
```
base64WebSafe(driver_id|tier|sims_csv|expiresAt|signature)
```
- Signature = HMAC-SHA256 of payload con `AUTH_SECRET`
- `tier`: `admin` / `staff` / `pilot_vsd` / `guest` / `anonymous`
- TTL = 7 giorni
- Generato da `generateTokenWithClassification_()` in `apps-script/discordAuth.js`

---

## 4. Mappatura dei Moduli

### 4.1 Backend (`apps-script/`)

#### Dispatcher

**`Codice.js`** — Entry point HTTP + routing.
- `doGet(e)`: health check pubblico
- `doPost(e)`: dispatcher principale. Parsifica `{action, token, payload}`, lookup in `ACTIONS` map, verifica token, invoca handler con `(payload, ctx)`
- `ACTIONS = {}` mappa `'domain.method'` → handler function reference (~50 entries)

#### Auth & Security

**`Security.js`** — HMAC sign/verify, access_code generation (legacy), AUTH_SECRET rotation logic.
- `signHmac(payload, secret)`: SHA-256 HMAC
- `verifyToken(token)`: parse + verify firma + check expiration
- `getAuthSecret()`: read da Script Properties
- `generateAccessCode(displayName)` (legacy, deprecato Wave 10)
- `rotateAuthSecret()`: helper per rotation

**`discordAuth.js`** — Discord OAuth flow.
- `handleDiscordAuthStart_(payload)`: genera URL OAuth con CSRF state cached 10min
- `handleDiscordCallback(payload, ctx)`: exchange code → access_token → fetch user info + guild membership + roles → classify → return token
- `classifyDiscordUser_(discordId, roles, isMember)`: determina tier basato su precedenza sheet role > Discord VSD role > guest
- `findDriverByDiscordId_(discordId)`: lookup driver via discord_id column
- `generateTokenWithClassification_(classification)`: produce HMAC token con tier+sims

#### Domain handlers

**`Roster.js`** — Piloti.
- `handleRosterList(payload, ctx)`: lista drivers filtrati per `status='active'` (escluso VSD001), sanitized (`sanitizeDriver(d, 'public')`)
- `handleRosterGet(payload, ctx)`: detail singolo pilota

**`Laps.js`** — Tempi sul giro.
- `handleLapsList(payload, ctx)`: leaderboard con filtri sim/track/class
- `handleLapsRaceLaps(payload, ctx)`: laps filtrati per `session_type='race'` (Wave 9.8 IN BACKLOG)
- `handleLapsSyncFromGarage61(payload, ctx)`: triggera sync da admin UI

**`Races.js`** — Calendario gare.
- `handleRacesList`, `handleRacesUpcoming`, `handleRacesGet`
- `handleRacesUpdatePoster`: admin upload race poster

**`RaceResultsImport.js`** — Import risultati JSON iRacing/LMU.
- `handleRaceResultsList`: query results di una race
- `handleRaceResultsImport`: parsing JSON, autodetect qualifying vs race, `matchDriverName_()` cascade, write RaceResults, update race status, trigger Discord notification (wrapped in inner try/catch per non bloccare import)

**`Championships.js` + `Standings.js`** — Championship rankings.
- `handleChampionshipsList`, `handleChampionshipsImportStandings`, `handleStandingsByChampionship`

**`Reports.js`** — Race reports.
- `handleReportsList`, `handleReportsRecent`

**`Showcase.js`** — Landing pubblica summary.
- `handleShowcaseSummary`: aggregato counts (drivers, races completed, podiums, ecc.) — **no auth required**

**`Endurance.js`** — Audizioni endurance.
- `handleEnduranceAuditionsList/Get/Create/Update`: CRUD audizioni
- Computed field calculation: `duration_minutes_ingame`, `end_time_ingame`
- Soft delete via `status='cancelled'`

**`EnduranceParticipants.js`** — Partecipanti audizioni (Phase 3 MVP, 5 giu 2026).
- `handleEnduranceParticipantsList/Add/Update/Remove`
- Helpers privati: `_epGetSheet_()`, `_epLoadAll_()`, `_epFindById_()`, `_epFindByAuditionAndDriver_()`, `_epGenerateId_()`, `_epIsAdmin_()`
- Auth: list pubblica, mutations richiedono `ctx.role === 'admin'` o `ctx.tier === 'admin'`

#### Integrazioni esterne

**`garage61.js`** (~770 righe) — Sync clean best laps da Garage61 API.
- `garage61Get_(path)`, `garage61FetchAll_(basePath)`: HTTP client con paginazione
- `garage61MapSessionType_()`: mapping numerico → string
- `garage61SyncLaps_(options)`: core sync logic (lookup tracks/cars/drivers, fetch, dedup, write)
- `garage61DraftUnmappedCars_()`: auto-add cars sconosciute in modalità draft
- `garage61RunSync()`: **entry point per scheduled trigger** (chiamato ogni 4h)
- `handleLapsSyncFromGarage61(payload, ctx)`: HTTP handler usato da admin UI button

**`Notifications.js`** — Discord webhook notifications.
- Inviati su: race results import, championship standings updates
- Wrapped in inner try/catch per fault tolerance

#### Utilities

**`Lookups.js`** — `handleLookupsTracks`, `handleLookupsCars` (read-through cached)
**`SetupEnduranceParticipants.js`** — One-off setup tab EnduranceParticipants

### 4.2 Frontend (`src/`)

#### API layer

**`src/api/client.js`** — Public API namespace.
```js
api.auth.discordStart() / discordCallback(code, state)
api.roster.list(filters) / get(driverId)
api.laps.list(filters) / raceLaps(raceId) / syncFromGarage61()
api.races.list() / upcoming() / get(raceId) / updatePoster(payload)
api.raceResults.list(raceId) / import(payload)
api.championships.list() / importStandings(payload)
api.standings.byChampionship(championshipId)
api.reports.list(filters) / recent()
api.showcase.summary()
api.endurance.auditions.list/get/create/update(payload)
api.endurance.participants.list(auditionId) / add/update/remove(payload)
```

**`src/api/realApi.js`** — Dispatcher switch case + adapter functions (~600 righe).
- `realApi(action, payload, token)`: switch case sulle action
- Adapter per ogni action: pattern `postToBackend(action, payload, token)` con eventuale unwrap shape (`res.data.auditions` → `array`)

#### Hooks (TanStack Query, `src/hooks/`)

| Hook file | Hook exports |
|---|---|
| `useRoster.js` | `useDrivers(filters)`, `useDriver(driverId)` |
| `useLaps.js` | `useLaps`, `useMyRecentRaceResults`, `useRecentTeamRaceResults`, `useBestLaps` |
| `useRaces.js` | `useRaces`, `useUpcomingRaces`, `useRace`, `useUpdatePoster` |
| `useChampionships.js` | `useChampionships`, `useImportStandings` |
| `useStandings.js` | `useStandingsByChampionship` |
| `useReports.js` | `useReports`, `useRecentReports` |
| `useShowcase.js` | `useShowcaseSummary` |
| `useEndurance.js` | `useAuditions`, `useAudition`, `useCreateAudition`, `useUpdateAudition` |
| `useEnduranceParticipants.js` | `useParticipants(auditionId)`, `useAddParticipant`, `useUpdateParticipant`, `useRemoveParticipant` |
| `useLookups.js` | `useTracks`, `useCars` |

#### Pages (`src/pages/`)

**Pubbliche** (no auth):
- `Landing.jsx` — Mission Control (admin) o landing pubblica (anonymous). Activity feed live.
- `LandingPublic.jsx` — Marketing public con team showcase
- `Roster.jsx` — Lista pubblica piloti
- `PilotProfile.jsx` — Detail singolo pilota
- `RaceHub.jsx` — Calendario gare
- `RaceDetail.jsx` — Detail singola gara con results
- `BestLaps.jsx` — "Database Tempi" con tabs: Leaderboard / Race Laps / I miei tempi
- `Endurance.jsx` — Lista audizioni endurance
- `EnduranceDetail.jsx` — Detail audizione + lista partecipanti

**Auth-related**:
- `Login.jsx` (?) — Login page con button Discord
- `AuthCallback.jsx` — Handler `/auth/discord-callback?code=X&state=Y`

**Admin** (`role='admin'` o `staff`):
- `AdminEnduranceForm.jsx` — Create/edit audizione + gestione partecipanti
- `AdminRaceResultsImport.jsx` (`/admin/import-risultati`) — Upload JSON iRacing
- `AdminStandingsImport.jsx` (`/admin/import-standings`) — Upload championship standings
- `AdminSyncGarage61.jsx` (`/admin/sync-garage61`) — Manual trigger Garage61
- `AdminRacePosters.jsx` — Race poster upload
- `TeamDashboard.jsx` — Admin overview

#### Components (`src/components/`)

- `shared/SimBadge.jsx` — Badge sim (LMU/IRC/ACE) con varianti solid/outline
- `shared/CategoryPill.jsx` — Pill classe gara (Hypercar/LMP2/GT3/etc.)
- `shared/StatusBadge.jsx` — Status generic
- `layout/Sidebar.jsx`, `layout/Header.jsx`
- `forms/`, `cards/`, `feeds/`, ...

---

## 5. Stato Attuale e Prossimi Step

### 5.1 Completato e in produzione (al 5 giu 2026)

**Foundation (April–May 2026)**:
- ✅ Repo, build pipeline, deploy Vercel
- ✅ Mock API + real backend swap pattern
- ✅ Auth HMAC token + verify cycle
- ✅ Schema VSD_HUB_DB completo (tutti i tab principali)

**Wave 1-9** (May 2026):
- ✅ Roster, Best Laps, Race Hub, Race Reports, Championship Standings
- ✅ Race Results import + matching cascade
- ✅ Discord webhook notifications
- ✅ Garage61 sync (manual + auto trigger)

**Wave 10 Discord OAuth** (May–June 2026):
- ✅ Sub-wave 10.0: backfill 27 piloti con `discord_id`
- ✅ Sub-wave 10.1 part 1: classification logic
- ✅ Sub-wave 10.1 part 2: OAuth flow completo (start → callback → token)
- ✅ Frontend AuthCallback + client integration

**Lancio pubblico VSD Paddock** (4 giugno 2026):
- ✅ SEO completo (Italian meta, Open Graph, Twitter Card, sitemap, robots.txt)
- ✅ JoinUs flow 3-step con Google Form
- ✅ Discord server + Facebook page brand setup
- ✅ Migrazione repo da OneDrive a `Dev/` (fix `.git` file locking)

**Phase 1A-3 Endurance** (April–June 2026):
- ✅ Phase 1A: Auditions backend + frontend (CRUD admin)
- ✅ Phase 1B-1C: Stints, validation, computed fields
- ✅ Phase 2: target_race + countdown live in `/endurance/:id`
- ✅ **Phase 3 MVP** (5 giu 2026, anticipata): Participants CRUD admin + lista pubblica detail

**Sprint 0 stabilizzazione** (5 giu 2026, day-of):
- ✅ Phase 2 mergiata in main
- ✅ Fix bug Activity Feed (filtro difensivo `Landing.jsx`)
- ✅ Phase 3 MVP completata e mergiata in main
- ✅ Wave 10.1 part 2 OAuth: verificato già implementato
- ✅ Wave 10.5 VSD001 UI exclusion: no-op (backend già filtra `status='active'`)
- ✅ **Garage61 auto-sync trigger** ogni 4h (bonus Sprint 0)
- ✅ Cleanup git (branch ridondanti eliminati)
- ✅ Import race results gara GR86 Round 3 Summit Point del 4 giu

### 5.2 Prossimi step (in ordine di priorità)

**Sprint 0 — close-out** (next session, ~1.5-2h):
- ⏳ **Vitest setup + 5-10 smoke test** su calcoli critici (leaderboard ordering, scoring, dedup logic)

**Sprint 1 — Phase 3 estensione** (2 weeks, 6-8 sessions):
- ⏳ Stints CRUD completo (Participants già fatto, manca Stints management UI)
- ⏳ Scoring logic per audition results
- ⏳ AUTH_SECRET rotation (security best practice post-launch)

**Sprint 2 — Phase 4 Race Management Console MVP** (4-6 weeks, 12-16 sessions, target metà agosto 2026):
- ⏳ StintPlanner (modello dal LMU_Endurance_Planner Excel v1.4)
- ⏳ FuelPlan (consumo, range, soste)
- ⏳ TyrePlan (gomme, degrado, mescole)
- ⏳ EnergyPlan LMH hybrid
- ⏳ Strategy Sheet in-gara (vista live durante endurance race)

**Phase 5 — Live data** (post-Phase 4):
- ⏳ Apps Script polling Garage61 ogni 30s
- ⏳ Dashboard live race con strategy updates real-time

---

## 6. Problemi Aperti (Issue Tracker)

### 6.1 Bug attivi (priorità: 🔴 alta, 🟡 media, 🟢 bassa)

| ID | Bug | Priorità | Note |
|---|---|---|---|
| BUG-001 | Duplicato `lmu-spa-gp` nel sheet Tracks (warning React key duplicate) | 🟢 | Dedup manuale necessario |
| BUG-002 | Race laps non visibili sul paddock (Wave 9.8 non implementata) | 🟡 | Solo clean best laps importati da Garage61 |
| BUG-003 | Memoria Claude obsoleta in alcune sessioni | 🟢 | Workflow umano (re-check stato reale prima di lavorare) |

### 6.2 Debt tecnico

| ID | Issue | Priorità | Note |
|---|---|---|---|
| DEBT-001 | **Frontend dispatcher dual-layer** (`client.js` + `realApi.js`): ogni nuova action richiede 4 modifiche (Codice.js + realApi.js case + realApi.js adapter + client.js namespace). Fragile e error-prone | 🟡 | Considerare refactor a singolo dispatcher |
| DEBT-002 | **Apps Script deploy workflow manuale**: dopo ogni `clasp push`, serve "Distribuisci → Modifica → Nuova versione" nel cloud editor, poi `clearAllCaches()`. Dimenticabile, ha causato debug session multi-ora | 🟡 | Automatizzabile con clasp deploy script |
| DEBT-003 | **No test suite** | 🔴 | Sprint 0 task: Vitest setup |
| DEBT-004 | **AUTH_SECRET mai ruotato dal go-live** | 🟡 | Best practice security, da fare in Sprint 1 |
| DEBT-005 | **Race results import workflow è manuale** (JSON upload). Gare dimenticate restano in stato `scheduled` finché Demetrio non importa | 🟡 | Phase 5 potrebbe automatizzare via Garage61 API se espone race results |
| DEBT-006 | **TanStack Query cache aggressiva**: post-deploy backend, F5 a volte non basta. Workflow workaround: incognito o `localStorage.clear()` | 🟢 | Configurare staleTime per scenario o forzare invalidation post-deploy |
| DEBT-007 | **VSD001 service account semantics implicite**: escluso da UI via `status != 'active'` ma documentazione assente nel sheet. Nuovo admin potrebbe creare confusion | 🟢 | Aggiungere colonna `is_service` esplicita |

### 6.3 Limiti noti accettati

- Garage61 sync = solo clean best laps (limit upstream)
- Google Sheets backend: no transactions, eventual consistency
- Apps Script: timeout esecuzione 6 min per chiamata HTTP
- Discord OAuth redirect URI fixed (no dev/prod split senza configurazione extra Discord Developer Portal)
- Italian Sheets formulas: usare `;` non `,` come separator

### 6.4 Domande aperte per scelte future

- Migrazione a Supabase / Postgres? Pro: transactions, query power, real-time subscriptions. Contro: costo, perdita audit naturale di Sheets, refactor backend totale. **Decisione attuale: stay on Sheets fino Phase 4 (live data Garage61 polling). Rivalutare dopo.**
- Mobile app (PWA o native)? Per ora responsive web sufficiente.
- Integrazione con LMU Telemetry API quando disponibile.

---

## 7. Briefing per il Co-Sviluppatore (Gemini)

Ciao Gemini. Mi chiamo Claude e ho lavorato con Demetrio su VSD Paddock dalle fondamenta. Ti passo le consegne. Leggi tutto sopra prima di scrivere codice, poi torna qui per le note specifiche.

### 7.1 Stile di lavoro richiesto da Demetrio

Demetrio è solo developer di questo progetto, non junior. Si aspetta:

- **No preamboli, no conclusioni ovvie, no ceremonia.** Vai dritto al punto.
- **Sii critico costruttivamente.** Se vede un piano debole, dillo. Lui delega architettura ("mi fido di te", "fai tu") ma vuole giustificazioni.
- **Full-file replacements** preferiti a partial patches. Lui copia/incolla, non applica diff.
- **File scaricabili** preferiti a code blocks inline (oltre certa lunghezza).
- **PowerShell**, non bash. Lui è su Windows. Niente `&&` chained, usa `;` o linee separate.
- **Italiano in chat, inglese o italiano nei commenti codice** (mixed OK).
- **Senior tone**. Non spiegare basics di React o di Apps Script. Lui sa.

### 7.2 Aree critiche su cui focalizzarsi

🔴 **Security (priorità massima)**:
- `Security.js` + `discordAuth.js`: HMAC token generation/validation. Bug qui = bypass auth.
- `AUTH_SECRET` rotation pattern. Pending da fare. Read `Security.js` `rotateAuthSecret()` se esiste.
- Discord OAuth callback: verificare CSRF state validation in `handleDiscordCallback` non sia bypassabile.
- Sanitization in `sanitizeDriver(d, 'public'|'private')`: assicurare che payload pubblici non leakino `discord_id`, `iracing_account`, `email`.
- Apps Script Script Properties: lista in `apps-script/discordAuth.js`. Mai loggare.

🟡 **Code quality**:
- **Dispatcher dual-layer fragility** (DEBT-001): ogni nuova action richiede 4 modifiche. Lì succedono bug ("Action non instradata" su frontend layer). Possibile refactor: single dispatcher con auto-discovery.
- **Cache invalidation post-mutation in TanStack Query**: alcuni hook fanno invalidate corretto, altri no. Audit consigliato.
- **Apps Script deployment idempotency**: ogni `clasp push` richiede manual Nuova versione + clearAllCaches. Scriptable.

🟢 **Performance**:
- `getCachedSheetData_(sheetName, ttl)` in Apps Script — pattern usato bene, mantenere.
- Frontend: bundle size, considerare code splitting per admin routes.
- Database Sheets: reads sono O(n). Per Phase 4-5, considerare denormalizzazione strategica (es. cache calcoli leaderboard in tab dedicata).

### 7.3 Cose che NON devi cambiare senza discutere con Demetrio

- **Brand tokens colori/fonts** (sezione §2.5). Sono fissati con il branding del team.
- **Convenzioni naming** (sezione §3.3). Sono già consistenti su tutto il codebase, refactor che le rompe = caos.
- **Schema sheet** (sezione §3.2). Aggiungere colonne OK, rinominare/rimuovere = breaking change per Demetrio che editi a mano i dati.
- **Pattern handler `handle{Domain}{Action}`** + action format `'domain.method'`. Cambiare = rewrite dispatcher.
- **Italian display strings**. UI è in italiano. Non tradurre stringhe verso inglese senza chiedere.
- **`VSD001` service account**: lascia stare come è, è già coperto da backend filter `status != 'active'`.

### 7.4 Cose dove sei libero/incoraggiato a proporre miglioramenti

- Test coverage (Vitest setup in arrivo, contribuisci scrivendo test su moduli che ti sembrano fragili)
- Refactor dispatcher dual-layer (con piano graduale + backwards compat)
- Documentation jsdoc su funzioni esposte
- Error handling pattern uniformi (ora c'è mix di `ok/fail` helpers e raw return)
- Race condition mitigation in mutation Apps Script (es. CAS pattern per status updates)

### 7.5 Workflow consigliato per ogni task

1. **Read context**: rileggi questo doc + memorie sessione precedente Demetrio ti darà
2. **Check stato reale**: la memoria può essere obsoleta. Verifica nel codebase prima di scrivere
3. **Branch separato** per ogni feature: `wave-X.X-descrizione` o `fix-Y-descrizione`
4. **Backend changes**: `clasp push` → manual Nuova versione in cloud editor → `clearAllCaches()` → test
5. **Frontend changes**: dev server auto-reload, ma TanStack Query cache aggressive: usa incognito per test post-backend change
6. **Commit messages**: convention `tipo(scope): descrizione`. Tipi usati: `feat`, `fix`, `docs`, `refactor`, `revert`. Es. `feat(endurance): Phase 3 MVP - participants CRUD`

### 7.6 Risorse esterne utili

- Apps Script docs V8: https://developers.google.com/apps-script
- TanStack Query v5: https://tanstack.com/query/latest
- Discord API v10: https://discord.com/developers/docs
- Garage61 API: docs interni (chiedi a Demetrio se servono)
- iRacing JSON export schema: chiedi a Demetrio campione file

### 7.7 Closing note

Demetrio non sta scrivendo codice come hobby. Questo è un progetto pubblico che lui sta lanciando come servizio gratuito alla community sim racing italiana. Il team conta 28 piloti veri, gareggiano davvero, e Demetrio è il loro Team Principal. Tratta il codice di conseguenza: production-grade, sicuro, manutenibile.

Buon lavoro. — Claude.

---

## Appendice A: ID e Risorse esterne (per reference)

| Risorsa | ID / URL |
|---|---|
| GitHub repo | https://github.com/crucittidemetrio/vsd-paddock |
| Vercel deploy | https://vsd-paddock.vercel.app |
| VSD_HUB_DB Spreadsheet | `1ADUq7CRy0_PtPqbPYS42iCNgpdxZrNlSMY3HX6T8XQA` |
| Apps Script Project | `1IbLOiw4tiljIN8s8dG8g-RedIyf9QV_wL9JWtzXCJ0-FUCQ5wTu5ryza` |
| Discord Developer App | Client ID: `1508540322173685870` (app "VSD Paddock") |
| Discord Invite | https://discord.gg/gs5rR3DQay |
| Facebook page | Virtual Sim-Driver |
| Demetrio email | demetrio.crucitti@gasparoli.it |
| Team service email | v.sim.driver@gmail.com |

---

## Appendice B: Comandi di sviluppo frequenti

```powershell
# Setup ambiente
cd C:\Users\Demetrio\Dev\vsd-paddock
npm install
npm run dev                     # frontend dev server su :5173

# Backend deploy ciclo
cd apps-script
clasp push                      # push file modificati al cloud Apps Script
# → poi manual: editor web → Distribuisci → Modifica → Nuova versione
# → poi manual: esegui clearAllCaches()

# Git workflow standard
git checkout -b wave-X.X-descrizione
# ... modifiche ...
git add <files>
git commit -m "feat(scope): descrizione"
git push -u origin wave-X.X-descrizione
# ... merge in main quando ready ...
git checkout main
git merge wave-X.X-descrizione
git push origin main
git branch -d wave-X.X-descrizione
git push origin --delete wave-X.X-descrizione

# Diagnostica rapida codebase
Get-ChildItem -Path src -Filter "*.jsx" -Recurse | Select-String "PATTERN" -SimpleMatch
Select-String -Path apps-script\*.js -Pattern "PATTERN" -Context 0,5
```

---

*Documento generato da Claude per onboarding co-sviluppatore Gemini sul progetto VSD Paddock. 5 giugno 2026.*
