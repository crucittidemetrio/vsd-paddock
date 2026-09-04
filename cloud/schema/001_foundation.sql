-- ═══════════════════════════════════════════════════════════
-- VSD-Paddock Cloud — Fondamenta: teams + drivers + RLS
-- ═══════════════════════════════════════════════════════════
-- Vedi docs/ADR-multi-team-saas.md (Opzione D) per il contesto.
--
-- Questo schema NON tocca apps-script/ né VSD_HUB_DB. È il primo
-- pezzo di un backend parallelo su Supabase, pensato per team
-- multipli. VSD stesso non è ancora su questo stack.
--
-- Filosofia sui campi: i nomi e i tipi di `drivers` rispecchiano
-- quelli reali già in produzione (DRIVER_PUBLIC_FIELDS e
-- DRIVER_PRIVATE_EXTRA_FIELDS in apps-script/Codice.js), non uno
-- schema "SaaS" generico. Dove cambia qualcosa, è commentato.
-- ═══════════════════════════════════════════════════════════

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ─── TEAMS ───
-- Concetto che oggi non esiste da nessuna parte nel sistema attuale
-- (VSD è implicito, unico, hardcoded). Ogni team pagante è una riga qui.
create table teams (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,           -- es. 'vsd', usato in URL/subdomain
  name          text not null,                  -- es. 'VSD Virtual Sim Driver'
  discord_guild_id text,                        -- per notifiche Discord native, come oggi
  plan          text not null default 'trial',  -- trial | active | suspended — gate billing (Task #181)
  created_at    timestamptz not null default now()
);

comment on table teams is 'Un team pagante (o in trial). VSD stesso diventerà una riga qui solo quando/se deciderà di migrare — vedi ADR Opzione D.';

-- ─── DRIVERS ───
-- Nel sistema attuale: tab "Drivers" del foglio Google, driver_id
-- globale formato VSD0xx. Qui driver_code è unico PER TEAM, non
-- globalmente — due team diversi possono avere entrambi un
-- "VSD001" o un "DRV001" senza collisione.
create table drivers (
  id                uuid primary key default gen_random_uuid(),
  team_id           uuid not null references teams(id) on delete cascade,
  auth_user_id      uuid references auth.users(id) on delete set null,
  driver_code       text not null,              -- era 'driver_id' (es. VSD026)

  -- campi pubblici (DRIVER_PUBLIC_FIELDS in Codice.js) —
  -- esposti via vista drivers_public sotto, senza filtro applicativo manuale
  display_name      text not null,
  role              text not null default 'driver',   -- driver | staff | admin — determina tier auth, come oggi
  status            text not null default 'active',   -- active | inactive — filtro roster.list
  join_date         date,
  nationality       text,
  preferred_sims    text[],                     -- era CSV in una cella, qui array nativo
  specialties       text[],
  avatar_url        text,
  bio               text,
  iracing_id        text,
  lmu_id            text,
  ace_id            text,
  discord_id        text,
  race_number       text,
  instagram         text,
  facebook          text,
  roster_track      text,                       -- 'competitivo' | 'amatoriale' (Task #80)

  -- campi privati (DRIVER_PRIVATE_EXTRA_FIELDS) — MAI nella vista pubblica
  real_name         text,
  email             text,
  can_message       boolean not null default false,   -- Task #104-108

  -- gestione ex-driver (oggi: removed_at + is_ex_vsd derivato in Roster.js)
  removed_at        timestamptz,

  -- account di sistema tipo 'VSD001' (escluso dal roster pubblico in
  -- Roster.js riga 28 con un confronto hardcoded sul driver_id) — qui
  -- è un flag esplicito invece di un valore magico nel codice.
  is_system_account boolean not null default false,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (team_id, driver_code)
);

comment on table drivers is 'Un pilota/membro di un team. auth_user_id è nullable: un driver può esistere prima di aver mai fatto login (come oggi in Drivers).';

-- ─── RLS ───

alter table teams enable row level security;
alter table drivers enable row level security;

-- Helper: team dell'utente autenticato corrente. security definer
-- perché deve poter leggere drivers anche se la policy su drivers
-- non è ancora valutata (evita ricorsione).
create or replace function current_driver_team_id()
returns uuid
language sql
security definer
stable
as $$
  select team_id from drivers where auth_user_id = auth.uid() limit 1;
$$;

create policy "teams: solo il proprio team"
  on teams for select
  using (id = current_driver_team_id());

create policy "drivers: solo il proprio team"
  on drivers for select
  using (team_id = current_driver_team_id());

create policy "drivers: solo staff/admin possono scrivere"
  on drivers for update
  using (
    team_id = current_driver_team_id()
    and exists (
      select 1 from drivers me
      where me.auth_user_id = auth.uid()
        and me.role in ('staff', 'admin')
    )
  );

-- ─── VISTA PUBBLICA ───
-- Sostituisce il filtro manuale DRIVER_PUBLIC_FIELDS applicato a mano
-- in ogni handler Apps Script: qui è strutturale, non serve ricordarsi
-- di applicarlo — la vista espone solo colonne pubbliche per design.
create view drivers_public as
select
  id, team_id, driver_code, display_name, role, status, join_date,
  nationality, preferred_sims, specialties, avatar_url, bio,
  iracing_id, lmu_id, ace_id, discord_id, race_number,
  instagram, facebook, roster_track,
  (removed_at is not null) as is_ex_driver,
  removed_at
from drivers
where is_system_account = false;

comment on view drivers_public is 'Colonne pubbliche only — access_code/real_name/email/can_message non ci sono per costruzione, non per disciplina.';
