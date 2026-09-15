-- ═══════════════════════════════════════════════════════════
-- VSD-Paddock Cloud — Dominio Calendario: team_sessions + session_rsvps
-- ═══════════════════════════════════════════════════════════
-- Porting di apps-script/TeamSessionsScheduler.js (Fase 1 + Fase 2).
-- Logica di riferimento reale (letta dal file sorgente, non a
-- memoria):
--
--   teamSessions.list   → chiunque sia loggato nel team (non solo
--                          staff): il team deve sapere quando sono
--                          gli allenamenti.
--   teamSessions.create → tipi "aperti" (allenamento_libero,
--                          allenamento_collettivo) creabili da
--                          QUALSIASI driver; gli altri tipi
--                          (qualifica, evento_esterno, riunione)
--                          restano riservati a staff/admin.
--                          created_by SEMPRE dal contesto (chi
--                          chiama), mai dal payload.
--   teamSessions.update → solo staff/admin, qualunque campo.
--   teamSessions.remove → staff/admin su qualunque sessione, oppure
--                          l'autore stesso se il tipo è "aperto".
--                          Cascata sulle RSVP legate.
--   sessionRsvp.list    → chiunque sia loggato nel team.
--   sessionRsvp.set     → upsert della PROPRIA riga soltanto, per
--                          (session_id, driver_id) — mai la riga di
--                          qualcun altro.
--
-- Differenza dal sistema reale: lì session_id/rsvp_id sono stringhe
-- generate lato server (session_<timestamp>_<rand>). Qui è un uuid
-- nativo Postgres: stessa proprietà (opaco, generato server-side,
-- mai indovinabile), niente da portare 1:1 perché non è referenziato
-- da nessun altro dominio con quel formato specifico.
--
-- Le notifiche Discord (Fase 3: notifyTeamSessionCreated_ e i
-- reminder 24h/2h) NON sono portate in questa migrazione — sono
-- comportamento "best-effort, non bloccante" lato applicativo, non
-- schema/RLS. Si aggiungono più avanti nell'Edge Function di create
-- senza toccare questa migrazione.
-- ═══════════════════════════════════════════════════════════

-- ─── Helper: driver corrente (id, non solo team) ───
-- Stesso pattern SECURITY DEFINER di current_driver_team_id() /
-- current_driver_is_staff_or_admin() (001/006) — qui serve per
-- confrontare created_by/driver_id con "chi sta chiamando" dentro le
-- policy di team_sessions/session_rsvps, senza ripetere la subquery
-- ogni volta. Fissato search_path da subito (imparato da 003, non
-- da rifare come fix successivo).
create or replace function current_driver_id()
returns uuid
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select id from drivers where auth_user_id = auth.uid() limit 1;
$$;

comment on function current_driver_id() is 'SECURITY DEFINER: id del driver collegato al chiamante corrente, o null se non collegato.';

