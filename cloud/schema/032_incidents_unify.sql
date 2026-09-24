-- ═══════════════════════════════════════════════════════════
-- VSD-Paddock Cloud — Unificazione segnalazione incidenti (richiesto
-- da Demetrio: "stesso sistema per tutto" — un solo modulo di
-- segnalazione per Direzione Gara/UE144/ACI/Clash of Classes, riusabile
-- anche da un futuro slash command Discord)
-- ═══════════════════════════════════════════════════════════
-- NOTA IMPORTANTE (drift scoperto in validazione, 24/09/2026): questa
-- migrazione parte da uno stato REALE di incident_reports diverso da
-- quello descritto in 017_incidents.sql. Tra #351 e #352 (sessioni
-- precedenti) la tabella era già stata evoluta live — reporter_sim
-- (NOT NULL), reporter_discord, against (NOT NULL, sostituisce
-- against_name_external) erano già stati aggiunti, reporter_driver_id
-- era già nullable, ed esisteva già un FK composito
-- incident_reports_championship_fkey su (team_id, championship_id) →
-- championships(team_id, id) — nessuno di questi cambiamenti era mai
-- stato scritto in un file schema/ versionato. Stessa causa radice di
-- altri drift già documentati nel progetto (audit-log-list,
-- standings-by-championship, championships-list: codice deployato
-- direttamente, mai sincronizzato in git). Questo file documenta SOLO
-- le colonne genuinamente nuove aggiunte ora; reporter_sim/reporter_discord/
-- against/il FK championship NON sono ripetuti qui perché già presenti.
--
-- Stato precedente all'unificazione (due sistemi scollegati):
--   1. incident_reports (Direzione Gara/UE144): già pubblico via
--      anon+team_slug lato Edge Function (incidents-report v3, mai
--      documentato), già risolve championship_id via lookup reale.
--      Mancava solo un riferimento a una GARA specifica (solo
--      championship_id generico) e un canale Discord.
--   2. clash_incident_reports (Clash of Classes): tabella separata,
--      campi divergenti (round fisso 1-3, reporting_name/reported_name
--      testo libero, replay_url), nessun collegamento a incident_reports.
--
-- Decisione: estendere incident_reports con race_id/clash_round/
-- replay_url/source ed usarla per TUTTI i nuovi invii (web e Discord).
-- clash_incident_reports resta intatta come archivio storico in sola
-- lettura (nessuna migrazione retroattiva: già "immutabile" per
-- principio di progetto) — clash-incidents-report scrive da ora in
-- avanti su incident_reports con clash_round valorizzato.
-- ═══════════════════════════════════════════════════════════

alter table incident_reports add column race_id text references races(race_id) on delete set null;
alter table incident_reports add column clash_round integer check (clash_round is null or clash_round in (1, 2, 3));
alter table incident_reports add column source text not null default 'web' check (source in ('web', 'discord'));
alter table incident_reports add column replay_url text;

comment on column incident_reports.race_id is 'Riferimento opzionale a una gara specifica (races.race_id). Alternativa a championship_id (riferimento generico) o clash_round (Clash of Classes) — un solo campo di riferimento è tipicamente valorizzato.';
comment on column incident_reports.clash_round is 'Round Clash of Classes (1-3) quando la segnalazione arriva da quel dominio — sostituisce clash_incident_reports per i nuovi invii, che resta come archivio storico.';
comment on column incident_reports.source is 'Canale di invio: web (form nativo) o discord (slash command /segnala-incidente). Solo osservabilità.';
comment on column incident_reports.replay_url is 'Link clip/telemetria a supporto della segnalazione, fornito dal segnalante (diverso da incident_resolutions.evidence_url, che è la prova usata dallo staff per la decisione finale).';

create index incident_reports_race_idx on incident_reports (race_id) where race_id is not null;

-- Nessuna modifica alla RLS: il path anonimo (community esterna, come
-- già per Clash/Roster/Interest/Endurance) passa da un client SERVICE
-- ROLE nell'Edge Function, che bypassa la RLS — stessa architettura
-- già in uso in tutto il progetto. La policy INSERT esistente resta
-- valida per il path con sessione Supabase reale.
