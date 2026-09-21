-- ═══════════════════════════════════════════════════════════
-- VSD-Paddock Cloud — Elo (abilità relativa) + Safety Rank
-- (pulizia di guida), dominio NUOVO — non un porting, non esiste
-- equivalente nel sorgente Apps Script reale.
-- ═══════════════════════════════════════════════════════════
-- Contesto/decisione (20-21/09/2026, discussa con l'utente prima di
-- scrivere codice): il sistema esistente (academy-ranking, Fase 2/3)
-- calcola VR = PM (punti F1-style per posizione, class-relative,
-- cumulativi) + PP (punti penalità da incident_resolutions, sottrazione
-- cumulativa SENZA fondo). Due limiti individuati:
--   1. PM/paceRanking rispondono "che posizione hai fatto" / "quanto sei
--      lontano dal più veloce del gruppo", ma MAI "quanto sei forte
--      rispetto a CHI hai battuto" — un P5 in un campo forte e un P5 in
--      un campo debole valgono identico. Elo copre questo buco.
--   2. PP è una sottrazione cumulativa senza tetto: più corri, più puoi
--      scendere, mai risalire — non confrontabile tra un pilota a 5 gare
--      e uno a 40, e non dà nessun incentivo "torna a guidare pulito".
--      Safety Rank (0-100, sale con gare pulite, scende con incidenti)
--      la sostituisce dentro il calcolo di VR (vedi nota in
--      academy-ranking quando verrà aggiornato in #371).
--
-- DIFFERENZA ARCHITETTURALE FONDAMENTALE rispetto a PM/paceRanking:
-- quelle due sono funzioni PURE, stateless, ricalcolate da zero ad ogni
-- richiesta leggendo tutta la cronologia di race_results. Elo e Safety
-- Rank NON possono funzionarci allo stesso modo: l'ORDINE delle gare
-- conta (il rating dopo la gara N dipende dal rating dopo la gara N-1).
-- Servono quindi tabelle di STATO corrente (aggiornate una gara alla
-- volta da un backfill storico una-tantum, #369, e poi incrementalmente
-- ad ogni nuovo import risultati, #370) — non tabelle derivate.
--
-- Scelta di scope: UNA rating per (team, pilota, sim) — non anche per
-- car_class. Il confronto a coppie che genera il delta Elo di una gara
-- avviene SOLO tra piloti della stessa classe in quella gara (fair
-- comparison, stesso principio class-relative di PM), ma il numero
-- risultante è unico e "portabile" tra classi dello stesso sim — stessa
-- scelta già fatta da PM (class-relative per il calcolo, ma sommato in
-- un solo numero per pilota per sim). Evita frammentare ~600 risultati
-- storici su troppe combinazioni (pilota, sim, classe) con campioni
-- troppo piccoli per stabilizzarsi.
--
-- Le tabelle *_history esistono per due motivi: (a) permettere un
-- grafico "andamento nel tempo" sul profilo pilota senza dover
-- rigiocare tutta la cronologia ad ogni richiesta, (b) rendere il
-- backfill IDEMPOTENTE — se va rilanciato (bug, nuova gara storica
-- scoperta in ritardo), può ripartire da zero cancellando prima le
-- righe history invece di dover "indovinare" lo stato intermedio.
-- ═══════════════════════════════════════════════════════════

-- ─── Elo ───

create table driver_elo_ratings (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references teams(id) on delete cascade,
  driver_id    uuid not null references drivers(id) on delete cascade,
  sim          text not null,

  rating       numeric not null default 1500,
  races        integer not null default 0,
  updated_at   timestamptz not null default now(),

  unique (team_id, driver_id, sim)
);

comment on table driver_elo_ratings is 'Stato corrente Elo per pilota+sim. K-factor dinamico applicato a monte (40 prime 10 gare, 24 dalle 11 alle 30, 16 dopo — vedi driver_elo_history.k_factor per il valore usato in ciascun aggiornamento). Scritta solo da backfill (#369) e da raceResults.import (#370), mai da un pilota direttamente.';

create index driver_elo_ratings_team_sim_idx on driver_elo_ratings (team_id, sim, rating desc);

create table driver_elo_history (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references teams(id) on delete cascade,
  driver_id       uuid not null references drivers(id) on delete cascade,
  sim             text not null,
  -- Testuale come race_results.race_id, niente FK: alcuni race_id
  -- storici sono orfani (vedi admin_findOrphanedRaceIds in
  -- RaceResultsImport.js) e il backfill non deve fallire per questo.
  race_id         text,
  car_class       text not null,

  rating_before   numeric not null,
  rating_after    numeric not null,
  delta           numeric not null,
  k_factor        integer not null,
  opponents_count integer not null,

  computed_at     timestamptz not null default now()
);

comment on table driver_elo_history is 'Uno snapshot per (pilota, gara, classe): il delta Elo di quella gara. Serie storica per grafico andamento + permette di azzerare e rilanciare il backfill in modo idempotente.';

create index driver_elo_history_driver_idx on driver_elo_history (team_id, driver_id, sim, computed_at);

-- ─── Safety Rank ───

create table driver_safety_ranks (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references teams(id) on delete cascade,
  driver_id    uuid not null references drivers(id) on delete cascade,
  sim          text not null,

  rating       numeric not null default 100 check (rating >= 0 and rating <= 100),
  races        integer not null default 0,
  updated_at   timestamptz not null default now(),

  unique (team_id, driver_id, sim)
);

comment on table driver_safety_ranks is 'Stato corrente Safety Rank (0-100) per pilota+sim. Parte da 100, -2/-4/-8/-15/-25 per warning/lieve/media/pesante/squalifica (stessa severità di PP_PENALTY_POINTS in academy-ranking, rimappata su scala 0-100), +1 per gara "race" completata senza incidenti in quel sim, mai sopra 100 né sotto 0. Bande UI: 90-100 Pulito, 70-89 Regolare, 40-69 Da monitorare, <40 A rischio.';

create index driver_safety_ranks_team_sim_idx on driver_safety_ranks (team_id, sim, rating desc);

create table driver_safety_rank_history (
  id                     uuid primary key default gen_random_uuid(),
  team_id                uuid not null references teams(id) on delete cascade,
  driver_id              uuid not null references drivers(id) on delete cascade,
  sim                    text not null,
  race_id                text,
  incident_resolution_id uuid references incident_resolutions(id) on delete set null,

  rating_before          numeric not null,
  rating_after           numeric not null,
  delta                  numeric not null,
  reason                 text not null check (reason in ('clean_race', 'warning', 'lieve', 'media', 'pesante', 'squalifica')),

  computed_at            timestamptz not null default now()
);

comment on table driver_safety_rank_history is 'Un evento per riga: +1 per gara pulita (race_id valorizzato, incident_resolution_id nullo) o decremento per penalità (incident_resolution_id valorizzato, reason=tipo penalità). Serie storica per grafico andamento + idempotenza del backfill.';

create index driver_safety_rank_history_driver_idx on driver_safety_rank_history (team_id, driver_id, sim, computed_at);

-- ─── RLS ───
-- Stesso pattern di skill_index_history (018): tutto il team legge,
-- solo staff/admin scrivono — le scritture vere arrivano da un processo
-- di backend (backfill one-off eseguito da staff, o dall'Edge Function
-- raceResults.import, anch'essa staff-only) mai da un pilota che aggiorna
-- il proprio rating a piacere.

alter table driver_elo_ratings enable row level security;
alter table driver_elo_history enable row level security;
alter table driver_safety_ranks enable row level security;
alter table driver_safety_rank_history enable row level security;

create policy "driver_elo_ratings: il team legge"
  on driver_elo_ratings for select
  using (team_id = current_driver_team_id());

create policy "driver_elo_ratings: staff/admin scrivono"
  on driver_elo_ratings for insert
  with check (team_id = current_driver_team_id() and current_driver_is_staff_or_admin());

create policy "driver_elo_ratings: staff/admin aggiornano"
  on driver_elo_ratings for update
  using (team_id = current_driver_team_id() and current_driver_is_staff_or_admin())
  with check (team_id = current_driver_team_id() and current_driver_is_staff_or_admin());

create policy "driver_elo_history: il team legge"
  on driver_elo_history for select
  using (team_id = current_driver_team_id());

create policy "driver_elo_history: staff/admin registrano"
  on driver_elo_history for insert
  with check (team_id = current_driver_team_id() and current_driver_is_staff_or_admin());

create policy "driver_safety_ranks: il team legge"
  on driver_safety_ranks for select
  using (team_id = current_driver_team_id());

create policy "driver_safety_ranks: staff/admin scrivono"
  on driver_safety_ranks for insert
  with check (team_id = current_driver_team_id() and current_driver_is_staff_or_admin());

create policy "driver_safety_ranks: staff/admin aggiornano"
  on driver_safety_ranks for update
  using (team_id = current_driver_team_id() and current_driver_is_staff_or_admin())
  with check (team_id = current_driver_team_id() and current_driver_is_staff_or_admin());

create policy "driver_safety_rank_history: il team legge"
  on driver_safety_rank_history for select
  using (team_id = current_driver_team_id());

create policy "driver_safety_rank_history: staff/admin registrano"
  on driver_safety_rank_history for insert
  with check (team_id = current_driver_team_id() and current_driver_is_staff_or_admin());

-- ─── Privilegi minimi ───

revoke all on driver_elo_ratings from anon;
revoke all on driver_elo_ratings from authenticated;
grant select, insert, update on driver_elo_ratings to authenticated;

revoke all on driver_elo_history from anon;
revoke all on driver_elo_history from authenticated;
grant select, insert on driver_elo_history to authenticated;

revoke all on driver_safety_ranks from anon;
revoke all on driver_safety_ranks from authenticated;
grant select, insert, update on driver_safety_ranks to authenticated;

revoke all on driver_safety_rank_history from anon;
revoke all on driver_safety_rank_history from authenticated;
grant select, insert on driver_safety_rank_history to authenticated;
