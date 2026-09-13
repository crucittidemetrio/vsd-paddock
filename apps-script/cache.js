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
//
// CHUNKING (aggiunto 13 set 2026 — audit rallentamento sito): CacheService
// ha un limite HARD di 100KB per singola chiave. La versione precedente di
// questo file, quando un sheet superava quel limite, si limitava a loggare
// "[Cache SKIP]" e tornava sempre alla lettura fresca — silenziosamente,
// senza errori visibili. Con la stagione in corso RACES (e potenzialmente
// CARS/TRACKS più avanti) hanno superato quella soglia, quindi la cache
// per quei tab aveva smesso di funzionare DA SOLA, senza che nessuno se ne
// accorgesse: ogni richiesta tornava a leggere l'intero sheet, ed è una
// causa diretta della lentezza generale segnalata (Best Laps + dropdown
// che non caricavano). Ora il payload serializzato viene spezzato in
// blocchi < 100KB su più chiavi CacheService — stesso costo per sheet
// piccoli, ma non degrada più silenziosamente per quelli grandi.
// ═══════════════════════════════════════════════════════════

const CACHE_KEY_PREFIX = 'sheet_';
const CACHE_CHUNK_BYTES = 90000; // margine sotto il limite di 100KB/chiave di CacheService

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
    const cached = readChunkedCache_(cacheKey);
    if (cached !== null) {
      return JSON.parse(cached);
    }
  } catch (e) {
    Logger.log(`[Cache READ miss/err] ${sheetName}: ${e}`);
  }

  // Cache miss → leggi sheet
  const data = sheetToObjects(sheetName);

  try {
    const serialized = JSON.stringify(data);
    writeChunkedCache_(cacheKey, serialized, ttlSeconds);
  } catch (e) {
    Logger.log(`[Cache WRITE err] ${sheetName}: ${e}`);
  }

  return data;
}

/**
 * Scrive `serialized` spezzandolo su più chiavi CacheService da
 * CACHE_CHUNK_BYTES caratteri l'una, più una chiave "_meta" col numero
 * di blocchi (scritta per ultima non serve: putAll è un'unica chiamata
 * atomica lato API, quindi non c'è finestra in cui un lettore vede
 * meta senza i blocchi).
 */
function writeChunkedCache_(cacheKey, serialized, ttlSeconds) {
  const cache = CacheService.getScriptCache();
  const chunkCount = Math.ceil(serialized.length / CACHE_CHUNK_BYTES) || 1;
  const payload = {};
  payload[cacheKey + '_meta'] = String(chunkCount);
  for (let i = 0; i < chunkCount; i++) {
    payload[cacheKey + '_c' + i] = serialized.slice(i * CACHE_CHUNK_BYTES, (i + 1) * CACHE_CHUNK_BYTES);
  }
  cache.putAll(payload, ttlSeconds);
}

/**
 * Ricostruisce il valore scritto da writeChunkedCache_, o null se manca
 * anche un solo blocco (scaduto/mai scritto) — in quel caso l'intera
 * cache per quella chiave va trattata come un miss, MAI ricostruita a
 * metà: dati parziali sarebbero peggio di un cache miss pieno.
 */
function readChunkedCache_(cacheKey) {
  const cache = CacheService.getScriptCache();
  const metaRaw = cache.get(cacheKey + '_meta');
  if (!metaRaw) return null;
  const chunkCount = Number(metaRaw);
  if (!chunkCount || chunkCount <= 0) return null;

  const keys = [];
  for (let i = 0; i < chunkCount; i++) keys.push(cacheKey + '_c' + i);
  const parts = cache.getAll(keys);

  let out = '';
  for (let i = 0; i < chunkCount; i++) {
    const part = parts[cacheKey + '_c' + i];
    if (part == null) return null; // blocco mancante → miss completo
    out += part;
  }
  return out;
}

/**
 * Invalida la cache per uno specifico sheet. Da chiamare DOPO
 * ogni write su uno dei sheet "statici" cache-ati.
 *
 * @param {string} sheetName - nome tab (es. SHEETS.DRIVERS)
 */
function invalidateSheetCache_(sheetName) {
  try {
    const cache = CacheService.getScriptCache();
    const cacheKey = CACHE_KEY_PREFIX + sheetName;
    const metaRaw = cache.get(cacheKey + '_meta');
    const keysToRemove = [cacheKey + '_meta'];
    if (metaRaw) {
      const chunkCount = Number(metaRaw) || 0;
      for (let i = 0; i < chunkCount; i++) keysToRemove.push(cacheKey + '_c' + i);
    }
    cache.removeAll(keysToRemove);
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
