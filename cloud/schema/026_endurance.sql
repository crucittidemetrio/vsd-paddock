-- ═══════════════════════════════════════════════════════════
-- VSD-Paddock Cloud — #259: Endurance (Auditions + Participants
-- + Stints) — schema
-- ═══════════════════════════════════════════════════════════
-- Porting fedele di:
--   apps-script/Endurance.js             → endurance_auditions
--   apps-script/EnduranceParticipants.js → endurance_participants
--   apps-script/EnduranceStints.js       → endurance_stints
--
-- NOTA SCOPE: il tab "EnduranceAuditionStints" (risultati di
-- un'audizione: best_lap_ms/incidenti/dns/dnf per pilota) creato da
-- SetupEndurance.js NON ha alcun handler vivo: in Codice.js la
-- costante SHEETS.ENDURANCE_AUDITION_STINTS è commentata con la nota
-- esplicita "rimossa (audit ago 2026): mai referenziata [...] Feature
-- abbandonata, mai completata. Tab reale ancora presente sullo
-- sheet ma nessuna action la usa". Fuori scope qui: non esiste nulla
-- da portare (nessuna action registrata, nessun handler in nessun
-- file apps-script/). "Stints" in questo dominio = EnduranceStints.js
-- (stint pianificati per le gare vere, es. Le Mans 24h), l'unico dei
-- due sistemi "stint" endurance realmente in uso.
--
-- Modello di autorizzazione (fedele al sorgente, verificato leggendo
-- ogni handler, non solo i commenti — vedi note sotto sui gap tra
-- commento e codice):
--   endurance.auditions.list/get   → pubblico, ctx.isStaff reale
--                                     (anonymous vede solo status
--                                     != draft, notes_internal mai
--                                     pubblico) — check funzionante,
--                                     ctx.isStaff è un valore reale.
--   endurance.auditions.create/update → ctx.isStaff (staff/admin).
--   endurance.participants.list    → NESSUN controllo nel codice
--                                     (nemmeno un `if (!ctx)`): in
--                                     Codice.js doPost ctx non è MAI
--                                     null (fallback a un oggetto
--                                     anonymous), quindi è
--                                     realisticamente pubblico quanto
--                                     auditions.list — portato come
--                                     tale (team_slug + service role).
--   endurance.participants.add/update/remove → _epIsAdmin_(ctx):
--                                     role==='admin' o tier==='admin'
--                                     — SOLO admin, non staff-or-admin
--                                     nonostante il commento header
--                                     dica "admin/staff only" (stesso
--                                     pattern già visto in
--                                     Treasury/Consent.adminList).
--   endurance.stints.list          → `if (!ctx) return fail(...)`:
--                                     in Apps Script questo check è
--                                     di fatto sempre vero (ctx non è
--                                     mai null), quindi NON blocca
--                                     davvero nessuno lì — ma qui
--                                     Supabase verify_jwt=true offre
--                                     un gate reale che il sorgente
--                                     non ha mai avuto: portato come
--                                     "richiede sessione valida,
--                                     qualunque ruolo", l'intento più
--                                     vicino al commento originale
--                                     ("Auth: richiesta"), non il
--                                     comportamento di fatto (nessun
--                                     gate) del sistema live.
--   endurance.stints.add/update/remove/generate/validateCoverage/
--   confirmPlan → _esIsStaff_(ctx): stesso pattern di _epIsAdmin_,
--                                     controlla SOLO role==='admin'
--                                     (nome fuorviante, il commento
--                                     dice "admin/staff only" ma il
--                                     codice è admin-only) — portato
--                                     fedele al codice.
-- ═══════════════════════════════════════════════════════════

-- ─── endurance_auditions ───
-- ID testuale nativo (non uuid): referenziato come FK da
-- endurance_participants, stesso principio già usato per
-- championship_key/race_id altrove quando l'id del sorgente è una
-- chiave di business stabile piuttosto che un id opaco locale.
-- Generato dall'Edge Function come 'aud_' + primi 8 caratteri hex di
-- un uuid, identico al sorgente (Utilities.getUuid().substring(0,8)).
--
-- date/target_race_date sono timestamptz qui (il sorgente le tratta
-- sempre come stringhe ISO datetime nei payload reali, target_race_
-- date ha perfino una validazione esplicita new Date(...) in
-- validateAuditionPayload_) — leggermente più severo del sorgente
-- (che su `date` valida solo la presenza, non il formato), ma
-- coerente con la convenzione usata in tutto il resto del porting per
-- campi equivalenti. start_time_ingame/end_time_ingame restano text:
-- sono orari "HH:MM" nel clock di gioco, aritmetica mod 24h
-- (computeEndTimeIngame_), MAI una data — un campo time/timestamptz
-- sarebbe semanticamente sbagliato.
--
-- Sanitizzazione per livello (sanitizeAudition_: 'private' vs
-- 'public', notes_internal esclusa dal pubblico) e filtro status !=
-- draft per anonymous sono fatti in codice nell'Edge Function
-- (service role), non in RLS — stesso principio già stabilito per
-- clash_participants/championship_interest: RLS qui sotto è solo una
-- barriera per accessi diretti via REST con chiave anon/authenticated.
create table endurance_auditions (
  audition_id             text primary key,
  team_id                 uuid not null references teams(id) on delete cascade,

  target_race             text,
  target_race_date        timestamptz,
  name                    text not null,
  date                    timestamptz not null,
  sim                     text not null,
  track_id                text,
  pilot_class             text check (pilot_class is null or pilot_class in ('Hypercar', 'LMP2', 'GT3', 'Open')),
  mandatory_car_id        text,
  setup_url               text,
  setup_notes             text,
  duration_minutes_real   numeric,
  time_multiplier         numeric,
  duration_minutes_ingame numeric,
  start_time_ingame       text,
  end_time_ingame         text,
  ai_strength_pct         numeric,
  field_size_hypercar     numeric,
  field_size_lmp2         numeric,
  field_size_gt3          numeric,
  weather_condition       text check (weather_condition is null or weather_condition in ('asciutto', 'dinamico', 'bagnato')),
  status                  text not null default 'draft' check (status in ('draft', 'scheduled', 'in_progress', 'completed', 'cancelled')),
  created_by              uuid references drivers(id) on delete set null,
  created_at              timestamptz not null default now(),
  notes_internal          text
);

comment on table endurance_auditions is 'Porting fedele di Endurance.js (Phase 1A + 2). Auth reale: list/get pubblici con masking per-livello e filtro draft fatti in codice (Edge Function service role), create/update staff/admin.';

create index endurance_auditions_team_status_idx on endurance_auditions (team_id, status, date desc);

-- ─── endurance_participants ───
-- audition_id/driver_id sono vere FK qui: il sorgente verifica
-- l'esistenza con scansioni manuali (_epAuditionExists_/
-- _epDriverExists_) prima di ogni insert — stesso principio già
-- applicato altrove (consents: upsert via constraint invece di
-- scansione manuale) di sostituire un controllo applicativo con un
-- vincolo DB nativo equivalente, non un comportamento nuovo.
-- unique(audition_id, driver_id) sostituisce allo stesso modo il
-- controllo manuale _epFindByAuditionAndDriver_ (rifiuta i duplicati,
-- mai upsert — fedele).
create table endurance_participants (
  participation_id text primary key,
  team_id          uuid not null references teams(id) on delete cascade,

  audition_id      text not null references endurance_auditions(audition_id) on delete cascade,
  driver_id        uuid not null references drivers(id) on delete cascade,
  status           text not null default 'registered' check (status in ('registered', 'accepted', 'reserve', 'rejected', 'withdrawn')),
  added_at         timestamptz not null default now(),
  added_by         uuid references drivers(id) on delete set null,
  notes            text,

  unique (audition_id, driver_id)
);

