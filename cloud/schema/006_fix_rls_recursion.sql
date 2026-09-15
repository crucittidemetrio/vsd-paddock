-- ═══════════════════════════════════════════════════════════
-- VSD-Paddock Cloud — Fix: ricorsione infinita nelle policy drivers
-- ═══════════════════════════════════════════════════════════
-- Bug scoperto testando le Edge Function roster-list/roster-get in
-- produzione: "infinite recursion detected in policy for relation
-- drivers". Causa: le policy 002 "self o staff/admin leggono il
-- dettaglio privato" (SELECT) e "solo staff/admin possono scrivere"
-- (UPDATE) contenevano un EXISTS con subquery DIRETTA su `drivers`
-- (aliased `me`) per verificare role IN staff/admin. Postgres
-- rivaluta la policy della tabella per QUELLA subquery, che quindi
-- ricorre su se stessa all'infinito.
--
-- current_driver_team_id() (003/001) non soffriva di questo perché è
-- SECURITY DEFINER di proprietà di `postgres`, che possiede anche la
-- tabella `drivers` — Postgres esenta di default il proprietario
-- tabella da RLS (relforcerowsecurity=false), quindi la query interna
-- alla funzione bypassa le policy invece di rivalutarle. Le due
-- policy che usavano un EXISTS inline su drivers, invece, giravano
-- con il ruolo del CHIAMANTE (authenticated), quindi RLS si
-- riapplicava e ricorreva.
--
-- Fix: stesso pattern di current_driver_team_id() — un secondo helper
-- SECURITY DEFINER che verifica staff/admin, così la subquery bypassa
-- RLS invece di rientrarci.
-- ═══════════════════════════════════════════════════════════

create or replace function current_driver_is_staff_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from drivers
    where auth_user_id = auth.uid()
      and role = any(array['staff', 'admin'])
  );
$$;

comment on function current_driver_is_staff_or_admin() is 'SECURITY DEFINER: true se il chiamante è staff/admin. Bypassa RLS (owner=postgres=owner tabella drivers), evita la ricorsione che si otterrebbe con un EXISTS inline su drivers dentro una policy di drivers.';

drop policy if exists "drivers: self o staff/admin leggono il dettaglio privato" on drivers;
create policy "drivers: self o staff/admin leggono il dettaglio privato"
  on drivers for select
  using (
    auth_user_id = auth.uid()
    or (team_id = current_driver_team_id() and current_driver_is_staff_or_admin())
  );

drop policy if exists "drivers: solo staff/admin possono scrivere" on drivers;
create policy "drivers: solo staff/admin possono scrivere"
  on drivers for update
  using (
    team_id = current_driver_team_id()
    and current_driver_is_staff_or_admin()
  );
