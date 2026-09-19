-- ═══════════════════════════════════════════════════════════
-- VSD-Paddock Cloud — Fase 3, dominio #255: sei sotto-domini
-- amministrativi/community indipendenti, portati insieme perché
-- piccoli e strutturalmente simili (liste CRUD con auth a livelli
-- diversi). Fonti reali:
--   ChampionshipInterest.js  → championship_interest
--   PrequalCandidates.js     → prequal_candidates
--   Candidates.js            → candidates
--   Sponsors.js               → sponsors
--   Treasury.js               → treasury_entries
--   Consent.js                → consents
-- ═══════════════════════════════════════════════════════════

-- ─── ChampionshipInterest ───
-- Manifestazione di interesse per campionati esterni (ACI LMGT3, ERA
-- S3, ...). Pubblico in lettura/registrazione (fedele al sorgente,
-- stesso principio di clash_participants — vedi nota architetturale
-- in 021_clash_of_classes.sql per team_slug + client service role
-- nelle Edge Function pubbliche di questo file).
create table championship_interest (
  id                uuid primary key default gen_random_uuid(),
  team_id           uuid not null references teams(id) on delete cascade,

  championship_key  text not null,
  driver_id         uuid references drivers(id) on delete set null,
  display_name      text not null,
  category          text,
  vehicle            text,
  discord_handle     text,
  note               text,
  registered_at      timestamptz not null default now(),
  status             text not null default 'registered' check (status in ('registered', 'withdrawn'))
);

comment on table championship_interest is 'Porting fedele di ChampionshipInterest.js. Dedup per driver_id OR display_name (case-insensitive) tra i non-withdrawn dello stesso championship_key, applicativo (stesso principio di clash_participants).';

create index championship_interest_team_key_idx on championship_interest (team_id, championship_key) where status != 'withdrawn';

-- ─── PrequalCandidates ───
-- Elenco "chi ci prova" su un'entry-list esterna. Pubblico in lettura
-- (fedele al sorgente — sono già nomi su una entry list pubblica).
create table prequal_candidates (
  id                uuid primary key default gen_random_uuid(),
  team_id           uuid not null references teams(id) on delete cascade,

  championship_key  text not null,
  name               text not null,
  car_number         text,
  created_at         timestamptz not null default now(),
  created_by         uuid references drivers(id) on delete set null
);

comment on table prequal_candidates is 'Porting fedele di PrequalCandidates.js. Hard delete (non uno storico da conservare, fedele al sorgente).';

create index prequal_candidates_team_key_idx on prequal_candidates (team_id, championship_key);

-- ─── Candidates ───
-- Pipeline candidature interna (staff-only). Affianca il Google Form
-- pubblico di /joinus, non lo sostituisce — nessun collegamento
-- automatico qui, fedele al sorgente.
create table candidates (
  id                uuid primary key default gen_random_uuid(),
  team_id           uuid not null references teams(id) on delete cascade,

  display_name       text not null,
  discord_username    text,
  contact             text,
  sim_preference       text,
  source               text not null default 'Google Form',
  status               text not null default 'new' check (status in ('new', 'contacted', 'trial', 'accepted', 'rejected')),
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  updated_by           uuid references drivers(id) on delete set null
);

comment on table candidates is 'Porting fedele di Candidates.js. logAudit_/notifyNewCandidate_ del sorgente NON riprodotti qui — dipendono dal dominio AuditLog/Discord non ancora portato (#256), gap noto e documentato, stesso principio già usato in races/incidents.';

create index candidates_team_idx on candidates (team_id, created_at desc);

-- ─── Sponsors ───
-- CRM sponsor interno (staff-only). Prosecuzione della pagina pubblica
-- /media-kit, che resta invariata e non è toccata da questo dominio.
create table sponsors (
  id                uuid primary key default gen_random_uuid(),
  team_id           uuid not null references teams(id) on delete cascade,

  company_name        text not null,
  contact_name         text,
  contact_email        text,
  contact_phone        text,
  status               text not null default 'lead' check (status in ('lead', 'contacted', 'negotiating', 'active', 'declined', 'lapsed')),
  value_estimate        text,
  next_follow_up        date,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  updated_by            uuid references drivers(id) on delete set null
);

