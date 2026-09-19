-- ═══════════════════════════════════════════════════════════
-- VSD-Paddock Cloud — #256: AuditLog + Push (schema)
-- ═══════════════════════════════════════════════════════════
-- Porting fedele di apps-script/AuditLog.js (audit_log) e
-- apps-script/Push.js (push_subscriptions). DiscordMessenger.js non
-- ha bisogno di una tabella propria — messenger.send scrive solo su
-- audit_log e chiama Discord via webhook/relay già configurati per
-- Notifications.js.
--
-- audit_log: append-only, un log di controllo per azioni admin
-- sensibili. Multi-tenant: team_id in più rispetto al sorgente
-- (unico team implicito nel foglio reale). driver_id nullable per
-- azioni lanciate senza contesto driver (parità con l'attore
-- "editor Apps Script" del sorgente, qui non applicabile ma il
-- campo resta nullable per coerenza futura, es. azioni di sistema).
-- Nessuna colonna details_json separata — stessa scelta del
-- sorgente (schema esistente più snello di quanto previsto,
-- logAudit_ si adatta), qui "details" resta testo libero con
-- eventuale payload JSON appeso in coda.
--
-- push_subscriptions: storage delle Web Push subscription (endpoint +
-- chiavi p256dh/auth) per pilota. La firma VAPID e la cifratura
-- aes128gcm del protocollo Web Push restano delegate al relay Vercel
-- esistente (api/push-send.js, libreria "web-push") esattamente come
-- nel sorgente — Deno avrebbe le primitive crypto per farlo
-- nativamente, ma reimplementare qui duplicherebbe un'infrastruttura
-- già funzionante e testata invece di riusarla: nessun vantaggio,
-- solo rischio. Le Edge Function push-subscribe/push-unsubscribe
-- fanno solo storage; l'invio vero passa dal relay via fetch(),
-- stesso ruolo di UrlFetchApp nel sorgente.
-- ═══════════════════════════════════════════════════════════

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  driver_id uuid references drivers(id) on delete set null,
  action text not null,
  target_id text,
  details text,
  created_at timestamptz not null default now()
);

create index audit_log_team_created_idx on audit_log (team_id, created_at desc);
create index audit_log_team_action_idx on audit_log (team_id, action);
create index audit_log_team_driver_idx on audit_log (team_id, driver_id);

alter table audit_log enable row level security;

-- Lettura: solo staff/admin del team (auditLog.list nel sorgente è
-- ctx.isStaff, cioè staff-o-admin).
create policy audit_log_select_staff on audit_log
  for select
  using (team_id = current_driver_team_id() and current_driver_is_staff_or_admin());

-- Scrittura: qualunque driver autenticato del team può registrare
-- un log per il proprio driver_id — l'autorizzazione vera è già
-- stata applicata a monte dalla action business (logAudit_ è
-- chiamata solo da handler già gated su staff/admin), questa policy
-- è solo la barriera anti-spoofing "non puoi loggare come qualcun
-- altro o in un altro team".
create policy audit_log_insert_self on audit_log
  for insert
  with check (team_id = current_driver_team_id() and (driver_id is null or driver_id = current_driver_id()));

revoke all on audit_log from anon;
grant select, insert on audit_log to authenticated;

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  driver_id uuid not null references drivers(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  unique (driver_id, endpoint)
);

create index push_subscriptions_team_idx on push_subscriptions (team_id);

alter table push_subscriptions enable row level security;

-- Self-service pieno: un pilota gestisce solo le proprie
-- subscription. Nessun bisogno di una policy "staff legge tutte le
-- subscription" — l'invio broadcast (sendPushNotification_) userà un
-- client service-role dentro l'Edge Function, bypassando la RLS come
-- già stabilito per i pattern pubblici di Clash of Classes/
-- ChampionshipInterest (stesso principio: l'autorizzazione reale è
-- nel codice del handler, non nello storage).
create policy push_subscriptions_select_self on push_subscriptions
  for select
  using (driver_id = current_driver_id());

create policy push_subscriptions_insert_self on push_subscriptions
  for insert
  with check (team_id = current_driver_team_id() and driver_id = current_driver_id());

create policy push_subscriptions_delete_self on push_subscriptions
  for delete
  using (driver_id = current_driver_id());

revoke all on push_subscriptions from anon;
grant select, insert, delete on push_subscriptions to authenticated;
