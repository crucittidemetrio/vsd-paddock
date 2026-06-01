// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Championships Endpoints (Wave 9.8)
// ═══════════════════════════════════════════════════════════

/**
 * championships.list — Tutti i campionati.
 * Filtri opzionali: sim, status, season.
 *
 * @param {Object} payload - { sim?, status?, season? }
 * @param {Object} ctx - Auth context (richiesto)
 * @returns {Object} { ok, data: { championships, count } }
 */
function handleChampionshipsList(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');

  let championships = getCachedSheetData_(SHEETS.CHAMPIONSHIPS, 3600);

  if (payload) {
    if (payload.sim)    championships = championships.filter(c => c.sim === payload.sim);
    if (payload.status) championships = championships.filter(c => c.status === payload.status);
    if (payload.season) championships = championships.filter(c => String(c.season) === String(payload.season));
  }

  return ok({ championships, count: championships.length });
}

/**
 * Helper interno: map { championship_id => championship_name }
 * Riusato da handleRacesList / handleRacesGet / handleRacesUpcoming per JOIN.
 */
function getChampionshipNameMap_() {
  const list = getCachedSheetData_(SHEETS.CHAMPIONSHIPS, 3600);
  const map = {};
  list.forEach(c => { if (c.id) map[c.id] = c.name; });
  return map;
}

// ═══════════════════════════════════════════════════════════
// TEST FUNCTIONS
// ═══════════════════════════════════════════════════════════

function testChampionshipsList() {
  const login = handleAuthLogin({ code: 'DEMETRIO-6899' });
  if (!login.ok) {
    Logger.log('❌ Login fallito: ' + login.error);
    return;
  }
  const ctx = verifyToken(login.data.token);

  const result = handleChampionshipsList({}, ctx);
  Logger.log('championships.list result:');
  Logger.log(`Totale: ${result.data.count}`);
  result.data.championships.forEach((c, i) => {
    Logger.log(`  ${i + 1}. ${c.id} | ${c.name} | ${c.sim} | ${c.status}`);
  });
}

function testChampionshipsListFiltered() {
  const login = handleAuthLogin({ code: 'DEMETRIO-6899' });
  if (!login.ok) {
    Logger.log('❌ Login fallito: ' + login.error);
    return;
  }
  const ctx = verifyToken(login.data.token);

  const result = handleChampionshipsList({ sim: 'LMU' }, ctx);
  Logger.log('championships.list (sim=LMU) result:');
  Logger.log(`Totale LMU: ${result.data.count}`);
  result.data.championships.forEach(c => {
    Logger.log(`  ${c.id} | ${c.name} | ${c.status}`);
  });
}