-- ─── TEAM_SESSIONS ───
create table team_sessions (
  id                uuid primary key default gen_random_uuid(),
  team_id           uuid not null references teams(id) on delete cascade,

  type              text not null,     -- vedi check sotto
  title             text not null,
  championship_id   text,
  event_id          text,
  track_id          text,
  sim               text,              -- 'LMU' | 'IRC' | 'ACE' | null, libero come nel sistema reale
  datetime_start    timestamptz not null,
  duration_min      integer not null default 60,
  discord_channel   text,
  notes             text,

  created_by        uuid references drivers(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint team_sessions_type_check check (
    type in ('allenamento_libero', 'allenamento_collettivo', 'qualifica', 'evento_esterno', 'riunione')
  )
);

comment on table team_sessions is 'Sessioni team (allenamenti/qualifiche/riunioni). Porting di TeamSessionsScheduler.js.';

-- ─── SESSION_RSVPS ───
-- FK on delete cascade sostituisce deleteSessionRsvpsForSession_
-- (loop manuale in Apps Script): qui è strutturale, Postgres lo
-- garantisce da solo.
create table session_rsvps (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references team_sessions(id) on delete cascade,
  driver_id     uuid not null references drivers(id) on delete cascade,
  status        text not null,
  note          text,
  responded_at  timestamptz not null default now(),

  constraint session_rsvps_status_check check (status in ('confirmed', 'declined', 'tentative')),
  unique (session_id, driver_id)
);

comment on table session_rsvps is 'RSVP di un driver per una sessione team. unique(session_id, driver_id) garantisce l''upsert "una sola riga per pilota per sessione" a livello di schema, non solo applicativo.';

-- ─── RLS ───

alter table team_sessions enable row level security;
alter table session_rsvps enable row level security;

-- SELECT: chiunque nel team, come da handleTeamSessionsList.
create policy "team_sessions: il team legge tutte le sessioni"
  on team_sessions for select
  using (team_id = current_driver_team_id());

-- INSERT: tipi aperti → chiunque nel team; altri tipi → solo staff/admin.
-- created_by deve sempre essere il chiamante (mai un valore arbitrario
-- dal payload) — qui è la RLS stessa a impedirlo, non solo l'Edge
-- Function che lo imposta.
create policy "team_sessions: crea chi può, secondo il tipo"
  on team_sessions for insert
  with check (
    team_id = current_driver_team_id()
    and created_by = current_driver_id()
    and (
      type = any(array['allenamento_libero', 'allenamento_collettivo'])
      or current_driver_is_staff_or_admin()
    )
  );

-- UPDATE: solo staff/admin, qualunque campo (handleTeamSessionsUpdate
-- non ha un percorso "autore modifica la propria sessione aperta" —
-- solo la remove ce l'ha).
create policy "team_sessions: solo staff/admin aggiornano"
  on team_sessions for update
  using (team_id = current_driver_team_id() and current_driver_is_staff_or_admin())
  with check (team_id = current_driver_team_id() and current_driver_is_staff_or_admin());

-- DELETE: staff/admin su qualunque sessione, oppure l'autore stesso
-- se il tipo è ancora "aperto" al momento della cancellazione.
create policy "team_sessions: staff o autore (se tipo aperto) cancellano"
  on team_sessions for delete
  using (
    team_id = current_driver_team_id()
    and (
      current_driver_is_staff_or_admin()
      or (created_by = current_driver_id() and type = any(array['allenamento_libero', 'allenamento_collettivo']))
    )
  );

-- session_rsvps: SELECT chiunque nel team (join su team_sessions per
-- lo scoping, niente team_id denormalizzato qui — una riga sola in
-- più da mantenere sincronizzata non vale la duplicazione).
create policy "session_rsvps: il team legge tutte le risposte"
  on session_rsvps for select
  using (
    exists (
      select 1 from team_sessions ts
      where ts.id = session_rsvps.session_id
        and ts.team_id = current_driver_team_id()
    )
  );

-- session_rsvps: INSERT/UPDATE solo della PROPRIA riga — upsert per
-- (session_id, driver_id), mai la riga di qualcun altro. Lo unique
-- constraint sopra rende l'upsert atomico lato Edge Function
-- (supabase .upsert(..., { onConflict: 'session_id,driver_id' })).
create policy "session_rsvps: il driver inserisce la propria risposta"
  on session_rsvps for insert
  with check (
    driver_id = current_driver_id()
    and exists (
      select 1 from team_sessions ts
      where ts.id = session_rsvps.session_id
        and ts.team_id = current_driver_team_id()
    )
  );

create policy "session_rsvps: il driver aggiorna la propria risposta"
  on session_rsvps for update
  using (driver_id = current_driver_id())
  with check (
    driver_id = current_driver_id()
    and exists (
      select 1 from team_sessions ts
      where ts.id = session_rsvps.session_id
        and ts.team_id = current_driver_team_id()
    )
  );

-- ─── Privilegi minimi (stesso schema di 004) ───
-- Le tabelle nascono già chiuse per anon/authenticated grazie alla
-- "alter default privileges" di 004 (applicata a schema public, ruolo
-- postgres) — questi grant espliciti sono comunque scritti a mano,
-- stesso principio "non fidarsi del default silenzioso" del resto di
-- questo schema.

revoke all on team_sessions from anon;
revoke all on session_rsvps from anon;

revoke all on team_sessions from authenticated;
grant select, insert, update, delete on team_sessions to authenticated;

revoke all on session_rsvps from authenticated;
grant select, insert, update on session_rsvps to authenticated;
