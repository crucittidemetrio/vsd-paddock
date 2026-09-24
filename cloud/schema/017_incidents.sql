-- ═══════════════════════════════════════════════════════════
-- VSD-Paddock Cloud — Dominio Incidents (porting ADATTATO di
-- apps-script/Incidents.js)
-- ═══════════════════════════════════════════════════════════
-- DEVIAZIONE ARCHITETTURALE ESPLICITA (decisa con l'utente, non
-- un'iniziativa unilaterale): nel sorgente reale i piloti segnalano
-- tramite un Google Form ESTERNO ("VSD - Modulo reclamo"), letto in
-- sola lettura da Apps Script con l'identità Google nativa del
-- progetto — un meccanismo non riproducibile 1:1 da un Edge Function
-- Supabase senza un Service Account Google dedicato. L'utente ha
-- scelto di NON impostare quell'integrazione e di sostituire invece
-- l'intake con un modulo di segnalazione nativo qui in Supabase:
-- `incident_reports` è quindi una tabella di SCRITTURA diretta dei
-- piloti (non più uno specchio in sola lettura di un Form esterno).
--
-- Conseguenze pratiche di questa scelta, tutte deliberate:
--   - reporter_driver_id è sempre risolto dall'auth (current_driver_id()),
--     mai da un nome libero — elimina il bisogno di matchDriverName_
--     sul lato "chi segnala" (il pilota è già autenticato).
--   - against_driver_id è un vero FK a drivers (selezionabile da un
--     dropdown roster nel frontend) + against_name_external per il
--     caso di un pilota esterno al team, non presente in roster.
--   - reporter_discord (colonna del Form reale) non ha equivalente:
--     l'identità Discord del segnalante è già quella del suo account
--     Supabase, non serve raccoglierla di nuovo in un campo separato.
--   - complaint_key (chiave testuale basata su timestamp del Form)
--     diventa report_id, un uuid nativo — niente più fallback
--     "row" + indice riga.
--
-- `incident_resolutions` resta invece un porting FEDELE della tab
-- IncidentResolutions reale (status/penalty/staff_notes/evidence_url/
-- sim/penalized_driver_id) — quella parte del sistema non dipendeva
-- dal Form esterno e non cambia.
--
-- championship_id: nessuna FK, dominio Championships non ancora
-- portato (Fase 2, #252) — stesso principio già usato in races/
-- race_results.
-- ═══════════════════════════════════════════════════════════

create table incident_reports (
  id                  uuid primary key default gen_random_uuid(),
  team_id             uuid not null references teams(id) on delete cascade,

  reporter_driver_id  uuid not null references drivers(id) on delete cascade,
  against_driver_id   uuid references drivers(id) on delete set null,
  against_name_external text,

  race_date           date,
  track_id            text,
  lap                 text,
  time_in_race        text,
  incident_type       text,
  description         text not null,
  championship_id     text,

  created_at          timestamptz not null default now()
);

comment on table incident_reports is 'Segnalazioni incidenti/reclami, intake nativo Supabase (sostituisce il Google Form esterno del sistema reale — deviazione deliberata concordata con l''utente, vedi commento in testa al file). Immutabile una volta creata: nessuna policy UPDATE/DELETE, stesso spirito "va lasciato intatto" del Form originale.';

create index incident_reports_team_idx on incident_reports (team_id, created_at desc);
create index incident_reports_reporter_idx on incident_reports (reporter_driver_id);
create index incident_reports_against_idx on incident_reports (against_driver_id) where against_driver_id is not null;

create table incident_resolutions (
  id                  uuid primary key default gen_random_uuid(),
  team_id             uuid not null references teams(id) on delete cascade,
  report_id           uuid not null unique references incident_reports(id) on delete cascade,

  status              text not null default 'open' check (status in ('open', 'reviewing', 'closed')),
  penalty_type        text,
  penalty_detail       text,
  staff_notes         text,
  resolved_by         uuid references drivers(id) on delete set null,
  resolved_at         timestamptz,
  evidence_url        text,
  sim                 text,
  penalized_driver_id uuid references drivers(id) on delete set null
);

comment on table incident_resolutions is 'Formalizzazione staff di stato/penalità per una segnalazione. Porting fedele di IncidentResolutions.js — questa parte non dipendeva dal Form esterno. Un solo record per report_id (unique), upsert lato Edge Function.';

-- ─── RLS ───

alter table incident_reports enable row level security;
alter table incident_resolutions enable row level security;

-- SELECT: staff/admin vedono tutto il team; un pilota vede solo le
-- segnalazioni che lo riguardano (come segnalante o come segnalato) —
-- fedele alla regola reale in handleIncidentsList.
create policy "incident_reports: staff/admin leggono tutto, piloti solo le proprie"
  on incident_reports for select
  using (
    team_id = current_driver_team_id()
    and (
      current_driver_is_staff_or_admin()
      or reporter_driver_id = current_driver_id()
      or against_driver_id = current_driver_id()
    )
  );

-- INSERT: qualsiasi membro del team può segnalare, ma SOLO come se
-- stesso (reporter_driver_id forzato all'auth, mai al payload — vedi
-- Edge Function incidents-report).
create policy "incident_reports: il team segnala come se stesso"
  on incident_reports for insert
  with check (
    team_id = current_driver_team_id()
    and reporter_driver_id = current_driver_id()
  );

-- Nessuna policy UPDATE/DELETE: immutabile, stesso principio del Form reale.

-- SELECT: stessa visibilità per riga di incident_reports (join),
-- MA staff_notes/reporter_discord-equivalent non hanno un filtro qui:
-- l'oscuramento di staff_notes per i piloti coinvolti avviene
-- nell'Edge Function incidents-list (selezione colonne applicativa),
-- fedele a come il sorgente reale lo fa in handleIncidentsList — RLS
-- filtra le RIGHE, non le colonne.
create policy "incident_resolutions: stessa visibilità del report collegato"
  on incident_resolutions for select
  using (
    team_id = current_driver_team_id()
    and (
      current_driver_is_staff_or_admin()
      or exists (
        select 1 from incident_reports ir
        where ir.id = incident_resolutions.report_id
          and (ir.reporter_driver_id = current_driver_id() or ir.against_driver_id = current_driver_id())
      )
    )
  );

-- INSERT/UPDATE: solo staff/admin (incidents.resolve, upsert per report_id).
create policy "incident_resolutions: solo staff/admin formalizzano"
  on incident_resolutions for insert
  with check (team_id = current_driver_team_id() and current_driver_is_staff_or_admin());

create policy "incident_resolutions: solo staff/admin aggiornano"
  on incident_resolutions for update
  using (team_id = current_driver_team_id() and current_driver_is_staff_or_admin())
  with check (team_id = current_driver_team_id() and current_driver_is_staff_or_admin());

-- ─── Privilegi minimi ───

revoke all on incident_reports from anon;
revoke all on incident_reports from authenticated;
grant select, insert on incident_reports to authenticated;

revoke all on incident_resolutions from anon;
revoke all on incident_resolutions from authenticated;
grant select, insert, update on incident_resolutions to authenticated;

-- ═══════════════════════════════════════════════════════════
-- NOTA DI DRIFT (scoperta il 24/09/2026, vedi 032_incidents_unify.sql):
-- questo file NON descrive più lo schema live di incident_reports.
-- Tra #351/#352 la tabella è stata evoluta direttamente in produzione,
-- mai sincronizzata qui: reporter_driver_id è ora NULLABLE,
-- against_name_external NON esiste più (sostituita da `against` NOT
-- NULL), sono comparse `reporter_sim` (NOT NULL) e `reporter_discord`,
-- e championship_id ha ora un vero FK composito su
-- championships(team_id, id). 032_incidents_unify.sql aggiunge sopra
-- a QUESTO stato reale (non a quello descritto sopra in questo file)
-- race_id/clash_round/source/replay_url. Per lo schema autoritativo
-- di incident_reports, guardare 032 + `information_schema.columns`
-- live, non le CREATE TABLE qui sopra.
-- ═══════════════════════════════════════════════════════════