comment on table sponsors is 'Porting fedele di Sponsors.js. DEVIAZIONE: next_follow_up è "date" nativo invece di testo libero — il sorgente lo tratta comunque sempre come data parsabile (new Date(...) nel digest runSponsorFollowUpDigest), qui il tipo di colonna lo garantisce a livello di schema invece che a runtime. logAudit_/notifyNewSponsorLead_/notifySponsorActivated_/runSponsorFollowUpDigest (digest Discord settimanale) del sorgente NON riprodotti qui — dipendono da AuditLog/Discord non ancora portato (#256), gap noto.';

create index sponsors_team_idx on sponsors (team_id, next_follow_up);

-- ─── Treasury ───
-- Registro entrate/uscite cassa team. Dato sensibile: SOLO admin
-- (ctx.isAdmin nel sorgente, non isStaff) — fedele.
create table treasury_entries (
  id                uuid primary key default gen_random_uuid(),
  team_id           uuid not null references teams(id) on delete cascade,

  date                 date not null,
  type                 text not null check (type in ('entrata', 'uscita')),
  amount               numeric(12, 2) not null check (amount > 0),
  counterparty          text not null,
  description            text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  updated_by             uuid references drivers(id) on delete set null
);

comment on table treasury_entries is 'Porting fedele di Treasury.js. amount è SEMPRE positivo (il segno si ricava da type), fedele alla convenzione esplicita del sorgente. logAudit_ del sorgente NON riprodotto qui — dipende da AuditLog non ancora portato (#256), gap noto. migrateTreasuryFromRendicontoSheet (import one-off dal foglio Google esterno) non ha equivalente qui: è una migrazione dati storica già completata nel sistema reale, non un endpoint applicativo.';

create index treasury_entries_team_idx on treasury_entries (team_id, date desc);

-- ─── Consents ───
-- Consenso pubblicazione dati personali. NON è un parere legale (vedi
-- commento sorgente Consent.js) — porting fedele della logica, non
-- del testo legale mostrato al pilota (responsabilità del frontend).
create table consents (
  id                uuid primary key default gen_random_uuid(),
  team_id           uuid not null references teams(id) on delete cascade,
  driver_id         uuid not null references drivers(id) on delete cascade,

  consent_version      text not null,
  site_consent          boolean not null default false,
  social_consent        boolean not null default false,
  birth_date            date not null,
  is_minor              boolean not null,
  parent_name            text,
  parent_email           text,
  parent_declared        boolean,
  accepted_at             timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  unique (team_id, driver_id, consent_version)
);

comment on table consents is 'Porting fedele di Consent.js. Upsert su (team_id, driver_id, consent_version) — qui via constraint DB nativo invece della scansione manuale del sorgente. is_minor è uno SNAPSHOT calcolato al momento di consent.accept (fedele al sorgente: computeIsMinor_ chiamato una volta, non una colonna calcolata live), non si aggiorna automaticamente quando il pilota compie 18 anni finché non riaccetta.';

-- ─── RLS ───

alter table championship_interest enable row level security;
alter table prequal_candidates enable row level security;
alter table candidates enable row level security;
alter table sponsors enable row level security;
alter table treasury_entries enable row level security;
alter table consents enable row level security;

-- championship_interest: come clash_participants — barriera per
-- accessi diretti (il percorso pubblico reale passa dall'Edge
-- Function con client service role).
create policy "championship_interest: il team legge"
  on championship_interest for select
  using (team_id = current_driver_team_id());

create policy "championship_interest: il team scrive/aggiorna la propria"
  on championship_interest for insert
  with check (team_id = current_driver_team_id());

create policy "championship_interest: pilota aggiorna la propria, staff/admin tutte"
  on championship_interest for update
  using (
    team_id = current_driver_team_id()
    and (driver_id = current_driver_id() or current_driver_is_staff_or_admin())
  )
  with check (
    team_id = current_driver_team_id()
    and (driver_id = current_driver_id() or current_driver_is_staff_or_admin())
  );

-- prequal_candidates: lettura team, scrittura staff/admin.
create policy "prequal_candidates: il team legge"
  on prequal_candidates for select
  using (team_id = current_driver_team_id());

create policy "prequal_candidates: staff/admin scrivono"
  on prequal_candidates for insert
  with check (team_id = current_driver_team_id() and current_driver_is_staff_or_admin());

