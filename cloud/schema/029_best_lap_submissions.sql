-- ═══════════════════════════════════════════════════════════
-- VSD-Paddock Cloud — Fase 7, dominio #262: laps.syncFromGarage61
-- + Best Lap Submissions.
-- Porting fedele di apps-script/garage61.js (handleLapsSyncFromGarage61)
-- + apps-script/BestLaps.js righe 560-886 (lapSubmissions.*) +
-- apps-script/SetupBestLapSubmissions.js.
-- ═══════════════════════════════════════════════════════════

-- ─── BestLapSubmissions ───
-- Invio autonomo dei piloti con foto di prova (evidence_url, caricata
-- lato frontend su Vercel Blob — mai gestita da questa tabella, stesso
-- principio già usato per social_media in 027_social_manager.sql).
-- Nessuna FK su track_id/car_id: stesso motivo di best_laps
-- (009_best_laps.sql) — il match car_external_name→car_id è
-- best-effort a runtime, una FK stretta romperebbe il flusso reale.
create table best_lap_submissions (
  submission_id     uuid primary key default gen_random_uuid(),
  team_id           uuid not null references teams(id) on delete cascade,
  driver_id         uuid not null references drivers(id) on delete cascade,

  sim               text not null,
  track_id          text not null,
  car_id            text not null,

  lap_time_ms       integer not null,
  lap_time_display  text not null,
  set_date          date,
  conditions        text not null default 'dry',
  air_temp_c        numeric,
  track_temp_c      numeric,
  session_type      text not null default 'practice',
  notes             text,
  evidence_url      text not null,

  status            text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_at      timestamptz not null default now(),
  reviewed_by       uuid references drivers(id) on delete set null,
  reviewed_at       timestamptz,
  review_note       text
);

comment on table best_lap_submissions is 'Porting fedele di BestLaps.js (lapSubmissions.*) + SetupBestLapSubmissions.js. submission_id uuid nativo invece del SUBnnn testuale del sorgente (mai referenziato altrove, stesso principio di race_reports.report_id). approve copia la richiesta in best_laps (stessa logica di laps.add, incluso il record-check) invece di limitarsi a cambiare status — fedele a handleLapSubmissionsApprove che riusa handleLapsAdd.';

create index best_lap_submissions_team_status_idx on best_lap_submissions (team_id, status);
create index best_lap_submissions_team_driver_idx on best_lap_submissions (team_id, driver_id);

-- ─── Garage61 (per-team, deviazione documentata) ───
-- Il sorgente reale legge GARAGE61_TOKEN/GARAGE61_TEAM_SLUG da Script
-- Properties GLOBALI (single-tenant: un solo team, VSD). In questo
-- schema multi-tenant, il cursore incrementale (garage61_last_sync_at)
-- e lo slug team Garage61 sono dati per-team legittimi — aggiunti come
-- colonne su teams. Il TOKEN (vero segreto, non dato) resta invece un
-- Edge Function secret GLOBALE (GARAGE61_TOKEN) — stessa scelta già
-- fatta per DEVICE_TOKEN_SECRET/i webhook Discord: finché VSD è il
-- solo team reale, introdurre uno storage per-team cifrato per un
-- singolo segreto sarebbe complessità anticipata senza un secondo
-- tenant che ne abbia davvero bisogno. Da rivedere quando un secondo
-- team reale richiederà il proprio account Garage61.
alter table teams add column garage61_team_slug text;
alter table teams add column garage61_last_sync_at timestamptz;

comment on column teams.garage61_team_slug is 'Slug team su Garage61 (per-team, dato non sensibile). Il token di accesso resta un Edge Function secret globale (GARAGE61_TOKEN) — vedi commento sopra.';
comment on column teams.garage61_last_sync_at is 'Cursore incrementale per il fetch /laps?after= — porting di GARAGE61_LAST_SYNC_AT (Script Properties nel sorgente, qui per-team).';

-- ─── RLS ───

alter table best_lap_submissions enable row level security;

-- SELECT: il pilota vede le proprie (qualsiasi stato, storico "in
-- attesa/approvato/rifiutato" — lapSubmissions.listMine), l'admin vede
-- tutte (lapSubmissions.listPending) — fedele: il sorgente non ha una
-- action che permetta a un pilota di vedere le richieste di un altro.
create policy "best_lap_submissions: il pilota vede le proprie, l'admin tutte"
  on best_lap_submissions for select
  using (team_id = current_driver_team_id() and (driver_id = current_driver_id() or current_driver_is_admin()));

-- INSERT: solo la propria richiesta (lapSubmissions.submit — qualsiasi
-- pilota autenticato, nessun gate di ruolo nel sorgente).
create policy "best_lap_submissions: il pilota invia la propria richiesta"
  on best_lap_submissions for insert
  with check (team_id = current_driver_team_id() and driver_id = current_driver_id());

-- UPDATE/DELETE: SOLO admin (approve/reject/remove — fedele a
-- ctx.isAdmin nel sorgente, non isStaff: la validazione foto/video
-- resta riservata volutamente a un cerchio più ristretto).
create policy "best_lap_submissions: solo admin aggiornano"
  on best_lap_submissions for update
  using (team_id = current_driver_team_id() and current_driver_is_admin())
  with check (team_id = current_driver_team_id() and current_driver_is_admin());

create policy "best_lap_submissions: solo admin cancellano"
  on best_lap_submissions for delete
  using (team_id = current_driver_team_id() and current_driver_is_admin());

-- ─── Privilegi minimi ───

revoke all on best_lap_submissions from anon;
revoke all on best_lap_submissions from authenticated;
grant select, insert, update, delete on best_lap_submissions to authenticated;
