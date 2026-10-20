-- ═══════════════════════════════════════════════════════════
-- 039 — Best lap automatici dal plugin SimHub (ACE, poi altri sim)
-- ═══════════════════════════════════════════════════════════
-- Flusso: plugin SimHub (VsdLapDataLogger) → best-laps-add con device
-- token → risoluzione pista/auto → best_laps solo se migliora il
-- personale del pilota su (sim, pista, auto).
--
-- sim_name_aliases: nome grezzo del gioco (TrackId/CarModel di SimHub)
--   → id del nostro catalogo (tracks.track_id / cars.car_id). Si
--   popola da solo quando il fuzzy match è sicuro, altrimenti lo staff
--   abbina a mano dal pannello Best Laps (tab "Giri SimHub").
-- auto_lap_inbox: OGNI giro valido ricevuto (anche non record), così
--   resta traccia per l'attività pilota e per riprocessare i giri non
--   abbinati dopo che lo staff ha creato l'alias.
-- ═══════════════════════════════════════════════════════════

create table if not exists public.sim_name_aliases (
  team_id    uuid not null references public.teams(id) on delete cascade,
  sim        text not null,
  kind       text not null check (kind in ('track', 'car')),
  raw_key    text not null,               -- lower(trim(nome grezzo))
  mapped_id  text not null,               -- tracks.track_id / cars.car_id
  source     text not null default 'auto' check (source in ('auto', 'staff')),
  score      real,
  created_at timestamptz not null default now(),
  primary key (team_id, sim, kind, raw_key)
);

create table if not exists public.auto_lap_inbox (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references public.teams(id) on delete cascade,
  driver_id     uuid not null references public.drivers(id) on delete cascade,
  sim           text not null,
  raw_track     text not null,
  raw_track_alt text,
  raw_car       text not null,
  raw_car_alt   text,
  track_id      text,
  car_id        text,
  lap_time_ms   integer not null check (lap_time_ms > 0),
  sector1_ms    integer,
  sector2_ms    integer,
  sector3_ms    integer,
  session_type  text,
  air_temp_c    numeric,
  track_temp_c  numeric,
  plugin_version text,
  status        text not null default 'unmapped'
                check (status in ('unmapped', 'imported', 'not_pb', 'rejected')),
  best_lap_id   uuid references public.best_laps(id) on delete set null,
  created_at    timestamptz not null default now(),
  processed_at  timestamptz
);

create index if not exists auto_lap_inbox_team_status_idx on public.auto_lap_inbox (team_id, status);
create index if not exists auto_lap_inbox_driver_idx on public.auto_lap_inbox (driver_id);
create index if not exists auto_lap_inbox_best_lap_idx on public.auto_lap_inbox (best_lap_id);

-- Accesso solo via Edge Function (service role): RLS attiva, nessuna policy.
alter table public.sim_name_aliases enable row level security;
alter table public.auto_lap_inbox   enable row level security;

-- ─── Risoluzione nome grezzo → id catalogo ───
-- 1) alias esatto su uno qualsiasi dei candidati
-- 2) altrimenti miglior similarità trigram (unaccent) sul catalogo del sim
create or replace function public.resolve_sim_name(
  p_team uuid, p_sim text, p_kind text, p_candidates text[]
)
returns table (mapped_id text, score real, via text)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  select a.mapped_id, coalesce(a.score, 1)::real, 'alias'::text
    into mapped_id, score, via
    from sim_name_aliases a
   where a.team_id = p_team and a.sim = p_sim and a.kind = p_kind
     and a.raw_key = any (select lower(trim(x)) from unnest(p_candidates) x where x is not null and trim(x) <> '')
   limit 1;
  if found then return next; return; end if;

  if p_kind = 'track' then
    return query
    select t.track_id,
           max(greatest(
             similarity(unaccent(lower(t.track_name || ' ' || coalesce(t.variant, ''))), unaccent(lower(x))),
             similarity(unaccent(lower(t.track_name)), unaccent(lower(x))),
             similarity(unaccent(lower(replace(t.track_id, '-', ' '))), unaccent(lower(x)))
           ))::real s,
           'fuzzy'::text
      from tracks t, unnest(p_candidates) x
     where t.sim = p_sim and coalesce(t.active, true) and x is not null and trim(x) <> ''
     group by t.track_id
     order by s desc
     limit 1;
  else
    return query
    select k.car_id,
           max(greatest(
             similarity(unaccent(lower(k.car_name)), unaccent(lower(x))),
             similarity(unaccent(lower(coalesce(k.full_name, k.car_name))), unaccent(lower(x))),
             similarity(unaccent(lower(replace(k.car_id, '-', ' '))), unaccent(lower(x)))
           ))::real s,
           'fuzzy'::text
      from cars k, unnest(p_candidates) x
     where k.sim = p_sim and coalesce(k.active, true) and x is not null and trim(x) <> ''
     group by k.car_id
     order by s desc
     limit 1;
  end if;
