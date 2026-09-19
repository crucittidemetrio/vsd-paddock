-- ═══════════════════════════════════════════════════════════
-- VSD-Paddock Cloud — Dominio RaceResults (porting di
-- apps-script/RaceResults.js + apps-script/RaceResultsImport.js)
-- ═══════════════════════════════════════════════════════════
-- Logica di riferimento reale:
--   - raceResults.list   → NESSUN controllo ctx nel sorgente reale
--     (handleRaceResultsList non fa `if (!ctx) return fail(...)`) —
--     è un endpoint PUBBLICO by design (commento Wave 10.3 in
--     Codice.js: "anonymous è un tier valido per endpoint pubblici").
--     list() restituisce solo un SOTTOINSIEME curato di colonne:
--     incidents/imported_at/raw_payload sono scritti ma MAI
--     restituiti da list — fedelmente riprodotto sotto.
--   - raceResults.import → SOLO staff/admin (ctx.isStaff). Accetta 2
--     formati: array LMU [{carClass, result:[...]}] oppure oggetto
--     iRacing {type:'event_result', data:{...}}. Fa matching
--     nome-esterno→driver_id (matchDriverName_, stesso algoritmo
--     multi-livello di buildDriverNameMap_), dedup per
--     (race_id, session_type, driver_key).
--
-- DEVIAZIONE DELIBERATA: qui raceResults-list RICHIEDE auth (a
-- differenza del sorgente pubblico). Nel sistema reale single-tenant
-- "pubblico" significa "chiunque visiti il sito VSD"; in questo
-- schema multi-tenant condiviso da più team non esiste un modo pulito
-- di scoping team_id per un visitatore anonimo senza un parametro
-- aggiuntivo (slug/dominio) — fuori scope per questa fase. Verrà
-- riconsiderato quando/se il prodotto multi-team avrà pagine
-- pubbliche vere.
--
-- DEVIAZIONI OMESSE (documentate, non dimenticanze): le notifiche
-- Discord post-import (notifyRaceImported_, checkAndNotifyPodiums_,
-- checkAndNotifyMilestones_, checkAndNotifyRaceMvp_) e il seeding di
-- Race Reports (seedRaceReportsForRace) NON sono portati qui —
-- dipendono da domini non ancora portati (Notifications/Discord,
-- Fase 3 #256; Race Reports, Fase 6 #261). L'import scrive comunque
-- tutti i dati necessari perché quei domini, una volta portati,
-- possano operare sugli stessi risultati senza re-importare nulla.
--
-- result_id: chiave naturale testuale 'RES-{timestamp}-{classIdx}-
-- {idx}', fedele al sorgente. A differenza di race_id (contatore
-- piccolo RACEnnn), qui la componente timestamp (Date.now() in ms)
-- rende la collisione tra team diversi praticamente impossibile — non
-- serve lo scan globale service-role usato in races-add.
-- ═══════════════════════════════════════════════════════════

create table race_results (
  result_id           text primary key,
  team_id              uuid not null references teams(id) on delete cascade,
  race_id              text references races(race_id) on delete cascade,

  sim                  text not null,
  track_id             text,
  set_date             date,
  session_type         text not null check (session_type in ('qualifying', 'heat', 'race')),
  car_class            text not null default 'Unknown',
  car_num              integer,
  car_external_name    text,

  driver_id            uuid references drivers(id) on delete set null,
  driver_name_external text,

  total_laps           integer,
  best_lap_ms          integer,
  best_lap_display     text,
  total_time_ms        integer,
  total_time_display   text,
  finish_position      integer,
  points_given         numeric,
  penalty_points       numeric,
  point_total          numeric,
  dnf                  boolean not null default false,
  dns                  boolean not null default false,
  is_vsd_driver        boolean not null default false,

  -- Scritti dall'import, MAI restituiti da race-results-list (fedele
  -- al sorgente reale, vedi handleRaceResultsList).
  incidents            integer,
  imported_at          timestamptz not null default now(),
  raw_payload          jsonb
);

comment on table race_results is 'Risultati gara importati da LMU/iRacing. Porting di RaceResults.js + RaceResultsImport.js. incidents/imported_at/raw_payload sono scritti ma non esposti da list, fedele al sorgente.';

create index race_results_team_race_session_idx on race_results (team_id, race_id, session_type);
create index race_results_team_driver_idx on race_results (team_id, driver_id) where driver_id is not null;

-- ─── RLS ───

alter table race_results enable row level security;

-- SELECT: membri del team (deviazione dal pubblico reale, vedi nota sopra).
create policy "race_results: il team legge i risultati"
  on race_results for select
  using (team_id = current_driver_team_id());

-- INSERT: solo staff/admin (raceResults.import), stesso gate del
-- sorgente reale — riusa l'helper esistente (006), niente di nuovo.
create policy "race_results: solo staff/admin importano"
  on race_results for insert
  with check (team_id = current_driver_team_id() and current_driver_is_staff_or_admin());

-- Nessuna policy UPDATE/DELETE: il sorgente reale non espone
-- raceResults.update/remove via ACTIONS — admin_deleteRaceResults()
-- e admin_fixOrphanedGr86RaceIds() sono script one-off da editor
-- Apps Script, mai stati endpoint frontend-callable. Coerente con la
-- linea del progetto di non portare script one-off manuali.

revoke all on race_results from anon;

revoke all on race_results from authenticated;
grant select, insert on race_results to authenticated;
