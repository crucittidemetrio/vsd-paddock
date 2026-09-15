-- ═══════════════════════════════════════════════════════════
-- VSD-Paddock Cloud — Hardening: privilegi minimi (anon/authenticated)
-- ═══════════════════════════════════════════════════════════
-- Il progetto Supabase riusato per cloud/ (VSD-paddock-cloud, ex
-- "VSD-Academy", creato ad aprile 2026 prima di questa iniziativa)
-- era nato con "Automatically expose new tables" di fatto attivo:
-- anon e authenticated avevano DELETE/INSERT/SELECT/TRUNCATE/UPDATE
-- su teams/drivers/drivers_public per default ACL, ereditati dalla
-- creazione del progetto — non dalle migration 001/002.
--
-- Non sfruttabile finché RLS resta corretta (Postgres nega di
-- default un comando senza policy che lo copra), ma è privilegio in
-- eccesso: una policy permissiva aggiunta in futuro senza pensarci
-- lo renderebbe sfruttabile da subito. roster.* nel sistema reale
-- (apps-script/Roster.js) richiede SEMPRE auth — "Auth richiesto" —
-- quindi anon non deve avere NESSUN privilegio su questo dominio.
-- ═══════════════════════════════════════════════════════════

-- ─── anon: zero accesso a questo dominio ───
revoke all on teams from anon;
revoke all on drivers from anon;
revoke all on drivers_public from anon;

-- ─── authenticated: solo il minimo che le policy già permettono ───
revoke all on teams from authenticated;
grant select on teams to authenticated;

revoke all on drivers from authenticated;
grant select on drivers to authenticated;
grant update (bio, instagram, facebook, roster_track) on drivers to authenticated;

revoke all on drivers_public from authenticated;
grant select on drivers_public to authenticated;

-- ─── Fix strutturale per il futuro: le tabelle dei prossimi domini
-- (Calendario #178, Best Laps #179, Pit Wall #180) non devono più
-- ereditare grant automatici verso anon/authenticated — nascono
-- chiuse, i grant si scrivono a mano per dominio, come sopra.
-- Equivalente a "Automatically expose new tables" disattivato,
-- applicato retroattivamente perché il progetto è nato con quel
-- default attivo.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