end;
$$;

revoke execute on function public.resolve_sim_name(uuid, text, text, text[]) from public, anon, authenticated;
grant execute on function public.resolve_sim_name(uuid, text, text, text[]) to service_role;

-- ─── Attività pilota (#467): anche i giri SimHub contano ───
-- Stessa funzione di 037, con auto_lap_inbox aggiunto alla union delle sorgenti.
create or replace function public.refresh_driver_activity(
  p_apply         boolean default true,
  p_warn_days     int     default 45,
  p_inactive_days int     default 60,
  p_grace_days    int     default 30
)
returns table (
  driver_code   text,
  display_name  text,
  old_status    text,
  new_status    text,
  last_activity date,
  source        text,
  days_idle     int,
  warning       boolean,
  locked        boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 1) ultima attività per pilota (eventi futuri clampati a now())
  with ev as (
    select r.driver_id, least(max(coalesce(r.set_date::timestamptz, r.imported_at)), now()) t, 'gara'::text src
      from race_results r where r.driver_id is not null group by r.driver_id
    union all select b.driver_id, least(max(coalesce(b.set_date::timestamptz, b.created_at)), now()), 'best lap' from best_laps b group by b.driver_id
    union all select s.driver_id, max(s.submitted_at), 'best lap inviato' from best_lap_submissions s group by s.driver_id
    union all select v.driver_id, max(v.responded_at), 'presenza gara' from race_rsvps v group by v.driver_id
    union all select v.driver_id, max(v.responded_at), 'presenza sessione' from session_rsvps v group by v.driver_id
    union all select c.driver_id, max(c.added_at), 'equipaggio' from race_crews c group by c.driver_id
    union all select f.driver_id, max(f.created_at), 'carburante' from fuel_log f where f.driver_id is not null group by f.driver_id
    union all select l.driver_id, max(l.imported_at), 'dati giro' from lap_data l where l.driver_id is not null group by l.driver_id
    union all select x.driver_id, max(x.created_at), 'giro SimHub' from auto_lap_inbox x group by x.driver_id
    union all select d.id, d.discord_active_at, 'Discord' from drivers d where d.discord_active_at is not null
  ),
  best as (
    select distinct on (ev.driver_id) ev.driver_id, ev.t, ev.src
      from ev where ev.t is not null
     order by ev.driver_id, ev.t desc
  )
  update drivers d
     set last_activity_at = best.t,
         last_activity_source = best.src
    from best
   where d.id = best.driver_id
     and (d.last_activity_at is distinct from best.t or d.last_activity_source is distinct from best.src);

  -- 2) valutazione stato
  drop table if exists _eval;
  create temp table _eval on commit drop as
  select d.id, d.team_id, d.driver_code, d.display_name, d.status as old_status,
         d.last_activity_at, d.last_activity_source, d.status_locked,
         -- riferimento: ultima attività, o ingresso, o ultima modifica manuale staff
         (current_date - greatest(
            coalesce(d.last_activity_at::date, '-infinity'::date),
            coalesce(d.join_date, d.created_at::date),
            coalesce(d.status_manual_at::date, '-infinity'::date)
         ))::int as days_idle,
         coalesce(d.join_date, d.created_at::date) > current_date - p_grace_days as in_grace
    from drivers d
   where d.removed_at is null
     and coalesce(d.is_system_account, false) = false
     and d.status in ('active', 'inactive');

  alter table _eval add column new_status text;
  update _eval e set new_status = case
      when e.status_locked or e.in_grace then e.old_status
      when e.days_idle >= p_inactive_days then 'inactive'
      else 'active'
    end
   where true;  -- pg_safeupdate (attivo sulle chiamate RPC) rifiuta UPDATE senza WHERE

  if p_apply then
    perform set_config('vsd.auto_status', 'on', true);
    update drivers d set status = e.new_status, updated_at = now()
      from _eval e
     where d.id = e.id and e.new_status <> e.old_status;
    perform set_config('vsd.auto_status', 'off', true);

    insert into audit_log (team_id, driver_id, action, target_id, details)
    select e.team_id, e.id, 'roster.auto_status', e.driver_code,
           e.old_status || ' → ' || e.new_status || ' (' || e.days_idle || ' giorni senza attività'
             || coalesce(', ultima: ' || e.last_activity_source, '') || ')'
      from _eval e where e.new_status <> e.old_status;
  end if;

  return query
  select e.driver_code, e.display_name, e.old_status, e.new_status,
         e.last_activity_at::date, e.last_activity_source, e.days_idle,
         (e.new_status = 'active' and not e.status_locked and not e.in_grace
            and e.days_idle >= p_warn_days),
         e.status_locked
    from _eval e
   order by e.days_idle desc;
end;
$$;

