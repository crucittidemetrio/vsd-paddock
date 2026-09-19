-- ═══════════════════════════════════════════════════════════
-- VSD-Paddock Cloud — Dominio Championships + Standings (porting
-- fedele di apps-script/championshipsHandlers.js + Standings.js)
-- ═══════════════════════════════════════════════════════════
-- id è uno slug testuale scelto a mano (es. "aciLmgt3Challenge2026"),
-- esattamente come nel foglio reale (vedi migrations.js,
-- migrate_add_aciLmgt3Challenge2026) — NON generato via sequenza come
-- races.race_id. Multi-tenant: PK composita (team_id, id) perché lo
-- slug non è garantito univoco tra team diversi.
--
-- standings_json / points_adjustments_json: nel foglio reale sono
-- stringhe JSON grezze in una cella (parse/stringify manuale ad ogni
-- lettura/scrittura in Standings.js). Qui sono jsonb nativo — stessa
-- semantica, nessuna differenza funzionale, solo niente più
-- JSON.parse/stringify espliciti lato Edge Function. Non è quindi
-- trattato come deviazione di comportamento, solo di tipo colonna.
--
-- DEVIAZIONE DELIBERATA (necessaria per il multi-tenant, non
-- un'iniziativa arbitraria): il sistema reale NON ha un endpoint
-- championships.add/update — i campionati vengono creati a mano
-- dallo sviluppatore con una funzione Apps Script one-off
-- (migrate_add_<slug>) eseguita nell'editor. Un team abbonato al
-- SaaS non ha accesso all'editor Apps Script/a questo repo, quindi
-- gli servono endpoint championships.add/update self-service
-- (staff/admin) per gestire i propri campionati — vedi
-- championships-add/championships-update. A differenza di Incidents
-- (dove la scelta tra due architetture alternative è stata
-- esplicitamente girata all'utente) qui non c'è un vero bivio
-- architetturale: serve solo il CRUD che il foglio non aveva bisogno
-- di avere. Nessun endpoint "remove" (il sorgente non ne ha uno e
-- non c'è un motivo pratico forte per uno adesso — un campionato
-- creato per errore si può lasciare a status 'draft').
--
-- championship_id in races/incident_reports non aveva FK finora
-- (dominio non ancora portato) — ora che championships esiste,
-- aggiungiamo la FK composita (team_id, championship_id) sotto,
-- chiudendo quel gap. Sicuro da fare ora: entrambe le tabelle sono
-- vuote in produzione.
-- ═══════════════════════════════════════════════════════════

create table championships (
  id                      text not null,
  team_id                 uuid not null references teams(id) on delete cascade,

  name                    text not null,
  sim                     text,
  season                  text,
  status                  text check (status in ('draft', 'upcoming', 'active', 'completed')),
  format                  text,
  start_date              date,
  end_date                date,
  notes                   text,
  banner_url              text,

  standings_json          jsonb,
  points_adjustments_json jsonb not null default '[]'::jsonb,

  created_at              timestamptz not null default now(),

  primary key (team_id, id)
);

comment on table championships is 'Campionati (esterni o interni) tracciati dal team. Porting di championshipsHandlers.js. standings_json = classifica importata da LMU (autorevole quando presente); points_adjustments_json = aggiustamenti manuali (bonus/penalità/scarti) applicati sopra qualunque fonte. Vedi Standings.js per la logica di merge.';

create index championships_team_idx on championships (team_id);

-- FK ora possibile: chiude il gap documentato in 015_races.sql e
-- 017_incidents.sql ("championship_id: nessuna FK, dominio non
-- ancora portato").
alter table races
  add constraint races_championship_fkey
  foreign key (team_id, championship_id) references championships (team_id, id);

alter table incident_reports
  add constraint incident_reports_championship_fkey
  foreign key (team_id, championship_id) references championships (team_id, id);

-- ─── RLS ───

alter table championships enable row level security;

-- SELECT: qualsiasi membro del team (fedele a handleChampionshipsList:
-- solo "if (!ctx) return fail", nessuna distinzione staff/driver).
create policy "championships: il team legge i propri campionati"
  on championships for select
  using (team_id = current_driver_team_id());

-- INSERT/UPDATE: solo staff/admin — championships.add/update sono
-- endpoint nuovi (vedi commento sopra), ma seguono lo stesso gate
-- reale di championships.importStandings/saveAdjustments (ctx.isStaff
-- = staff-o-admin).
create policy "championships: staff/admin creano"
  on championships for insert
  with check (team_id = current_driver_team_id() and current_driver_is_staff_or_admin());

create policy "championships: staff/admin aggiornano"
  on championships for update
  using (team_id = current_driver_team_id() and current_driver_is_staff_or_admin())
  with check (team_id = current_driver_team_id() and current_driver_is_staff_or_admin());

-- Nessuna policy DELETE: il sorgente reale non ha un endpoint remove.

revoke all on championships from anon;
revoke all on championships from authenticated;
grant select, insert, update on championships to authenticated;

-- ═══════════════════════════════════════════════════════════
-- SkillIndexHistory — snapshot periodici per grafico andamento
-- (porting di SkillIndex.js, tab SkillIndexHistory)
-- ═══════════════════════════════════════════════════════════
-- Nel sorgente reale uno snapshot al giorno per pilota è garantito da
-- una scansione applicativa (Set di driver_id già snapshottati oggi,
-- dentro snapshotSkillIndex_). Qui lo stesso invariante è imposto
-- direttamente dal DB con un unique constraint — più solido, meno
-- codice, stessa regola. Il trigger settimanale time-driven di Apps
-- Script (runSkillIndexSnapshot) non ha un equivalente diretto qui:
-- Supabase non ha trigger "time-driven" nativi lato client come Apps
-- Script — l'endpoint skill-index-snapshot (staff/admin, invocabile
-- manualmente o da un futuro cron esterno/pg_cron) fa lo stesso
-- calcolo on-demand. Automatizzare la cadenza settimanale è lasciato
-- fuori scope qui (richiederebbe pg_cron o uno scheduler esterno,
-- non è un porting di un endpoint esistente).

create table skill_index_history (
  id             uuid primary key default gen_random_uuid(),
  team_id        uuid not null references teams(id) on delete cascade,
  driver_id      uuid not null references drivers(id) on delete cascade,

  score          integer not null,
  races_counted  integer not null,
  avg_finish_pct integer,
  podium_rate    integer,
  avg_incidents  numeric,

  snapshot_date  date not null default current_date,
  created_at     timestamptz not null default now(),

  unique (team_id, driver_id, snapshot_date)
);

comment on table skill_index_history is 'Snapshot periodici dell''indice skill per grafico di andamento. Porting di SkillIndex.js (tab SkillIndexHistory). Unique (team_id, driver_id, snapshot_date) sostituisce con un vincolo DB la scansione applicativa "già snapshottato oggi?" del sorgente.';

create index skill_index_history_driver_idx on skill_index_history (team_id, driver_id, snapshot_date desc);

alter table skill_index_history enable row level security;

-- SELECT: qualsiasi membro del team, su qualunque pilota — fedele a
-- handleSkillIndexHistory (nessuna restrizione "solo il proprio
-- storico", stesso spirito pubblico-al-roster di skillIndex.list).
create policy "skill_index_history: il team legge tutti gli storici"
  on skill_index_history for select
  using (team_id = current_driver_team_id());

-- INSERT: solo staff/admin, via l'endpoint skill-index-snapshot
-- (sostituisce l'identità script-owner del trigger Apps Script reale).
create policy "skill_index_history: staff/admin registrano snapshot"
  on skill_index_history for insert
  with check (team_id = current_driver_team_id() and current_driver_is_staff_or_admin());

-- Nessuna policy UPDATE/DELETE: immutabile, stesso principio di
-- BestLaps/IncidentReports.

revoke all on skill_index_history from anon;
revoke all on skill_index_history from authenticated;
grant select, insert on skill_index_history to authenticated;
