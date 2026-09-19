-- ═══════════════════════════════════════════════════════════
-- VSD-Paddock Cloud — Pulizia: schema demo orfano pre-esistente
-- ═══════════════════════════════════════════════════════════
-- pilots/seasons/races/race_results/penalties esistevano nel
-- progetto Supabase SENZA alcuna migrazione tracciata (buco nella
-- cronologia: nessun file corrispondente in cloud/schema/). Schema
-- incompatibile con l'architettura multi-tenant del progetto (ID
-- bigint, nessun team_id, nessun collegamento a drivers/teams reali)
-- — quasi certamente un residuo di un progetto/template Supabase
-- precedente, riusato per errore o mai ripulito dopo #237
-- ("Ripristinare e ripulire progetto Supabase VSD-Academy per riuso
-- come cloud/"). Tutte le tabelle erano vuote (0 righe) al momento
-- della rimozione — nessun dato reale perso. Confermato con l'utente
-- prima di eseguire (collisione col nome `races` necessario per il
-- porting fedele di apps-script/Races.js, vedi 015_races.sql).
-- ═══════════════════════════════════════════════════════════

drop table if exists public.penalties cascade;
drop table if exists public.race_results cascade;
drop table if exists public.races cascade;
drop table if exists public.pilots cascade;
drop table if exists public.seasons cascade;
