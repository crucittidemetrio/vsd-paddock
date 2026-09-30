-- ═══════════════════════════════════════════════════════════
-- VSD-Paddock Cloud — championships.drop_worst_round (#448)
-- ═══════════════════════════════════════════════════════════
-- Scarto stile SimGrid: segnalato da Demetrio dopo l'import di
-- qualifica+gara del round 2 (Imola) di UE144' — SimGrid nel proprio
-- pannello Standings esclude gia' dal totale punti, per ogni pilota,
-- la gara col risultato peggiore (colonna round col numero barrato).
-- I file JSON che importiamo via race-results-import sono pero' i
-- risultati grezzi di OGNI gara (nessuno scarto li'), e lo
-- standings_json "autorevole" di championships per UE144' 2026 e'
-- vuoto ([]) — quindi oggi standings-by-championship gira sempre sul
-- path 2 (compute da race_results, somma piena, NESSUNO scarto).
--
-- Questa colonna e' un flag on/off per pilota... anzi per CAMPIONATO
-- (stessa regola per tutti i piloti/classi di quel campionato),
-- attivabile da staff/admin con un pulsante dedicato in
-- ChampionshipDetail.jsx (via championships.update, whitelist estesa
-- in championships-update/index.ts). Quando true,
-- standings-by-championship (path 2, computed) esclude dal totale
-- punti di ogni pilota+classe la singola gara con point_total piu'
-- basso tra quelle non-DNS (DNF incluso: e' un risultato "raced",
-- legittimo candidato allo scarto) — solo se il pilota ha 2+ gare
-- valide, altrimenti nulla da scartare (stesso comportamento visto
-- su SimGrid: chi ha corso una sola gara non ha barratura).
-- ═══════════════════════════════════════════════════════════

alter table championships add column if not exists drop_worst_round boolean not null default false;

comment on column championships.drop_worst_round is
  'Scarto stile SimGrid: quando true, per ogni pilota+classe la gara col punteggio piu basso (tra quelle non-DNS) viene esclusa dal totale in standings-by-championship (path computed). Attivabile da staff/admin via pulsante in ChampionshipDetail.jsx (championships.update).';
