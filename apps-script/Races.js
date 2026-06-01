// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Races Endpoints
// ═══════════════════════════════════════════════════════════
// 3 endpoint sulla tabella Races:
//  - races.list:     tutte le gare, opzionale filtro per status
//  - races.upcoming: prossime 3 gare scheduled e future
//  - races.get:      dettaglio singola gara per race_id
// Strategia: backend semplice, filtri arbitrari client-side.
// ═══════════════════════════════════════════════════════════

/**
 * Helper: parse una data da Google Sheet in oggetto Date.
 * Sheet può restituire stringhe ISO ('2026-05-10T20:00:00') o
 * oggetti Date già pronti (se la cella è formattata come data).
 */
function parseRaceDate(value) {
  if (value instanceof Date) return value;
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * races.list — Tutte le gare.
 * Auth: richiesta.
 *
 * @param {Object} payload - { status?: 'scheduled'|'live'|'completed'|'cancelled' }
 * @param {Object} ctx - Auth context (richiesto)
 * @returns {Object} { ok, data: { races: [...], count } }
 */
function handleRacesList(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');

  const statusFilter = payload && payload.status;
  const races = getCachedSheetData_(SHEETS.RACES, 900);

  const filtered = statusFilter
    ? races.filter(r => r.status === statusFilter)
    : races;

  filtered.sort((a, b) => {
    const da = parseRaceDate(a.date);
    const db = parseRaceDate(b.date);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return da.getTime() - db.getTime();
  });

  // JOIN championship_name (Wave 9.8)
  const champMap = getChampionshipNameMap_();
  const enriched = filtered.map(r => ({
    ...r,
    championship_name: r.championship_id ? (champMap[r.championship_id] || null) : null
  }));

  return ok({ races: enriched, count: enriched.length });
}

/**
 * races.upcoming — Prossime 3 gare in calendario.
 * Auth: richiesta.
 *
 * Logica: status === 'scheduled' AND date > now, ordinate per data ASC, top 3.
 *
 * @param {Object} payload - {} (ignorato)
 * @param {Object} ctx - Auth context (richiesto)
 * @returns {Object} { ok, data: { races: [...], count } }
 */
function handleRacesUpcoming(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');

  const now = new Date();
  const races = getCachedSheetData_(SHEETS.RACES, 900);

  const upcoming = races
    .filter(r => {
      if (r.status !== 'scheduled') return false;
      const d = parseRaceDate(r.date);
      return d && d.getTime() > now.getTime();
    })
    .sort((a, b) => parseRaceDate(a.date).getTime() - parseRaceDate(b.date).getTime())
    .slice(0, 3);

  // JOIN championship_name (Wave 9.8)
  const champMap = getChampionshipNameMap_();
  const enriched = upcoming.map(r => ({
    ...r,
    championship_name: r.championship_id ? (champMap[r.championship_id] || null) : null
  }));

  return ok({ races: enriched, count: enriched.length });
}

/**
 * races.get — Dettaglio di una singola gara.
 * Auth: richiesta.
 *
 * @param {Object} payload - { race_id: string }
 * @param {Object} ctx - Auth context (richiesto)
 * @returns {Object} { ok, data: { race: {...} } }
 */
function handleRacesGet(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');

  const raceId = payload && payload.race_id;
  if (!raceId) return fail('race_id mancante');

  const races = getCachedSheetData_(SHEETS.RACES, 900);
  const race = races.find(r => r.race_id === raceId);

  if (!race) return fail('Gara non trovata: ' + raceId);

  // JOIN championship_name (Wave 9.8)
  const champMap = getChampionshipNameMap_();
  race.championship_name = race.championship_id ? (champMap[race.championship_id] || null) : null;

  return ok({ race });
}

// ═══════════════════════════════════════════════════════════
// TEST FUNCTIONS
// ═══════════════════════════════════════════════════════════

/**
 * Test: races.list senza filtri.
 * Atteso: 3 gare, ordinate per data (RACE001 2026-03-15 prima, poi RACE002, RACE003).
 */
function testRacesList() {
  const login = handleAuthLogin({ code: 'CRUCITTI-9182' });
  const ctx = verifyToken(login.data.token);

  const result = handleRacesList({}, ctx);
  Logger.log('races.list result:');
  Logger.log(`Totale: ${result.data.count}`);
  result.data.races.forEach((r, i) => {
    Logger.log(`  ${i + 1}. ${r.race_id} | ${r.race_name} | ${r.status} | ${r.date}`);
  });
}

/**
 * Test: races.list con filtro status=scheduled.
 * Atteso: 2 gare (RACE002 + RACE003).
 */
function testRacesListScheduled() {
  const login = handleAuthLogin({ code: 'CRUCITTI-9182' });
  const ctx = verifyToken(login.data.token);

  const result = handleRacesList({ status: 'scheduled' }, ctx);
  Logger.log('races.list (scheduled) result:');
  Logger.log(`Totale scheduled: ${result.data.count}`);
  result.data.races.forEach(r => {
    Logger.log(`  ${r.race_id} | ${r.race_name}`);
  });

  if (result.data.count === 2) {
    Logger.log('✓ 2 gare scheduled corrette');
  } else {
    Logger.log(`⚠️ Atteso 2, trovate ${result.data.count}`);
  }
}

/**
 * Test: races.upcoming.
 * Atteso: 2 gare future scheduled (RACE002 + RACE003), max 3.
 */
function testRacesUpcoming() {
  const login = handleAuthLogin({ code: 'CRUCITTI-9182' });
  const ctx = verifyToken(login.data.token);

  const result = handleRacesUpcoming({}, ctx);
  Logger.log('races.upcoming result:');
  Logger.log(`Imminenti: ${result.data.count}`);
  result.data.races.forEach((r, i) => {
    Logger.log(`  ${i + 1}. ${r.race_id} | ${r.race_name} | ${r.date}`);
  });
}

/**
 * Test: races.get di RACE001 (completed, gara passata).
 */
function testRacesGet() {
  const login = handleAuthLogin({ code: 'CRUCITTI-9182' });
  const ctx = verifyToken(login.data.token);

  const result = handleRacesGet({ race_id: 'RACE001' }, ctx);
  Logger.log('races.get RACE001 result:');
  Logger.log(JSON.stringify(result.data.race, null, 2));

  if (result.ok && result.data.race.race_id === 'RACE001') {
    Logger.log('✓ Race trovata correttamente');
  } else {
    Logger.log('⚠️ Race non trovata o errata');
  }
}

/**
 * Test: races.get con id inesistente.
 * Atteso: result.ok === false con messaggio di errore.
 */
function testRacesGetNotFound() {
  const login = handleAuthLogin({ code: 'CRUCITTI-9182' });
  const ctx = verifyToken(login.data.token);

  const result = handleRacesGet({ race_id: 'RACE999' }, ctx);
  Logger.log('races.get RACE999 result:');
  Logger.log(JSON.stringify(result));

  if (!result.ok) {
    Logger.log('✓ Errore gestito correttamente');
  } else {
    Logger.log('⚠️ Doveva fallire ma non è fallito');
  }
}

/**
 * races.updatePoster — admin only.
 * Imposta o rimuove l'URL della poster per una gara.
 */
function handleRacesUpdatePoster(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');
  if (!ctx.isStaff) return fail('Forbidden: solo staff o admin può modificare le poster');
  if (!payload || !payload.race_id) return fail('race_id mancante');

  const posterUrl = normalizeDrivePosterUrl_((payload.poster_url || '').trim());

  // basic URL check (stringa vuota OK per rimuovere)
  if (posterUrl && !/^https?:\/\//.test(posterUrl)) {
    return fail('URL non valido: deve iniziare con http:// o https://');
  }

  const sheet = getSheet(SHEETS.RACES);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const raceIdIdx = headers.indexOf('race_id');
  const posterIdx = headers.indexOf('poster_url');

  if (raceIdIdx < 0) return fail('Colonna race_id mancante');
  if (posterIdx < 0) return fail('Colonna poster_url mancante');

  let foundRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][raceIdIdx] === payload.race_id) {
      foundRow = i + 1;
      break;
    }
  }
  if (foundRow === -1) return fail('Gara non trovata: ' + payload.race_id);

  sheet.getRange(foundRow, posterIdx + 1).setValue(posterUrl);
  invalidateSheetCache_(SHEETS.RACES);

  return ok({
    race_id: payload.race_id,
    poster_url: posterUrl,
  });
}

/**
 * Normalizza URL Google Drive "view" in URL diretto utilizzabile come image src.
 * Trasforma:
 *   https://drive.google.com/file/d/FILE_ID/view?usp=sharing
 *   https://drive.google.com/open?id=FILE_ID
 * In:
 *   https://drive.google.com/thumbnail?id=FILE_ID&sz=w1600
 *
 * Lascia invariati URL non Drive o già normalizzati.
 */
function normalizeDrivePosterUrl_(url) {
  if (!url) return url;
  const str = String(url).trim();
  if (!str) return str;

  // Pattern: /file/d/FILE_ID/...
  let match = str.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match) {
    return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1600`;
  }

  // Pattern: ?id=FILE_ID
  match = str.match(/drive\.google\.com\/(?:open|uc)\?(?:[^&]*&)*id=([a-zA-Z0-9_-]+)/);
  if (match) {
    return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1600`;
  }

  return str;
}