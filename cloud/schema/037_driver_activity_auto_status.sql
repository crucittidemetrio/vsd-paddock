-- ═══════════════════════════════════════════════════════════
-- #467 — Stato attivo/inattivo automatico dei piloti (10/10/2026)
-- ═══════════════════════════════════════════════════════════
-- Regola (concordata con Demetrio):
--   • attività = QUALSIASI tra: risultato gara importato, best lap,
--     best lap inviato, RSVP gara/sessione, inserimento in equipaggio,
--     sessione fuel/lap data, attività Discord (ruolo Statbot
--     "Attivo del Mese", letto ogni lunedì da notifications-cron).
--   • 45 giorni senza attività → avviso staff (digest settimanale).
--   • 60 giorni → status 'inactive' automatico.
--   • qualsiasi attività entro 60 giorni → torna 'active' subito
--     (al giro giornaliero successivo).
--   • esclusi: nuovi ingressi < 30 giorni, status 'trial', ex VSD
--     (removed_at), account di sistema, piloti con status_locked.
--
-- Override staff SENZA nuova UI (trigger trg_drivers_manual_status):
--   • staff imposta a mano 'inactive' → status_locked = true (pausa
--     dichiarata: l'automatismo non lo riattiva).
--   • staff imposta a mano 'active' → status_locked = false e
--     status_manual_at = now(): riparte un periodo pieno di 60 giorni.
-- Le modifiche fatte dalla funzione automatica impostano la GUC
-- vsd.auto_status = 'on' e non toccano il lock.
--
-- Esecuzione: pg_cron ogni giorno alle 04:00 UTC (SQL puro, nessuna
-- Edge Function aggiuntiva — siamo al tetto del piano free).
-- Ogni cambio di stato → riga in audit_log (action 'roster.auto_status').
-- ═══════════════════════════════════════════════════════════

alter table public.drivers
  add column if not exists last_activity_at     timestamptz,
  add column if not exists last_activity_source text,
  add column if not exists discord_active_at    timestamptz,
  add column if not exists status_locked        boolean not null default false,
  add column if not exists status_manual_at     timestamptz;

-- ─── Override manuale staff ───
create or replace function public.drivers_manual_status_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is distinct from old.status
     and coalesce(current_setting('vsd.auto_status', true), '') <> 'on' then
    new.status_manual_at := now();
    if new.status = 'inactive' then
      new.status_locked := true;
    elsif new.status = 'active' then
      new.status_locked := false;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_drivers_manual_status on public.drivers;
create trigger trg_drivers_manual_status
  before update of status on public.drivers
  for each row execute function public.drivers_manual_status_guard();

revoke execute on function public.drivers_manual_status_guard() from public, anon, authenticated;

-- ─── Calcolo attività + applicazione stato ───
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

revoke execute on function public.refresh_driver_activity(boolean, int, int, int) from public, anon, authenticated;
grant execute on function public.refresh_driver_activity(boolean, int, int, int) to service_role;

-- ─── Schedulazione giornaliera ───
select cron.unschedule(jobid) from cron.job where jobname in ('roster-activity-daily', 'notif-roster-activity');
select cron.schedule('roster-activity-daily', '0 4 * * *', $$select public.refresh_driver_activity(true)$$);
-- Lunedì 06:00 UTC: segnale Discord (ruolo Statbot) + digest staff
-- (notifications-cron?check=rosterActivity → api/discord-role-members).
select cron.schedule('notif-roster-activity', '0 6 * * 1', $$select net.http_post(url:='https://cjbwhrrtxhckbkyxfdgm.supabase.co/functions/v1/notifications-cron?check=rosterActivity', headers:='{"Content-Type":"application/json"}'::jsonb) $$);
