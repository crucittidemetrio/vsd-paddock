-- ═══════════════════════════════════════════════════════════
-- VSD-Paddock Cloud — Dominio Best Laps: cars, tracks, best_laps
-- ═══════════════════════════════════════════════════════════
-- Porting di apps-script/BestLaps.js, apps-script/Lookups.js e
-- apps-script/Records.js — SOLO la parte "manuale + muro dei
-- record". Letto dal sorgente reale, non a memoria. Scope
-- deliberatamente ridotto, stesso principio già applicato a
-- races.* nel dominio Calendario (008): quello che dipende da
-- domini non ancora portati resta fuori, documentato qui invece
-- di essere abbozzato a metà.
--
-- IN QUESTA MIGRAZIONE:
--   laps.list         → best-laps-list
--   laps.leaderboard  → best-laps-leaderboard
--   laps.add/update/remove → best-laps-add/update/remove (staff only)
--   lookups.cars/tracks     → lookups-cars/lookups-tracks
--   records.team            → records-team (Muro dei Record)
--
-- DELIBERATAMENTE FUORI (dipendenze non ancora portate):
--   laps.raceLaps      → dipende da race_results + races (dominio
--                         Calendario/Risultati, non ancora portato)
--   lapSubmissions.*   → dipende da Vercel Blob (upload foto prova),
--                         un'integrazione esterna separata dal solo
--                         porting DB — richiede la sua fase dedicata
--   academy.ranking    → dipende da race_results (grosso, importato
--                         da parsing risultati gara) + incident_
--                         resolutions (Fase 2 penalità) — porting
--                         di gran lunga più corposo di "Best Laps",
--                         merita una fase a sé, non un'aggiunta
--                         affrettata qui. Vedi task #245 (nota).
--
-- Cars/Tracks sono cataloghi GLOBALI (non team-scoped): lo stesso
-- circuito/auto esiste identico per ogni team sullo stesso sim,
-- non ha senso duplicarli per tenant — a differenza di drivers/
-- team_sessions/best_laps che sono dati specifici del team.
-- ═══════════════════════════════════════════════════════════

-- ─── CARS (catalogo globale, sola lettura per authenticated) ───
create table cars (
  id            uuid primary key default gen_random_uuid(),
  car_id        text not null unique,      -- codice business (es. dal foglio Cars)
  sim           text not null,             -- 'LMU' | 'IRC' | 'ACE'
  car_name      text not null,
  full_name     text,                      -- nome esteso, usato per il match con car_external_name (Garage61/import gara)
  race_class    text,                      -- classe (GT3/Hypercar/...) — null = "non classificato" nel Muro dei Record
  garage61_id   text,
  active        boolean not null default true
);

comment on table cars is 'Catalogo auto per sim. Globale, non team-scoped — stesso identico catalogo per ogni team. Scritto solo da admin/service role, nessun endpoint di scrittura esposto (stesso comportamento del sistema reale: Lookups.js espone solo lettura).';

-- ─── TRACKS (catalogo globale, sola lettura per authenticated) ───
create table tracks (
  id            uuid primary key default gen_random_uuid(),
  track_id      text not null unique,
  sim           text not null,
  track_name    text not null,
  active        boolean not null default true
);

comment on table tracks is 'Catalogo circuiti per sim. Globale, stesso principio di cars.';

-- ─── BEST_LAPS (team-scoped) ───
-- track_id/car_id restano TEXT liberi (non FK verso tracks/cars):
-- fedeltà al sistema reale, dove il match car_external_name→car_id
-- è best-effort a runtime e può non trovare corrispondenza
-- (car_id vuoto/"NO_MATCH" è un caso normale, non un errore) — una
-- FK stretta romperebbe quel comportamento.
create table best_laps (
  id                uuid primary key default gen_random_uuid(),
  team_id           uuid not null references teams(id) on delete cascade,
  driver_id         uuid not null references drivers(id) on delete cascade,

  sim               text not null,
  track_id          text not null,
  car_id            text not null,

  lap_time_ms       integer not null,
  lap_time_display  text not null,
  set_date          date,
  conditions        text not null default 'dry',
  air_temp_c        numeric,
  track_temp_c      numeric,
  session_type      text not null default 'practice',
  setup_shared      boolean not null default false,
  setup_link        text,
  replay_url        text,

  verified_by       uuid references drivers(id) on delete set null,
  verified_at       timestamptz,
  notes             text,
  created_at        timestamptz not null default now(),

  garage61_lap_id   text  -- riservato per un futuro sync Garage61, non alimentato in questa fase
);

comment on table best_laps is 'Tempi giro manuali (+ futuro import Garage61). Porting di BestLaps.js — solo laps.list/leaderboard/add/update/remove, non laps.raceLaps né lapSubmissions.*.';

-- ─── RLS ───

alter table cars enable row level security;
alter table tracks enable row level security;
alter table best_laps enable row level security;

-- cars/tracks: chiunque autenticato legge, di QUALSIASI team — sono
-- un catalogo condiviso, non c'è team_id da filtrare.
create policy "cars: lettura per chiunque autenticato"
  on cars for select
  using (auth.role() = 'authenticated');

create policy "tracks: lettura per chiunque autenticato"
  on tracks for select
  using (auth.role() = 'authenticated');

-- best_laps: SELECT chiunque nel team (laps.list/leaderboard non
-- richiedono staff nel sistema reale).
create policy "best_laps: il team legge tutti i tempi"
  on best_laps for select
  using (team_id = current_driver_team_id());

-- INSERT/UPDATE/DELETE: solo staff/admin (laps.add/update/remove
-- richiedono ctx.isStaff nel sistema reale — nessuna eccezione per
-- l'autore, a differenza di team_sessions).
create policy "best_laps: solo staff/admin inseriscono"
  on best_laps for insert
  with check (team_id = current_driver_team_id() and current_driver_is_staff_or_admin());

create policy "best_laps: solo staff/admin aggiornano"
  on best_laps for update
  using (team_id = current_driver_team_id() and current_driver_is_staff_or_admin())
  with check (team_id = current_driver_team_id() and current_driver_is_staff_or_admin());

create policy "best_laps: solo staff/admin cancellano"
  on best_laps for delete
  using (team_id = current_driver_team_id() and current_driver_is_staff_or_admin());

-- ─── Privilegi minimi ───

revoke all on cars from anon;
revoke all on tracks from anon;
revoke all on best_laps from anon;

revoke all on cars from authenticated;
grant select on cars to authenticated;

revoke all on tracks from authenticated;
grant select on tracks to authenticated;

revoke all on best_laps from authenticated;
grant select, insert, update, delete on best_laps to authenticated;
