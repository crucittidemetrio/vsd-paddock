-- ═══════════════════════════════════════════════════════════
-- VSD-Paddock Cloud — Fix: grant mancante su updated_at (self-edit)
-- ═══════════════════════════════════════════════════════════
-- Bug scoperto simulando via SQL la query esatta di roster-update-self
-- (Edge Function): "permission denied for table drivers". Causa: la
-- migrazione 004 concede UPDATE colonna-per-colonna su
-- (bio, instagram, facebook, roster_track) per authenticated, ma
-- roster-update-self imposta SEMPRE anche updated_at = now() insieme
-- al campo modificato. Un GRANT UPDATE per colonne richiede che TUTTE
-- le colonne nel SET siano coperte — updated_at non lo era, quindi
-- Postgres rifiutava l'intera UPDATE, non solo quella colonna.
--
-- Fix: aggiungere updated_at alla whitelist di colonne aggiornabili
-- da authenticated. Non è un dato sensibile (timestamp di bookkeeping,
-- il valore è sempre e solo now() lato server, mai dal payload utente)
-- quindi non introduce un varco nella whitelist applicativa
-- (ROSTER_SELF_EDITABLE_FIELDS in roster-update-self resta invariata).
-- ═══════════════════════════════════════════════════════════

grant update (bio, instagram, facebook, roster_track, updated_at) on drivers to authenticated;
