-- ═══════════════════════════════════════════════════════════
-- VSD-Paddock Cloud — Fase 7, dominio #263: Pit Wall — relay
-- Realtime per viewer remoti.
--
-- Contesto (vedi 010_pitwall_sessions.sql, sezione "FUORI SCOPE"): il
-- sistema reale ha un bridge C# locale (VsdPitwallBridge) che espone
-- un proprio server WebSocket su `ws://localhost:8090/ws/`,
-- broadcastando la griglia a ~5Hz. Funziona SOLO se il browser che
-- guarda /pitwall gira sullo stesso PC del bridge (vedi commento in
-- src/hooks/usePitwallBridge.js) — nessun viewer remoto possibile.
--
-- Questa migrazione NON porta una tabella applicativa (i frame live
-- sono per definizione effimeri, mai persistiti — stesso principio
-- già del bridge originale, che non scrive nulla su disco per il
-- live, solo per lo snapshot di fine sessione già in
-- pitwall_sessions). Porta invece la sola configurazione RLS che
-- serve a Supabase Realtime per autorizzare un CANALE BROADCAST
-- privato per-team: `pitwall:{team_id}`.
--
-- Architettura scelta: Realtime Broadcast via REST
-- (POST /realtime/v1/api/broadcast, vedi Edge Function
-- pitwall.broadcastLive) invece di Postgres Changes — non esiste
-- alcuna tabella da cui derivare i cambi riga-per-riga, e Broadcast è
-- esplicitamente la feature raccomandata da Supabase per payload
-- ad alta frequenza tipo "cursor tracking" (identico al nostro caso
-- d'uso: posizione/tempi di ogni pilota in griglia, decine di update
-- al secondo).
--
-- Canale PRIVATO (non pubblico): la scelta di sicurezza di default
-- del progetto è "nessun dato leggibile senza autenticazione", stesso
-- principio di ogni altra RLS in questo schema — un canale pubblico
-- sarebbe leggibile da chiunque conoscesse la publishable key (che è
-- per design non segreta) senza alcun controllo di appartenenza al
-- team. Il canale privato richiede una RLS su realtime.messages,
-- valutata da Supabase alla sottoscrizione del canale usando il JWT
-- della sessione del sottoscrittore.
--
-- Solo la policy di LETTURA (SELECT) è necessaria: chi SCRIVE sul
-- canale è sempre e solo l'Edge Function pitwall.broadcastLive, che
-- usa la SERVICE_ROLE_KEY lato server per il POST REST — la
-- service_role bypassa RLS su qualunque tabella per design Postgres,
-- quindi non serve una policy INSERT per il caso d'uso reale. Nessuna
-- policy INSERT viene comunque aggiunta: con RLS abilitata e nessuna
-- policy INSERT, un eventuale tentativo di broadcast diretto da un
-- client con la sola chiave anon/pubblicabile viene rifiutato di
-- default — nessun pilota può mai spacciarsi per il bridge.
--
-- NOTA OPERATIVA (non SQL, da fare a mano in Dashboard): per far
-- rispettare davvero il canale privato, "Allow public access" in
-- Realtime Settings deve restare disattivato (default di progetto:
-- mai stato attivato in questo progetto Supabase) — stesso principio
-- dei secrets Edge Function non ancora configurati altrove in questo
-- porting, documentato come gap non bloccante nel README.
-- ═══════════════════════════════════════════════════════════

-- `realtime.messages` è di proprietà di Supabase (schema gestito
-- dalla piattaforma) e ha RLS già abilitata di default — un
-- `alter table ... enable row level security` fallisce con
-- "must be owner of table messages" (verificato applicando questa
-- migrazione: l'ALTER è stato rimosso, la sola CREATE POLICY è
-- accettata perché il ruolo di migrazione ha i permessi necessari per
-- questo schema specifico, anche senza esserne proprietario).

-- SELECT: un pilota autenticato può ricevere broadcast SOLO sul
-- topic del proprio team ('pitwall:{team_id}') — usa lo stesso
-- helper current_driver_team_id() già usato in ogni altra RLS di
-- questo schema, applicato al topic del canale via realtime.topic().
create policy "pitwall: il team riceve i broadcast live del proprio canale"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension in ('broadcast')
    and (select realtime.topic()) = 'pitwall:' || (current_driver_team_id())::text
  );

comment on policy "pitwall: il team riceve i broadcast live del proprio canale" on realtime.messages is
  'Autorizza la sottoscrizione al canale Realtime privato pitwall:{team_id} — porting della "vista live" del VSD Pitwall Bridge (#263), che nel sistema reale è un WebSocket localhost senza alcun concetto di isolamento per team (single-tenant). Nessuna policy INSERT: il solo scrittore legittimo è l''Edge Function pitwall.broadcastLive via SERVICE_ROLE_KEY, che bypassa RLS per design.';
