-- ═══════════════════════════════════════════════════════════
-- VSD-Paddock Cloud — Dominio Pit Wall Sessions (porting di apps-script/PitwallSessions.js)
-- ═══════════════════════════════════════════════════════════
-- Logica di riferimento reale (letta dal file sorgente, non a
-- memoria):
--
--   pitwall.logSession → il VSD Pitwall Bridge (.NET locale) legge lo
--                         Scoring buffer di LMU per TUTTA la griglia e
--                         manda uno snapshot di fine sessione: miglior
--                         giro di ogni pilota visto in griglia (non
--                         solo il pilota locale). Gated su staff/admin
--                         (chi gestisce il bridge scrive per tutta la
--                         griglia, stesso livello di lapData.import).
--                         Dedup per (session_id, driver_key): stessa
--                         sessione + stesso pilota → overwrite
--                         sull'ultimo dato (bridge riavviato sulla
--                         stessa sessione), non un nuovo record.
--   pitwall.sessions   → elenco sessioni registrate (chiunque nel
--                         team), raggruppate per session_id.
--   pitwall.session    → dettaglio di UNA sessione: classifica per
--                         miglior giro (tempi assenti in coda).
--
-- Deliberatamente NON scrive in best_laps (laps.add/Muro dei Record):
-- un giro catturato in una sessione di prove libere qualsiasi non è
-- automaticamente un record ufficiale — track_name/vehicle_name qui
-- restano testo libero (stesso principio "car_id può non matchare"
-- già visto in 009 per best_laps). Se un giro merita di diventare un
-- record ufficiale, lo staff lo aggiunge a mano con laps.add.
--
-- Il matching nome-esterno→driver_id (matchDriverName_ nel sistema
-- reale: match esatto, poi "nome i.", poi prefisso cognome da
-- real_name) è replicato nell'Edge Function pitwall-log-session, non
-- qui — è logica applicativa di risoluzione, non uno schema/RLS
-- concern.
--
-- FUORI SCOPE da questa migrazione: il relay Realtime per viewer
-- remoti (la parte "live", non lo snapshot di fine sessione) — è un
-- cambio architetturale sul bridge C# (deve pushare frame in tempo
-- reale a un canale Supabase Realtime, non solo un JSON di fine
-- sessione via REST) più una nuova vista frontend, non una semplice
-- porting di endpoint esistenti. Tracciato come task separato.
-- ═══════════════════════════════════════════════════════════

create table pitwall_sessions (
  id                    uuid primary key default gen_random_uuid(),
  team_id               uuid not null references teams(id) on delete cascade,

  session_id            text not null,
  captured_at           timestamptz not null default now(),
  track_name            text,
  sim                   text not null default 'LMU',
  session_type          integer,

  driver_id             uuid references drivers(id) on delete set null,
  driver_name_external  text,
  is_vsd_driver         boolean not null default false,

  vehicle_name          text,
  vehicle_class         text,
  best_lap_time_ms      integer,
  laps_completed        integer,
  final_place           integer,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table pitwall_sessions is 'Snapshot di fine sessione dal VSD Pitwall Bridge: miglior giro per pilota (VSD o esterno) visto in griglia. Porting di PitwallSessions.js.';

-- Dedup applicativo (non un constraint unique secco): il sistema
-- reale usa come chiave matchedDriverId se c'è, altrimenti il nome
-- esterno lowercased — due colonne mutuamente esclusive, un unique
-- index secco su entrambe non esprime bene l'OR. La dedup/upsert vive
-- nell'Edge Function (select prima, poi insert o update), stesso
-- principio del sistema reale (existingRowByKey costruito a mano).
-- Indice comunque utile per la lookup di dedup e per pitwall.session.
create index pitwall_sessions_team_session_idx on pitwall_sessions (team_id, session_id);
create index pitwall_sessions_driver_idx on pitwall_sessions (team_id, session_id, driver_id) where driver_id is not null;

-- ─── RLS ───

alter table pitwall_sessions enable row level security;

-- SELECT: chiunque nel team, come da handlePitwallSessions/Session.
create policy "pitwall_sessions: il team legge tutte le sessioni"
  on pitwall_sessions for select
  using (team_id = current_driver_team_id());

-- INSERT/UPDATE: solo staff/admin (chi gestisce il bridge), come da
-- handlePitwallLogSession (ctx.isStaff richiesto).
create policy "pitwall_sessions: solo staff/admin registrano"
  on pitwall_sessions for insert
  with check (team_id = current_driver_team_id() and current_driver_is_staff_or_admin());

create policy "pitwall_sessions: solo staff/admin aggiornano"
  on pitwall_sessions for update
  using (team_id = current_driver_team_id() and current_driver_is_staff_or_admin())
  with check (team_id = current_driver_team_id() and current_driver_is_staff_or_admin());

-- Nessuna policy DELETE: il sistema reale non espone un handler di
-- rimozione per questo dominio — non se ne inventa uno qui.

-- ─── Privilegi minimi (stesso schema di 004/008/009) ───

revoke all on pitwall_sessions from anon;

revoke all on pitwall_sessions from authenticated;
grant select, insert, update on pitwall_sessions to authenticated;