create policy "prequal_candidates: staff/admin cancellano"
  on prequal_candidates for delete
  using (team_id = current_driver_team_id() and current_driver_is_staff_or_admin());

-- candidates: tutto staff/admin, nessuna visibilità pilota comune.
create policy "candidates: staff/admin leggono"
  on candidates for select
  using (team_id = current_driver_team_id() and current_driver_is_staff_or_admin());

create policy "candidates: staff/admin scrivono"
  on candidates for insert
  with check (team_id = current_driver_team_id() and current_driver_is_staff_or_admin());

create policy "candidates: staff/admin aggiornano"
  on candidates for update
  using (team_id = current_driver_team_id() and current_driver_is_staff_or_admin())
  with check (team_id = current_driver_team_id() and current_driver_is_staff_or_admin());

create policy "candidates: staff/admin cancellano"
  on candidates for delete
  using (team_id = current_driver_team_id() and current_driver_is_staff_or_admin());

-- sponsors: tutto staff/admin.
create policy "sponsors: staff/admin leggono"
  on sponsors for select
  using (team_id = current_driver_team_id() and current_driver_is_staff_or_admin());

create policy "sponsors: staff/admin scrivono"
  on sponsors for insert
  with check (team_id = current_driver_team_id() and current_driver_is_staff_or_admin());

create policy "sponsors: staff/admin aggiornano"
  on sponsors for update
  using (team_id = current_driver_team_id() and current_driver_is_staff_or_admin())
  with check (team_id = current_driver_team_id() and current_driver_is_staff_or_admin());

create policy "sponsors: staff/admin cancellano"
  on sponsors for delete
  using (team_id = current_driver_team_id() and current_driver_is_staff_or_admin());

-- treasury_entries: SOLO admin (non staff) — fedele a ctx.isAdmin.
create policy "treasury_entries: solo admin leggono"
  on treasury_entries for select
  using (team_id = current_driver_team_id() and current_driver_is_admin());

create policy "treasury_entries: solo admin scrivono"
  on treasury_entries for insert
  with check (team_id = current_driver_team_id() and current_driver_is_admin());

create policy "treasury_entries: solo admin aggiornano"
  on treasury_entries for update
  using (team_id = current_driver_team_id() and current_driver_is_admin())
  with check (team_id = current_driver_team_id() and current_driver_is_admin());

create policy "treasury_entries: solo admin cancellano"
  on treasury_entries for delete
  using (team_id = current_driver_team_id() and current_driver_is_admin());

-- consents: il pilota vede/scrive la propria, admin vede tutte
-- (consent.adminList). consent.socialFlags è pubblico nel sorgente —
-- letto via client service role nell'Edge Function dedicata, stessa
-- barriera RLS qui sotto per accessi diretti.
create policy "consents: pilota legge la propria, admin tutte"
  on consents for select
  using (
    team_id = current_driver_team_id()
    and (driver_id = current_driver_id() or current_driver_is_admin())
  );

create policy "consents: il pilota scrive/aggiorna solo la propria"
  on consents for insert
  with check (team_id = current_driver_team_id() and driver_id = current_driver_id());

create policy "consents: il pilota aggiorna solo la propria"
  on consents for update
  using (team_id = current_driver_team_id() and driver_id = current_driver_id())
  with check (team_id = current_driver_team_id() and driver_id = current_driver_id());

-- ─── Privilegi minimi ───

revoke all on championship_interest from anon;
revoke all on championship_interest from authenticated;
grant select, insert, update on championship_interest to authenticated;

revoke all on prequal_candidates from anon;
revoke all on prequal_candidates from authenticated;
grant select, insert, delete on prequal_candidates to authenticated;

revoke all on candidates from anon;
revoke all on candidates from authenticated;
grant select, insert, update, delete on candidates to authenticated;

revoke all on sponsors from anon;
revoke all on sponsors from authenticated;
grant select, insert, update, delete on sponsors to authenticated;

revoke all on treasury_entries from anon;
revoke all on treasury_entries from authenticated;
grant select, insert, update, delete on treasury_entries to authenticated;

revoke all on consents from anon;
revoke all on consents from authenticated;
grant select, insert, update on consents to authenticated;
