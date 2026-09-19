-- ═══════════════════════════════════════════════════════════
-- VSD-Paddock Cloud — Dominio Races (porting di apps-script/Races.js)
-- ═══════════════════════════════════════════════════════════
-- Logica di riferimento reale (letta dal file sorgente, non a
-- memoria):
--
--   races.list         → tutte le gare, filtro opzionale per status,
--                         ordinate per data crescente, JOIN
--                         championship_name (nullo finché il dominio
--                         Championships non è portato, vedi sotto).
--   races.upcoming      → prossime 3 gare con status='scheduled' e
--                         date > now, ordinate per data crescente.
--   races.get           → dettaglio singola gara per race_id.
--   races.add           → SOLO ADMIN (non staff — vedi nota sotto).
--                         Genera race_id incrementale 'RACEnnn'.
--   races.update        → SOLO ADMIN. Aggiorna solo i campi presenti
--                         nel payload, mai race_id/created_at.
--   races.remove        → SOLO ADMIN. Blocca la cancellazione se
--                         esistono stint Endurance collegati (Fase 4,
--                         non ancora portata — qui il controllo è
--                         omesso finché endurance_stints non esiste,
--                         vedi nota sotto).
--   races.updatePoster  → SOLO STAFF/ADMIN (nota: qui il gate è
--                         ctx.isStaff, diverso da add/update/remove
--                         che usano _esIsStaff_ admin-only — è così
--                         anche nel sorgente reale, non un errore di
--                         porting).
--   races.updateGallery → SOLO STAFF/ADMIN, stesso gate di updatePoster.
--
-- NOTA IMPORTANTE sui permessi: nel sorgente reale, races.add/update/
-- remove usano l'helper `_esIsStaff_` (definito in EnduranceStints.js,
-- riusato qui per omonimia di file system Apps Script dove tutto è
-- globale) che controlla SOLO `ctx.role === 'admin' || ctx.tier ===
-- 'admin'` — NON accetta staff, nonostante il nome fuorviante della
-- funzione. È più restrittivo del pattern `ctx.isStaff` (staff O
-- admin) usato altrove nel progetto (best_laps, pitwall_sessions,
-- team_sessions). Portato fedelmente: qui sotto current_driver_is_admin()
-- è un helper NUOVO, admin-only, distinto da
-- current_driver_is_staff_or_admin() già esistente — usato apposta
-- solo per add/update/remove. updatePoster/updateGallery invece usano
-- il gate staff-or-admin, come nel sorgente.
--
-- NOTA su championship_id: colonna presente e scritta/letta, ma
-- SENZA foreign key verso una tabella `championships` — quel dominio
-- non esiste ancora in cloud/ (Fase 2 del piano). La FK verrà aggiunta
-- quando arriva. Stesso principio già usato per best_laps.car_id
-- ("può non matchare").
--
-- NOTA su race_id come chiave naturale testuale (non uuid): a
-- differenza di pitwall_sessions.session_id (libero, non riferito da
-- altre tabelle), race_id è la chiave che DECINE di domini futuri
-- (RaceResults, Championships standings/adjustments, RaceRSVP,
-- RaceCrews, Endurance stints, FuelLog, LapData) referenziano
-- direttamente con lo stesso formato 'RACEnnn' del foglio reale.
-- Usare race_id text come primary key (invece di un uuid interno con
-- mapping) evita di reinventare una chiave che l'intero resto del
-- sistema reale già usa in questo formato.
--
-- NOTA su gallery_urls: nel foglio reale è una singola cella con URL
-- separati da virgola (join/split manuale nel handler). Qui è un
-- text[] nativo Postgres — stessa informazione, tipo più corretto.
--
-- NOTA operativa: applicata come migrazione 015 (non 014) perché il
-- progetto Supabase conteneva già una tabella `races` orfana, residuo
-- di uno schema demo non tracciato (pilots/seasons/races/race_results/
-- penalties) rimosso in 014_drop_orphan_demo_schema.sql previa
-- conferma esplicita dell'utente.
-- ═══════════════════════════════════════════════════════════

create table races (
  race_id            text primary key,             -- formato 'RACEnnn', generato lato Edge Function (scan+increment, fedele al sorgente)
  team_id            uuid not null references teams(id) on delete cascade,

  sim                text not null,
  round              text,
  race_name          text not null,
  track_id           text,
  car_id             text,
  date               timestamptz not null,
  duration_minutes   integer not null default 0,
  format             text not null,
  status             text not null default 'scheduled'
                       check (status in ('scheduled', 'live', 'completed', 'cancelled')),
  broadcast_url      text,
  notes              text,
  weather            text,
  event_type         text,
  championship_id    text,                         -- nessuna FK: dominio Championships non ancora portato
  poster_url         text,
  gallery_urls       text[] not null default '{}',

  created_at         timestamptz not null default now()
);

comment on table races is 'Calendario gare del team. Porting di Races.js. race_id testuale (RACEnnn) perché decine di altri domini futuri lo referenziano nello stesso formato del foglio reale.';

create index races_team_status_date_idx on races (team_id, status, date);
create index races_team_championship_idx on races (team_id, championship_id) where championship_id is not null;

-- ─── RLS ───

alter table races enable row level security;

-- Helper NUOVO, admin-only (non staff) — porting fedele di _esIsStaff_
-- reale, che nonostante il nome controlla solo ctx.role==='admin'.
-- Distinto da current_driver_is_staff_or_admin() (006) usato altrove.
create or replace function current_driver_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from drivers
    where auth_user_id = auth.uid()
      and role = 'admin'
  );
$$;

comment on function current_driver_is_admin() is 'SECURITY DEFINER: true solo se il chiamante è admin (non staff). Porting fedele di _esIsStaff_ reale in Races.js/EnduranceStints.js, che nonostante il nome fuorviante non accetta staff.';

-- SELECT: chiunque nel team, come da races.list/upcoming/get (solo
-- ctx richiesto, nessun controllo di ruolo).
create policy "races: il team legge tutte le gare"
  on races for select
  using (team_id = current_driver_team_id());

-- INSERT/UPDATE/DELETE "base": solo admin, come da races.add/update/remove.
create policy "races: solo admin creano"
  on races for insert
  with check (team_id = current_driver_team_id() and current_driver_is_admin());

create policy "races: solo admin aggiornano"
  on races for update
  using (team_id = current_driver_team_id() and current_driver_is_admin())
  with check (team_id = current_driver_team_id() and current_driver_is_admin());

create policy "races: solo admin cancellano"
  on races for delete
  using (team_id = current_driver_team_id() and current_driver_is_admin());

-- NOTA: updatePoster/updateGallery usano staff-or-admin nel sorgente,
-- più permissivo del gate admin-only sopra. RLS a livello di riga non
-- può distinguere "quali colonne" si stanno scrivendo con permessi
-- diversi nella stessa policy UPDATE — quel gate più permissivo vive
-- nell'Edge Function races-update-poster/races-update-gallery (che
-- usa current_driver_is_staff_or_admin() applicativamente prima di
-- scrivere), esattamente come già fatto per pitwall-log-session.

-- ─── Privilegi minimi (stesso schema di 004/008/009/010) ───

revoke all on races from anon;

revoke all on races from authenticated;
grant select, insert, update, delete on races to authenticated;
