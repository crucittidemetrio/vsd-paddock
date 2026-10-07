-- #470 (07/10/2026) — matching fuzzy nomi piloti nell'import risultati.
-- Estensioni gratuite pg_trgm + unaccent. Regola prudente: nome di battesimo
-- identico (normalizzato) + cognome simile (trigram >= 0.6) + nessun secondo
-- candidato entro 0.1. Verificato sui ~400 nomi esterni storici non abbinati:
-- 0 falsi positivi (la sola similarità sul nome intero ne dava 19).
-- Applicato come trigger BEFORE INSERT su race_results: vale per ogni import
-- (LMU/iRacing/ACE) senza modificare l'Edge Function.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

create or replace function public.normalize_driver_name(p text)
returns text language sql immutable set search_path = public, extensions as $$
  select trim(regexp_replace(regexp_replace(lower(extensions.unaccent(coalesce(p, ''))), '[^a-z ]+', ' ', 'g'), '\s+', ' ', 'g'))
$$;

create or replace function public.match_driver_names_fuzzy(p_team uuid, p_names text[], p_min real default 0.6)
returns table(name text, driver_id uuid, score real)
language sql stable security definer set search_path = public, extensions as $$
  with input as (
    select distinct n as name,
           split_part(public.normalize_driver_name(n), ' ', 1) as first,
           replace(nullif(regexp_replace(public.normalize_driver_name(n), '^\S+\s*', ''), ''), ' ', '') as surname
    from unnest(p_names) n where coalesce(trim(n), '') <> ''
  ), cand as (
    select d.id,
           split_part(public.normalize_driver_name(d.real_name), ' ', 1) as first,
           replace(nullif(regexp_replace(public.normalize_driver_name(d.real_name), '^\S+\s*', ''), ''), ' ', '') as surname
    from drivers d
    where d.team_id = p_team and coalesce(d.is_system_account, false) = false and coalesce(d.real_name, '') <> ''
  ), scored as (
    select i.name, c.id, extensions.similarity(i.surname, c.surname)::real as s
    from input i join cand c on c.first = i.first
    where i.surname is not null and c.surname is not null and length(i.surname) >= 3
  ), ranked as (
    select name, id, s,
           row_number() over (partition by name order by s desc) as rk,
           lead(s) over (partition by name order by s desc) as next_s
    from scored
  )
  select name, id, s from ranked
  where rk = 1 and s >= p_min and (next_s is null or s - next_s >= 0.1)
$$;

revoke all on function public.match_driver_names_fuzzy(uuid, text[], real) from public, anon, authenticated;
grant execute on function public.match_driver_names_fuzzy(uuid, text[], real) to service_role;

create or replace function public.race_results_fuzzy_driver()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  if new.driver_id is null and coalesce(trim(new.driver_name_external), '') <> '' and new.team_id is not null then
    select m.driver_id into v_id
    from public.match_driver_names_fuzzy(new.team_id, array[new.driver_name_external], 0.6) m
    limit 1;
    if v_id is not null then
      new.driver_id := v_id;
      new.is_vsd_driver := true;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_race_results_fuzzy_driver on public.race_results;
create trigger trg_race_results_fuzzy_driver
  before insert on public.race_results
  for each row execute function public.race_results_fuzzy_driver();
