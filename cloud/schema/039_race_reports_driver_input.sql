-- ═══════════════════════════════════════════════════════════
-- VSD-Paddock Cloud — Race Reports: input del pilota (22/10/2026)
-- ═══════════════════════════════════════════════════════════
-- Fino a oggi race_reports era scrivibile solo dallo staff: 41 report
-- generati in automatico dall'import risultati, zero con un testo.
-- Il vecchio Google Form "VSD – Report Gara Piloti" (2 risposte in sei
-- mesi, poi chiuso e cestinato) viene sostituito da questo flusso
-- interno: il pilota completa il PROPRIO report da /reports, lo staff
-- riceve la notifica in #team-principal e il Social Manager legge
-- racconti e foto direttamente da qui.
--
-- Scrittura del pilota SOLO tramite l'azione reports.submitOwn del
-- dispatcher social-manager (service role, scoping esplicito su
-- team_id + driver_id del chiamante, whitelist dei soli campi pilota):
-- nessuna nuova policy RLS, le policy esistenti "solo staff/admin
-- scrivono" restano invariate per l'accesso diretto.
-- ═══════════════════════════════════════════════════════════

alter table race_reports
  add column if not exists driver_summary  text,
  add column if not exists key_moment      text,
  add column if not exists media_urls      text[] not null default '{}',
  add column if not exists social_ok       boolean,
  add column if not exists submitted_at    timestamptz;

comment on column race_reports.driver_summary is 'Racconto della gara scritto dal pilota (reports.submitOwn). Max 1500 caratteri, validato lato Edge Function.';
comment on column race_reports.key_moment     is 'Momento chiave della gara, una riga (max 300 caratteri).';
comment on column race_reports.media_urls     is 'Foto/screenshot caricati dal pilota su Vercel Blob (max 4).';
comment on column race_reports.social_ok      is 'Il pilota autorizza l''uso di questo report sui social. Vale solo insieme al consenso social (tabella consents).';
comment on column race_reports.submitted_at   is 'Primo invio del pilota. NULL = report non ancora compilato dal pilota. La notifica in #team-principal parte solo al primo invio.';

create index if not exists race_reports_team_submitted_idx on race_reports (team_id, submitted_at desc);

-- ─── Backfill griglia di partenza ───
-- Bug trovato in questa verifica: il seeding automatico (race-results-
-- import e reports.seedForRace) legge rr.qual_position, colonna che in
-- race_results NON esiste → grid_position è NULL su tutti i 41 report
-- esistenti. La griglia vera è la posizione della sessione di
-- qualifica dello stesso pilota nella stessa gara. Backfill una tantum
-- qui; per i report futuri lo stesso calcolo è fatto in lettura da
-- reports.list/recent (enrichReportsFromResults), senza toccare
-- race-results-import.
update race_reports rr
set grid_position = q.pos
from (
  select team_id, race_id, driver_id, min(finish_position) as pos
  from race_results
  where session_type = 'qualifying' and driver_id is not null and finish_position is not null
  group by team_id, race_id, driver_id
) q
where q.team_id = rr.team_id
  and q.race_id = rr.race_id
  and q.driver_id = rr.driver_id
  and rr.grid_position is null;
