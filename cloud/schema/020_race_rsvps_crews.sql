-- ═══════════════════════════════════════════════════════════
-- VSD-Paddock Cloud — Dominio RaceRSVP + RaceCrews (porting
-- fedele di apps-script/RaceRSVP.js + apps-script/RaceCrews.js)
-- ═══════════════════════════════════════════════════════════
-- race_rsvps: conferma presenza gara. Upsert per (race_id, driver_id)
-- imposto qui come UNIQUE constraint nativo — il sorgente lo fa con
-- una scansione manuale del foglio (cerca la riga esistente, altrimenti
-- appende), qui basta .upsert(onConflict:'race_id,driver_id') lato
-- Edge Function.
--
-- race_crews: equipaggi per gare con più vetture VSD sullo stesso
-- race_id (es. endurance). crew_id qui è un uuid nativo invece del
-- 'CREWnnn' testuale sequenziale del sorgente — DEVIAZIONE DELIBERATA:
-- a differenza di race_id/result_id, crew_id non è mai referenziato
-- da nessun altro dominio (grep confermato), è solo un identificativo
-- di riga. Niente bisogno quindi dello scan globale service-role usato
-- per races-add — un uuid è già univoco cross-team gratis.
-- ═══════════════════════════════════════════════════════════

create table race_rsvps (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references teams(id) on delete cascade,
  race_id      text not null references races(race_id) on delete cascade,
  driver_id    uuid not null references drivers(id) on delete cascade,
  status       text not null check (status in ('confirmed', 'declined', 'tentative')),
  note         text,
  responded_at timestamptz not null default now(),

  unique (race_id, driver_id)
);

comment on table race_rsvps is 'Conferma presenza gara per pilota. Porting fedele di RaceRSVP.js. Un pilota risponde solo per se stesso (driver_id forzato da current_driver_id() lato RLS e Edge Function).';

create index race_rsvps_race_idx on race_rsvps (race_id);

create table race_crews (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references teams(id) on delete cascade,
  race_id    text not null references races(race_id) on delete cascade,
  car_number text not null,
  driver_id  uuid not null references drivers(id) on delete cascade,
  notes      text,
  added_at   timestamptz not null default now(),
  added_by   uuid references drivers(id) on delete set null,

  unique (race_id, driver_id)
);

comment on table race_crews is 'Roster equipaggi: chi guida quale vettura su una gara. Porting fedele di RaceCrews.js — un pilota sta su una sola vettura per gara, imposto qui come unique(race_id, driver_id) invece che con la doppia scansione applicativa del sorgente (alreadyOnThisCar/onAnotherCar).';

create index race_crews_race_idx on race_crews (race_id);

-- ─── RLS ───

alter table race_rsvps enable row level security;
alter table race_crews enable row level security;

-- race_rsvps SELECT: qualsiasi membro del team (fedele — serve a tutta
-- la squadra sapere chi ci sarà, non solo allo staff).
create policy "race_rsvps: il team legge le risposte"
  on race_rsvps for select
  using (team_id = current_driver_team_id());

-- race_rsvps INSERT/UPDATE: un pilota risponde SOLO per se stesso.
create policy "race_rsvps: il pilota risponde come se stesso (insert)"
  on race_rsvps for insert
  with check (team_id = current_driver_team_id() and driver_id = current_driver_id());

create policy "race_rsvps: il pilota aggiorna la propria risposta"
  on race_rsvps for update
  using (team_id = current_driver_team_id() and driver_id = current_driver_id())
  with check (team_id = current_driver_team_id() and driver_id = current_driver_id());

-- race_crews SELECT: qualsiasi membro del team (fedele — stesso
-- livello di stints.list nel sorgente).
create policy "race_crews: il team legge gli equipaggi"
  on race_crews for select
  using (team_id = current_driver_team_id());

-- race_crews INSERT/UPDATE/DELETE: solo staff/admin.
create policy "race_crews: staff/admin assegnano"
  on race_crews for insert
  with check (team_id = current_driver_team_id() and current_driver_is_staff_or_admin());

create policy "race_crews: staff/admin rimuovono"
  on race_crews for delete
  using (team_id = current_driver_team_id() and current_driver_is_staff_or_admin());

-- ─── Privilegi minimi ───

revoke all on race_rsvps from anon;
revoke all on race_rsvps from authenticated;
grant select, insert, update on race_rsvps to authenticated;

revoke all on race_crews from anon;
revoke all on race_crews from authenticated;
grant select, insert, delete on race_crews to authenticated;
