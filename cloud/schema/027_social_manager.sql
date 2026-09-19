-- ═══════════════════════════════════════════════════════════
-- VSD-Paddock Cloud — Fase 5, dominio #260: Social Manager
-- Porting fedele di apps-script/SocialManager.js.
-- ═══════════════════════════════════════════════════════════
-- Auth: TUTTE le azioni sono SOLO admin (ctx.isAdmin nel sorgente,
-- non isStaff) — su richiesta esplicita di Demetrio ("Admin o Team
-- Principal"), fedele. Stesso principio già applicato a
-- treasury_entries/consent.adminList in 022_admin_domains.sql.
--
-- LIMITE STRUTTURALE preservato dal sorgente: nessuna colonna o
-- automazione qui pubblica mai nulla in automatico su Facebook/
-- Instagram — "pubblicato" resta un marcatore manuale.
-- ═══════════════════════════════════════════════════════════

-- ─── SocialPosts ───
create table social_posts (
  post_id           uuid primary key default gen_random_uuid(),
  team_id           uuid not null references teams(id) on delete cascade,

  content           text not null,
  -- DEVIAZIONE: text[] nativo invece del CSV in una cella del sorgente
  -- (stesso principio già usato per gallery_urls in 015_races.sql). Il
  -- frontend fa String(post.platforms).split(',') — String() su un
  -- array JS produce comunque la stringa CSV via Array.toString(),
  -- quindi resta compatibile senza modifiche lato client.
  platforms         text[] not null default '{}',
  status            text not null default 'bozza' check (status in ('bozza', 'programmato', 'pubblicato')),
  -- scheduled_date è "date" nativo: il bug di auto-conversione Sheets
  -- documentato nel sorgente (setNumberFormat('@') per evitare lo
  -- sfasamento di un giorno) non esiste in Postgres, quindi qui non
  -- serve alcun workaround.
  scheduled_date    date,
  link_destination  text,
  created_by        uuid references drivers(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  published_at      timestamptz,
  race_id           text references races(race_id) on delete set null,
  pillar            text,
  media_url         text
);

comment on table social_posts is 'Porting fedele di SocialManager.js (SocialPosts). post_id è uuid nativo (mai referenziato da altre tabelle, stesso principio di race_crews.id/lap_data.id) invece del formato testuale SPOSTnnn del sorgente.';

create index social_posts_team_status_idx on social_posts (team_id, status);
create index social_posts_team_race_pillar_idx on social_posts (team_id, race_id, pillar);

-- ─── SocialMetrics ───
create table social_metrics (
  metric_id         uuid primary key default gen_random_uuid(),
  team_id           uuid not null references teams(id) on delete cascade,

  platform          text not null check (platform in ('facebook', 'facebook_group', 'instagram', 'discord')),
  followers         integer not null check (followers >= 0),
  recorded_date     date not null default current_date,
  recorded_by       uuid references drivers(id) on delete set null
);

comment on table social_metrics is 'Porting fedele di SocialManager.js (SocialMetrics). Nessun vincolo unique su (team_id, platform, recorded_date): il sorgente non deduplica le rilevazioni nello stesso giorno, fedele.';

create index social_metrics_team_platform_idx on social_metrics (team_id, platform, recorded_date);

-- ─── SocialMedia ───
-- Il file vero vive su Vercel Blob (upload diretto dal browser) — qui
-- solo i metadati, fedele al sorgente (vedi commento su
-- handleSocialMediaAdd in apps-script/SocialManager.js).
create table social_media (
  media_id          uuid primary key default gen_random_uuid(),
  team_id           uuid not null references teams(id) on delete cascade,

  url               text not null,
  filename          text,
  media_type        text not null default 'image' check (media_type in ('image', 'video')),
  -- tags resta testo CSV (non text[]): il filtro del sorgente è un
  -- substring match case-insensitive su tutta la stringa
  -- (tags.toLowerCase().indexOf(tagFilter)), non un contains su array
  -- — fedele.
  tags              text default '',
  uploaded_by       uuid references drivers(id) on delete set null,
  uploaded_at       timestamptz not null default now()
);

comment on table social_media is 'Porting fedele di SocialManager.js (SocialMedia). NON cancella mai il file su Vercel Blob — quello resta responsabilità del frontend (api/media-delete), fedele.';

create index social_media_team_uploaded_idx on social_media (team_id, uploaded_at desc);

-- ─── SocialPlanDismissed ───
-- Chiave (team_id, race_id, pillar): pillar = '' significa "archivia
-- tutta la gara" (comportamento originale), pillar valorizzato
-- nasconde solo quella singola azione — fedele alla semantica del
-- sorgente (aggiunta 14 set 2026, vedi commento su
-- SOCIAL_PLAN_DISMISSED_HEADERS). Qui il vincolo di unicità è un
-- constraint DB nativo (upsert), non la scansione manuale
-- find-or-update del sorgente — stesso principio già usato per
-- consents/race_rsvps.
create table social_plan_dismissed (
  team_id           uuid not null references teams(id) on delete cascade,
  race_id           text not null references races(race_id) on delete cascade,
  pillar            text not null default '',
  dismissed_by      uuid references drivers(id) on delete set null,
  dismissed_at      timestamptz not null default now(),

  primary key (team_id, race_id, pillar)
);

comment on table social_plan_dismissed is 'Porting fedele di SocialManager.js (SocialPlanDismissed). pillar vuoto = whole-race dismiss (retrocompatibile con le righe storiche del sorgente), pillar valorizzato = dismiss di una singola azione.';

-- ─── RLS ───
-- Stesso principio di treasury_entries: SOLO admin, mai staff comune,
-- mai pilota. Nessuna eccezione per driver_id = current_driver_id()
-- (a differenza di consents/race_rsvps) perché il sorgente non ha
-- alcun concetto di "il mio post" — è tutto gestito da un unico
-- operatore admin/team principal.

alter table social_posts enable row level security;
alter table social_metrics enable row level security;
alter table social_media enable row level security;
alter table social_plan_dismissed enable row level security;

create policy "social_posts: solo admin leggono"
  on social_posts for select
  using (team_id = current_driver_team_id() and current_driver_is_admin());

create policy "social_posts: solo admin scrivono"
  on social_posts for insert
  with check (team_id = current_driver_team_id() and current_driver_is_admin());

create policy "social_posts: solo admin aggiornano"
  on social_posts for update
  using (team_id = current_driver_team_id() and current_driver_is_admin())
  with check (team_id = current_driver_team_id() and current_driver_is_admin());

create policy "social_posts: solo admin cancellano"
  on social_posts for delete
  using (team_id = current_driver_team_id() and current_driver_is_admin());

create policy "social_metrics: solo admin leggono"
  on social_metrics for select
  using (team_id = current_driver_team_id() and current_driver_is_admin());

create policy "social_metrics: solo admin scrivono"
  on social_metrics for insert
  with check (team_id = current_driver_team_id() and current_driver_is_admin());

create policy "social_media: solo admin leggono"
  on social_media for select
  using (team_id = current_driver_team_id() and current_driver_is_admin());

create policy "social_media: solo admin scrivono"
  on social_media for insert
  with check (team_id = current_driver_team_id() and current_driver_is_admin());

create policy "social_media: solo admin cancellano"
  on social_media for delete
  using (team_id = current_driver_team_id() and current_driver_is_admin());

create policy "social_plan_dismissed: solo admin leggono"
  on social_plan_dismissed for select
  using (team_id = current_driver_team_id() and current_driver_is_admin());

create policy "social_plan_dismissed: solo admin scrivono"
  on social_plan_dismissed for insert
  with check (team_id = current_driver_team_id() and current_driver_is_admin());

create policy "social_plan_dismissed: solo admin aggiornano"
  on social_plan_dismissed for update
  using (team_id = current_driver_team_id() and current_driver_is_admin())
  with check (team_id = current_driver_team_id() and current_driver_is_admin());

create policy "social_plan_dismissed: solo admin cancellano"
  on social_plan_dismissed for delete
  using (team_id = current_driver_team_id() and current_driver_is_admin());

-- ─── Privilegi minimi ───

revoke all on social_posts from anon;
revoke all on social_posts from authenticated;
grant select, insert, update, delete on social_posts to authenticated;

revoke all on social_metrics from anon;
revoke all on social_metrics from authenticated;
grant select, insert on social_metrics to authenticated;

revoke all on social_media from anon;
revoke all on social_media from authenticated;
grant select, insert, delete on social_media to authenticated;

revoke all on social_plan_dismissed from anon;
revoke all on social_plan_dismissed from authenticated;
grant select, insert, update, delete on social_plan_dismissed to authenticated;
