-- ═══════════════════════════════════════════════════════════
-- VSD-Paddock Cloud — Dominio Clash of Classes (porting fedele di
-- apps-script/ClashOfClasses.js + SetupClashOfClasses.js)
-- ═══════════════════════════════════════════════════════════
-- Mini-campionato esibizione GTE vs GT3 (3 round). A differenza di
-- ogni altro dominio portato finora, QUESTO è pensato dal sorgente
-- per essere pubblico e community-wide: clash.participants.list,
-- clash.participants.register, clash.standings e clash.incidents.report
-- non richiedono auth (ctx può essere assente/anonimo). Solo le
-- azioni di gestione (participants.add/update/remove, results.submitRound,
-- incidents.list) richiedono staff/admin.
--
-- DEVIAZIONE ARCHITETTURALE NUOVA (non presente nei domini precedenti,
-- fatta di necessità pratica, non per scelta stilistica): il sorgente
-- reale ha un solo team implicito (VSD, hardcoded). Qui invece un
-- chiamante anonimo (non loggato) non ha nessun team_id risolvibile
-- dall'auth — deve identificare il team in un altro modo. Le Edge
-- Function pubbliche di questo dominio accettano quindi un payload
-- `team_slug` (risolto su teams.slug) SOLO per chiamate anonime; un
-- chiamante autenticato usa sempre il proprio team_id dall'auth,
-- ignorando team_slug se presente. Le stesse Edge Function operano con
-- un client SERVICE ROLE per le letture/scritture pubbliche (bypassano
-- la RLS), perché il sorgente reale non ha alcun concetto di permessi
-- riga-per-riga sullo sheet — ogni controllo è a livello di handler
-- JS (ctx.isStaff), non di storage. La RLS qui sotto resta comunque
-- attiva come seconda barriera per accessi diretti via REST con
-- anon/authenticated key (non passando dall'Edge Function): a quel
-- livello SOLO i membri autenticati del team possono leggere/scrivere,
-- fedele al principio "nessuna tabella è mai leggibile da anon
-- direttamente" già usato in ogni altro dominio di questo progetto.
--
-- driver_id qui è uuid nullable (FK a drivers), a differenza del testo
-- libero del sorgente — un iscritto/risultato "esterno" (community non
-- tesserata, ammessa da regolamento cap. 2.2) ha semplicemente
-- driver_id null e viene identificato solo da display_name, fedele al
-- sorgente (matching per driver_id OR display_name case-insensitive).
-- ═══════════════════════════════════════════════════════════

create table clash_participants (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references teams(id) on delete cascade,

  driver_id       uuid references drivers(id) on delete set null,
  display_name    text not null,
  class           text not null check (class in ('GTE', 'GT3')),
  discord_handle  text,
  vehicle         text,
  status          text not null default 'registered' check (status in ('registered', 'withdrawn')),
  registered_at   timestamptz not null default now()
);

comment on table clash_participants is 'Iscritti a Clash of Classes. Porting fedele di ClashParticipants — dedup per driver_id OR display_name (case-insensitive) tra i non-withdrawn, applicativo (non un constraint DB: la regola è un OR, non una chiave composita semplice), replicato nelle Edge Function register/add.';

create index clash_participants_team_idx on clash_participants (team_id) where status != 'withdrawn';

create table clash_results (
  id                        uuid primary key default gen_random_uuid(),
  team_id                   uuid not null references teams(id) on delete cascade,

  round                     integer not null check (round in (1, 2, 3)),
  driver_id                 uuid references drivers(id) on delete set null,
  display_name              text not null,
  class                     text not null check (class in ('GTE', 'GT3')),
  finish_position_class     integer,
  finish_position_overall   integer,
  pole_class                boolean not null default false,
  fastest_lap_class         boolean not null default false,
  finisher                  boolean not null default false,
  dnf                       boolean not null default false,
  entered_by                uuid references drivers(id) on delete set null,
  entered_at                timestamptz not null default now()
);

comment on table clash_results is 'Risultati per pilota per round. Porting fedele di ClashResults — clash.results.submitRound è idempotente per round (cancella le righe esistenti di quel round, poi inserisce le nuove), replicato nell''Edge Function con delete+insert sequenziali, stesso comportamento non-transazionale del sorgente Apps Script.';

create index clash_results_team_round_idx on clash_results (team_id, round);

create table clash_incident_reports (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references teams(id) on delete cascade,

  round           integer not null check (round in (1, 2, 3)),
  reporting_name  text not null,
  reported_name   text not null,
  description     text not null check (char_length(description) <= 2000),
  replay_url      text,
  submitted_at    timestamptz not null default now(),
  status          text not null default 'pending'
);

comment on table clash_incident_reports is 'Segnalazioni incidenti/sanzioni cap. 9 regolamento. Porting fedele di ClashIncidentReports — form pubblico, nessun workflow di decisione qui (le sanzioni restano a discrezione della Direzione Generale, comunicate su Discord, fedele al sorgente).';

create index clash_incident_reports_team_idx on clash_incident_reports (team_id, submitted_at desc);

-- ─── RLS ───
-- Barriera per accessi diretti via REST (anon/authenticated key). Il
-- percorso pubblico reale passa dalle Edge Function con client SERVICE
-- ROLE (vedi nota in testa al file) — qui restano SOLO i membri
-- autenticati del team, nessun grant ad anon.

alter table clash_participants enable row level security;
alter table clash_results enable row level security;
alter table clash_incident_reports enable row level security;

create policy "clash_participants: il team legge"
  on clash_participants for select
  using (team_id = current_driver_team_id());

create policy "clash_participants: staff/admin scrivono"
  on clash_participants for insert
  with check (team_id = current_driver_team_id() and current_driver_is_staff_or_admin());

create policy "clash_participants: staff/admin aggiornano"
  on clash_participants for update
  using (team_id = current_driver_team_id() and current_driver_is_staff_or_admin())
  with check (team_id = current_driver_team_id() and current_driver_is_staff_or_admin());

create policy "clash_results: il team legge"
  on clash_results for select
  using (team_id = current_driver_team_id());

create policy "clash_results: staff/admin scrivono"
  on clash_results for insert
  with check (team_id = current_driver_team_id() and current_driver_is_staff_or_admin());

create policy "clash_results: staff/admin cancellano (replace-per-round)"
  on clash_results for delete
  using (team_id = current_driver_team_id() and current_driver_is_staff_or_admin());

create policy "clash_incident_reports: solo staff/admin leggono"
  on clash_incident_reports for select
  using (team_id = current_driver_team_id() and current_driver_is_staff_or_admin());

create policy "clash_incident_reports: il team segnala"
  on clash_incident_reports for insert
  with check (team_id = current_driver_team_id());

-- ─── Privilegi minimi ───

revoke all on clash_participants from anon;
revoke all on clash_participants from authenticated;
grant select, insert, update on clash_participants to authenticated;

revoke all on clash_results from anon;
revoke all on clash_results from authenticated;
grant select, insert, delete on clash_results to authenticated;

revoke all on clash_incident_reports from anon;
revoke all on clash_incident_reports from authenticated;
grant select, insert on clash_incident_reports to authenticated;