comment on table endurance_participants is 'Porting fedele di EnduranceParticipants.js. list non ha alcun gate nel sorgente (nemmeno "auth richiesto") — portato come pubblico (team_slug + service role), stesso principio di endurance_auditions.list. add/update/remove: SOLO admin (_epIsAdmin_), non staff-or-admin.';

create index endurance_participants_team_audition_idx on endurance_participants (team_id, audition_id);

-- ─── endurance_stints ───
-- Stint pianificati per le GARE VERE (Le Mans 24h ecc.), distinti
-- dagli stint di un'audizione (fuori scope, vedi nota sopra). Nessuna
-- FK su race_id verso races: il sorgente non ha alcun vincolo
-- referenziale qui (stessa libertà già presa in fuel_log/lap_data —
-- il piano stint può esistere per una gara non ancora nel calendario
-- strutturato). planned_*/actual_* restano text: il sorgente li
-- accetta come stringa libera dal payload (mai un tipo Date reale né
-- una validazione di formato rigorosa, solo un best-effort new
-- Date(...) in _esValidateStint_ che non blocca se non parsabile) —
-- stessa scelta già fatta per lap_data.source_timestamp.
--
-- pit_stop_at_end: boolean nativo invece della stringa 'TRUE'/'FALSE'
-- del sorgente (stessa normalizzazione già fatta per in_pits/
-- yellow_flag/is_vsd_driver altrove).
--
-- stint_id: 'stint_' + 8 char hex, generato con crypto.randomUUID()
-- nell'Edge Function invece del digest MD5 del sorgente
-- (_esGenerateStintId_, Utilities.computeDigest(MD5, ...)) — Deno Web
-- Crypto non espone MD5 (algoritmo deprecato, non nello standard
-- SubtleCrypto). Deviazione innocua: l'id serve solo come
-- identificatore casuale univoco, non per alcuna proprietà
-- crittografica, e il formato risultante è identico.
--
-- unique(team_id, race_id, car_number, stint_order) riflette
-- l'invariante REALE mantenuto da _esShiftStintsOrder_ (scoped su
-- car_number per supportare più equipaggi sulla stessa gara), non il
-- "design point B: UNIQUE (race_id, stint_order)" nel commento header
-- del sorgente — quella nota è precedente all'introduzione del
-- multi-equipaggio ed è superata dal codice reale, stesso principio
-- già visto per il commento "20 colonne" (in realtà 21 campi).
create table endurance_stints (
  stint_id              text primary key,
  team_id               uuid not null references teams(id) on delete cascade,

  race_id               text not null,
  car_number            text not null,
  driver_id             uuid references drivers(id) on delete set null,
  stint_order           integer not null check (stint_order >= 1),
  planned_start_time    text,
  planned_end_time      text,
  planned_duration_min  numeric,
  actual_start_time     text,
  actual_end_time       text,
  actual_duration_min   numeric,
  tire_compound         text check (tire_compound is null or tire_compound in ('soft', 'medium', 'hard', 'wet', 'intermediate')),
  pit_stop_at_end       boolean not null default false,
  fuel_loaded_l         numeric,
  actual_laps           numeric,
  best_lap_ms           integer,
  status                text not null default 'planned' check (status in ('planned', 'active', 'completed', 'aborted')),
  notes                 text,
  created_at            timestamptz not null default now(),
  created_by            uuid references drivers(id) on delete set null,
  updated_at            timestamptz not null default now(),

  unique (team_id, race_id, car_number, stint_order)
);

