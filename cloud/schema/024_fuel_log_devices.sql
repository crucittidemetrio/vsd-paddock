-- ═══════════════════════════════════════════════════════════
-- VSD-Paddock Cloud — #257: Fuel/Energy + Devices (schema)
-- ═══════════════════════════════════════════════════════════
-- Porting fedele di apps-script/FuelLog.js (fuel_log, fuel_live_pings)
-- e apps-script/Devices.js (nessuna tabella — vedi sotto).
--
-- fuel_log: un campione di consumo per giro, scritto dal companion app
-- (script Python che legge la shared memory di Le Mans Ultimate) via
-- fuel.logSample. Stessi campi del foglio FuelLog reale, incluse le
-- colonne aggiunte in Wave (setupFuelLogTelemetryColumns/
-- setupFuelLogStintColumns): track_name/vehicle_name/speed_*
-- auto-rilevati, lap_time_s/sector*_s dal buffer Scoring,
-- in_pits/yellow_flag/num_pitstops/driver_name per stint e "giro
-- pulito". Nessuna FK su race_id verso races.race_id: il sorgente non
-- ha alcun vincolo referenziale (il companion in modalità solo usa un
-- race_id locale generato al volo, non necessariamente una gara di
-- calendario) — stessa libertà preservata qui.
--
-- fuel_live_pings: sostituisce lo Script Properties key-value del
-- sorgente (fuel.logLive) — Postgres non ha un equivalente diretto di
-- una proprietà scriptwide effimera, quindi un ping "in tempo reale" è
-- modellato come una riga upsert per (team_id, race_id, car_number),
-- con la stessa soglia di freschezza (FUEL_LIVE_MAX_AGE_MS, 2 minuti)
-- applicata a lettura invece che a scrittura. Deviazione necessaria
-- (non presente nel sorgente, che non ha concetto di tabella qui) ma
-- comportamento identico: un ping vecchio più di 2 minuti viene
-- ignorato silenziosamente da fuel.summary, esattamente come readFuelLive_.
--
-- Devices.js NON ha bisogno di una tabella: come nel sorgente (che
-- riusa lo schema HMAC stateless di generateTokenWithClassification_),
-- il device token del companion è un token firmato HMAC-SHA256 con un
-- secret di Edge Function (DEVICE_TOKEN_SECRET, da configurare) — payload
-- "driver_id|team_id|expiresAtMs" + firma, nessun lookup su tabella,
-- nessuna revoca individuale possibile (stessa limitazione accettata
-- nel sorgente: "rigenerabile in qualsiasi momento", i token vecchi
-- restano validi fino a naturale scadenza). team_id è nel payload in
-- più rispetto al sorgente (single-tenant lì, multi-tenant qui);
-- tier/sims del sorgente sono omessi perché nessun handler fuel.*
-- portato li legge mai.
--
-- Le Edge Function fuel-* operano con un client SERVICE ROLE (non
-- anon+JWT) perché un chiamante autenticato via device token non ha
-- MAI una sessione Supabase reale (nessun auth.uid() disponibile) —
-- stesso principio già stabilito per gli endpoint pubblici di Clash of
-- Classes/ChampionshipInterest: l'autorizzazione vera è nel codice del
-- handler (resolveDriver, verifica firma HMAC o sessione Supabase), la
-- RLS sotto resta solo come barriera per accessi diretti via REST con
-- chiave anon/authenticated.
-- ═══════════════════════════════════════════════════════════

create table fuel_log (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  race_id text not null,
  car_number text not null,
  driver_id uuid references drivers(id) on delete set null,
  lap_number integer not null,
  fuel_remaining_l numeric not null,
  fuel_capacity_l numeric,
  virtual_energy_pct numeric,
  track_name text,
  vehicle_name text,
  speed_min_kmh numeric,
  speed_max_kmh numeric,
  speed_avg_kmh numeric,
  lap_time_s numeric,
  sector1_s numeric,
  sector2_s numeric,
  sector3_s numeric,
  in_pits boolean not null default false,
  yellow_flag boolean not null default false,
  num_pitstops integer,
  driver_name text,
  source text not null default 'telemetry',
  created_at timestamptz not null default now()
);

create index fuel_log_team_race_car_lap_idx on fuel_log (team_id, race_id, car_number, lap_number);
create index fuel_log_team_driver_created_idx on fuel_log (team_id, driver_id, created_at desc);

alter table fuel_log enable row level security;

create policy fuel_log_select_team on fuel_log
  for select
  using (team_id = current_driver_team_id());

create policy fuel_log_insert_self on fuel_log
  for insert
  with check (team_id = current_driver_team_id() and driver_id = current_driver_id());

revoke all on fuel_log from anon;
grant select, insert on fuel_log to authenticated;

create table fuel_live_pings (
  team_id uuid not null references teams(id) on delete cascade,
  race_id text not null,
  car_number text not null,
  driver_id uuid references drivers(id) on delete set null,
  lap_number integer,
  fuel_remaining_l numeric not null,
  virtual_energy_pct numeric,
  track_name text,
  vehicle_name text,
  speed_kmh numeric,
  ts timestamptz not null default now(),
  primary key (team_id, race_id, car_number)
);

alter table fuel_live_pings enable row level security;

create policy fuel_live_pings_select_team on fuel_live_pings
  for select
  using (team_id = current_driver_team_id());

revoke all on fuel_live_pings from anon;
grant select on fuel_live_pings to authenticated;
-- Nessun grant insert/update per authenticated: gli upsert dei ping
-- live passano SEMPRE dal client service-role dentro fuel-log-live
-- (anche quando il chiamante ha una sessione Supabase normale), per
-- restare coerenti con l'unico altro punto di scrittura (fuel-log-sample)
-- che deve comunque supportare i device token stateless.
