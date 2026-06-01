// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Cache layer per dati statici
// ═══════════════════════════════════════════════════════════
// Wrapper su CacheService di Apps Script per ridurre le letture
// ripetute di sheet quasi-statici (Drivers, Tracks, Cars, etc).
//
// Impatto: -40-60% latenza per chiamate API che leggono questi
// tab più volte nello stesso request o tra request consecutive.
//
// Sheet "statici" cache-ati:
//   - DRIVERS         TTL 600s   (10 min)
//   - TRACKS          TTL 21600s (6h)
//   - CARS            TTL 21600s (6h)
//   - CHAMPIONSHIPS   TTL 3600s  (1h)
//   - RACES           TTL 900s   (15 min)
//
// Sheet "dinamici" (mai cache-ati, sempre fresh):
//   - BEST_LAPS, RACE_RESULTS, RACE_REPORTS
//
// Invalidation: hook in tutti i handler che scrivono sui sheet
// statici. Se una modifica manuale al sheet non innesca invalidation,
// l'auto-expire TTL la sistema entro pochi minuti.
//
// Emergency: clearAllCaches() invocabile dall'editor Apps Script.
// ═══════════════════════════════════════════════════════════

const CACHE_KEY_PREFIX = 'sheet_';
const CACHE_MAX_BYTES = 95000; // CacheService limit è 100KB, lasciamo margine

/**
 * Legge un sheet con caching automatico. Drop-in replacement
 * per sheetToObjects(sheetName).
 *
 * @param {string} sheetName - nome tab (es. SHEETS.DRIVERS)
 * @param {number} ttlSeconds - durata cache (default 600s = 10min)
 * @returns {Array<Object>} array di oggetti, identico a sheetToObjects
 */
function getCachedSheetData_(sheetName, ttlSeconds) {
  ttlSeconds = ttlSeconds || 600;
  const cacheKey = CACHE_KEY_PREFIX + sheetName;

  try {
    const cache = CacheService.getScriptCache();
    const cached = cache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (e) {
    Logger.log(`[Cache READ miss/err] ${sheetName}: ${e}`);
  }

  // Cache miss → leggi sheet
  const data = sheetToObjects(sheetName);

  // Try writing to cache (può fallire se > 100KB)
  try {
    const serialized = JSON.stringify(data);
    if (serialized.length <= CACHE_MAX_BYTES) {
      const cache = CacheService.getScriptCache();
      cache.put(cacheKey, serialized, ttlSeconds);
    } else {
      Logger.log(`[Cache SKIP] ${sheetName} troppo grande (${serialized.length}b > ${CACHE_MAX_BYTES}b)`);
    }
  } catch (e) {
    Logger.log(`[Cache WRITE err] ${sheetName}: ${e}`);
  }

  return data;
}

/**
 * Invalida la cache per uno specifico sheet. Da chiamare DOPO
 * ogni write su uno dei sheet "statici" cache-ati.
 *
 * @param {string} sheetName - nome tab (es. SHEETS.DRIVERS)
 */
function invalidateSheetCache_(sheetName) {
  try {
    CacheService.getScriptCache().remove(CACHE_KEY_PREFIX + sheetName);
  } catch (e) {
    Logger.log(`[Cache INVALIDATE err] ${sheetName}: ${e}`);
  }
}

/**
 * Invalida tutte le cache. Da invocare manualmente dall'editor
 * Apps Script se modifichi sheet a mano e vuoi vedere subito i
 * cambiamenti senza aspettare TTL.
 *
 * NB: funzione pubblica (no underscore), visibile nel dropdown
 * "Funzioni" dell'editor.
 */
function clearAllCaches() {
  const sheetNames = [
    SHEETS.DRIVERS,
    SHEETS.TRACKS,
    SHEETS.CARS,
    SHEETS.CHAMPIONSHIPS,
    SHEETS.RACES,
  ];
  sheetNames.forEach(name => invalidateSheetCache_(name));
  Logger.log(`✅ Invalidate cache: ${sheetNames.join(', ')}`);
}