comment on table endurance_stints is 'Porting fedele di EnduranceStints.js. list richiede sessione valida (qualunque ruolo) — verify_jwt=true offre qui un gate reale che il sorgente non aveva mai avuto davvero (il suo if(!ctx) non scatta mai in produzione). add/update/remove/generate/validateCoverage/confirmPlan: SOLO admin (_esIsStaff_ nonostante il nome, controlla role===admin).';

create index endurance_stints_team_race_car_idx on endurance_stints (team_id, race_id, car_number, stint_order);

-- ─── RLS ───

alter table endurance_auditions enable row level security;
alter table endurance_participants enable row level security;
alter table endurance_stints enable row level security;

-- endurance_auditions: barriera per accessi diretti — il percorso
-- pubblico reale (list/get, anche anonimo) passa dall'Edge Function
-- con client service role, che applica masking/filtro draft in
-- codice. Qui sotto solo il team può leggere via REST diretto;
-- scrittura staff/admin.
create policy "endurance_auditions: il team legge"
  on endurance_auditions for select
  using (team_id = current_driver_team_id());

create policy "endurance_auditions: staff/admin scrivono"
  on endurance_auditions for insert
  with check (team_id = current_driver_team_id() and current_driver_is_staff_or_admin());

create policy "endurance_auditions: staff/admin aggiornano"
  on endurance_auditions for update
  using (team_id = current_driver_team_id() and current_driver_is_staff_or_admin())
  with check (team_id = current_driver_team_id() and current_driver_is_staff_or_admin());

-- endurance_participants: stessa barriera (percorso pubblico reale
-- via Edge Function service role per list). Scrittura SOLO admin.
create policy "endurance_participants: il team legge"
  on endurance_participants for select
  using (team_id = current_driver_team_id());

create policy "endurance_participants: solo admin scrivono"
  on endurance_participants for insert
  with check (team_id = current_driver_team_id() and current_driver_is_admin());

create policy "endurance_participants: solo admin aggiornano"
  on endurance_participants for update
  using (team_id = current_driver_team_id() and current_driver_is_admin())
  with check (team_id = current_driver_team_id() and current_driver_is_admin());

create policy "endurance_participants: solo admin cancellano"
  on endurance_participants for delete
  using (team_id = current_driver_team_id() and current_driver_is_admin());

-- endurance_stints: lettura qualunque membro autenticato del team,
-- scrittura SOLO admin.
create policy "endurance_stints: il team legge"
  on endurance_stints for select
  using (team_id = current_driver_team_id());

create policy "endurance_stints: solo admin scrivono"
  on endurance_stints for insert
  with check (team_id = current_driver_team_id() and current_driver_is_admin());

create policy "endurance_stints: solo admin aggiornano"
  on endurance_stints for update
  using (team_id = current_driver_team_id() and current_driver_is_admin())
  with check (team_id = current_driver_team_id() and current_driver_is_admin());

create policy "endurance_stints: solo admin cancellano"
  on endurance_stints for delete
  using (team_id = current_driver_team_id() and current_driver_is_admin());

-- ─── Privilegi minimi ───

revoke all on endurance_auditions from anon;
revoke all on endurance_auditions from authenticated;
grant select, insert, update on endurance_auditions to authenticated;

revoke all on endurance_participants from anon;
revoke all on endurance_participants from authenticated;
grant select, insert, update, delete on endurance_participants to authenticated;

revoke all on endurance_stints from anon;
revoke all on endurance_stints from authenticated;
grant select, insert, update, delete on endurance_stints to authenticated;
