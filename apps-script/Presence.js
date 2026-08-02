// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Presence ("chi sta usando il sito ORA")
// ═══════════════════════════════════════════════════════════
// Basato su CacheService, non su Sheets: il dato è effimero per natura
// (scade da solo), quindi non ha senso una riga persistente da scrivere
// e ripulire. Il frontend manda un heartbeat ogni ~60s finché la pagina
// è aperta e il pilota è loggato; presence.online legge chi ha ancora
// un heartbeat valido.
//
// Costo: 1 CacheService.put per pilota loggato ogni 60s (heartbeat) +
// 1 CacheService.getAll per ogni apertura/refresh del Roster (poll ~25s
// lato frontend). CacheService non consuma quota Sheets né tocca il DB.
// ═══════════════════════════════════════════════════════════

const PRESENCE_KEY_PREFIX = 'presence_';
const PRESENCE_TTL_SECONDS = 90; // > intervallo heartbeat frontend (60s): tollera 1 beat perso

/**
 * presence.heartbeat — "sono qui, ora".
 * Auth: richiesta, e serve un driver_id reale (i guest non hanno presenza).
 *
 * @returns {Object} { ok, data: { alive: true } }
 */
function handlePresenceHeartbeat(payload, ctx) {
  if (!ctx || !ctx.driver_id) return fail('Auth richiesto');

  try {
    CacheService.getScriptCache().put(PRESENCE_KEY_PREFIX + ctx.driver_id, '1', PRESENCE_TTL_SECONDS);
  } catch (e) {
    // Non-fatale: se il cache write fallisce, il pilota semplicemente non
    // risulterà online finché non arriva un heartbeat successivo.
    Logger.log('[presence.heartbeat] err: ' + e.message);
  }

  return ok({ alive: true });
}

/**
 * presence.online — elenco driver_id con un heartbeat ancora valido.
 * Auth: richiesta (qualsiasi membro autenticato può vedere chi è online,
 * stesso livello di privacy della roster.list normale).
 *
 * Limitato ai piloti "attivi" in roster: CacheService.getAll() richiede
 * le chiavi esplicite (non esiste un "list all" su CacheService), quindi
 * costruiamo le chiavi dal roster invece di tenerne una lista a parte.
 *
 * @returns {Object} { ok, data: { online: [driver_id, ...] } }
 */
function handlePresenceOnline(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');

  const activeDrivers = getCachedSheetData_(SHEETS.DRIVERS, 600)
    .filter(d => d.status === 'active' && !d.removed_at);

  if (activeDrivers.length === 0) return ok({ online: [] });

  const keys = activeDrivers.map(d => PRESENCE_KEY_PREFIX + d.driver_id);

  let found = {};
  try {
    found = CacheService.getScriptCache().getAll(keys) || {};
  } catch (e) {
    Logger.log('[presence.online] err: ' + e.message);
  }

  const online = Object.keys(found).map(k => k.slice(PRESENCE_KEY_PREFIX.length));
  return ok({ online: online });
}
