-- ═══════════════════════════════════════════════════════════
-- VSD-Paddock Cloud — #258: LapData / Analisi di Passo (schema)
-- ═══════════════════════════════════════════════════════════
-- Porting fedele di apps-script/LapData.js (tab LapData → lap_data).
-- Import CSV per-giro generato dal plugin SimHub, upload manuale a
-- fine sessione (stesso gesto di raceResults.import) — sola scrittura
-- (append + dedup), nessun update/delete esposto, fedele al sorgente.
--
-- Niente colonna "valid"/LapStatus a 6 stati: la shared memory nativa
-- LMU non espone un'invalidazione giro per taglio pista, quindi il
-- sorgente usa in_pits + yellow_flag (stessa convenzione già in
-- produzione in fuel_log/isCleanLap_) — preservato identico qui.
--
-- Settori/velocità sono nullable: CSV più vecchi generati prima
-- dell'aggiornamento del plugin (13 set 2026) non li hanno.
--
-- Deviazione: id è un uuid nativo invece del `LAP-timestamp-idx`
-- testuale del sorgente (stesso principio già applicato a
-- race_crews.id) — l'id non viene mai referenziato altrove.
-- source_timestamp resta testo libero (non timestamptz): il sorgente
-- non valida né parsa questo campo, lo salva così com'è dal CSV.
--
-- Dedup (session_id, driver_key, lap_number) NON è un vincolo DB: è
-- fedelmente replicato nell'Edge Function lap-data-import come nel
-- sorgente (Set costruito leggendo le righe esistenti), non un unique
-- constraint, perché driver_key è condizionale (driver_id se
-- riconosciuto, altrimenti driver_name_external lowercase) e Postgres
-- non esprime bene quella condizionalità in un indice unico pulito.
-- ═══════════════════════════════════════════════════════════

create table lap_data (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  session_id text not null,
  driver_id uuid references drivers(id) on delete set null,
  driver_name_external text,
  is_vsd_driver boolean not null default false,
  sim text,
  lap_number integer not null,
  lap_time_ms integer,
  sector1_ms integer,
  sector2_ms integer,
  sector3_ms integer,
  speed_min_kmh numeric,
  speed_max_kmh numeric,
  speed_avg_kmh numeric,
  in_pits boolean not null default false,
  yellow_flag boolean not null default false,
  track_temp_c numeric,
  air_temp_c numeric,
  fuel_l numeric,
  source_timestamp text,
  imported_at timestamptz not null default now()
);

create index lap_data_team_session_lap_idx on lap_data (team_id, session_id, lap_number);
create index lap_data_team_session_driver_idx on lap_data (team_id, session_id, driver_id);

alter table lap_data enable row level security;

-- Lettura: qualsiasi pilota autenticato del team (lapData.sessions/
-- lapData.session nel sorgente richiedono solo "Auth: richiesta",
-- nessuna restrizione di ruolo).
create policy lap_data_select_team on lap_data
  for select
  using (team_id = current_driver_team_id());

-- Scrittura: solo staff/admin (lapData.import gated su ctx.isStaff).
create policy lap_data_insert_staff on lap_data
  for insert
  with check (team_id = current_driver_team_id() and current_driver_is_staff_or_admin());

revoke all on lap_data from anon;
grant select, insert on lap_data to authenticated;
