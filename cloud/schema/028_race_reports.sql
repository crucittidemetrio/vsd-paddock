-- ═══════════════════════════════════════════════════════════
-- VSD-Paddock Cloud — Fase 6, dominio #261: Race Reports +
-- Reazioni emoji + aggregatori (landing.data, Showcase)
-- Porting fedele di apps-script/Reports.js + Showcase.js +
-- LandingData.js + seedReports.js.
-- ═══════════════════════════════════════════════════════════

-- ─── RaceReports ───
-- PRIVACY MODEL (aggiornato 20/08/2026 nel sorgente): visibili a TUTTI
-- i tesserati loggati del team, non solo all'autore — prerequisito per
-- le reazioni tra piloti. staff_rating/staff_notes restano nel record
-- ma la UI li mostra solo a staff/admin (stesso principio "il backend
-- restituisce sempre, il frontend decide chi vede" già usato altrove).
create table race_reports (
  report_id         uuid primary key default gen_random_uuid(),
  team_id           uuid not null references teams(id) on delete cascade,

  race_id           text references races(race_id) on delete set null,
  driver_id         uuid references drivers(id) on delete set null,
  grid_position     integer,
  finish_position   integer,
  best_lap_ms       integer,
  incidents         integer,
  incident_notes    text,
  damage_report     text,
  strategy_notes    text,
  staff_rating      integer,
  staff_notes       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references drivers(id) on delete set null,

  unique (team_id, race_id, driver_id)
);

comment on table race_reports is 'Porting fedele di Reports.js + seedReports.js. report_id uuid nativo invece di REPnnn testuale (mai referenziato altrove salvo report_reactions, che punta qui via FK — stesso principio di race_crews.id). unique(team_id, race_id, driver_id) sostituisce con un vincolo DB la scansione manuale Set-based di seedRaceReports_ per il dedup — stesso esito, più robusto.';

create index race_reports_team_race_idx on race_reports (team_id, race_id);
create index race_reports_team_driver_idx on race_reports (team_id, driver_id);

-- ─── ReportReactions ───
-- Un pilota reagisce a un report con UNA sola emoji da un set fisso.
-- Secondo tap sulla stessa emoji = toggle off, tap su emoji diversa =
-- sostituisce. Un solo reazione per (report_id, driver_id).
create table report_reactions (
  reaction_id       uuid primary key default gen_random_uuid(),
  team_id           uuid not null references teams(id) on delete cascade,

  report_id         uuid not null references race_reports(report_id) on delete cascade,
  driver_id         uuid not null references drivers(id) on delete cascade,
  emoji             text not null check (emoji in ('🔥', '👏', '😂', '💀', '😬')),
  created_at        timestamptz not null default now(),

  unique (report_id, driver_id)
);

comment on table report_reactions is 'Porting fedele di Reports.js (REPORT_REACTIONS_HEADERS/REPORT_REACTION_EMOJI). unique(report_id, driver_id) sostituisce la scansione manuale del sorgente per trovare/sostituire/rimuovere la reazione esistente di un pilota.';

create index report_reactions_team_report_idx on report_reactions (team_id, report_id);

-- ─── RLS ───

alter table race_reports enable row level security;
alter table report_reactions enable row level security;

-- race_reports: qualsiasi tesserato del team legge (privacy aperta,
-- fedele al modello aggiornato 20/08/2026); solo staff/admin scrivono
-- (seeding automatico post-import e reports.update sono azioni
-- interne/staff, mai un pilota che scrive il proprio report via API —
-- fedele: il sorgente non espone alcuna action di scrittura ai piloti).
create policy "race_reports: il team legge"
  on race_reports for select
  using (team_id = current_driver_team_id());

create policy "race_reports: staff/admin scrivono"
  on race_reports for insert
  with check (team_id = current_driver_team_id() and current_driver_is_staff_or_admin());

create policy "race_reports: staff/admin aggiornano"
  on race_reports for update
  using (team_id = current_driver_team_id() and current_driver_is_staff_or_admin())
  with check (team_id = current_driver_team_id() and current_driver_is_staff_or_admin());

-- report_reactions: il team legge tutte le reazioni (per mostrarle sui
-- report), ogni pilota scrive/toglie SOLO la propria — fedele a
-- "ctx.driver_id" come unico driver_id scrivibile nel sorgente.
create policy "report_reactions: il team legge"
  on report_reactions for select
  using (team_id = current_driver_team_id());

create policy "report_reactions: il pilota scrive la propria"
  on report_reactions for insert
  with check (team_id = current_driver_team_id() and driver_id = current_driver_id());

create policy "report_reactions: il pilota aggiorna la propria"
  on report_reactions for update
  using (team_id = current_driver_team_id() and driver_id = current_driver_id())
  with check (team_id = current_driver_team_id() and driver_id = current_driver_id());

create policy "report_reactions: il pilota cancella la propria"
  on report_reactions for delete
  using (team_id = current_driver_team_id() and driver_id = current_driver_id());

-- ─── Privilegi minimi ───

revoke all on race_reports from anon;
revoke all on race_reports from authenticated;
grant select, insert, update on race_reports to authenticated;

revoke all on report_reactions from anon;
revoke all on report_reactions from authenticated;
grant select, insert, update, delete on report_reactions to authenticated;
