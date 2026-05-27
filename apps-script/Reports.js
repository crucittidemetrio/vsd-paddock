// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Reports Endpoints
// ═══════════════════════════════════════════════════════════
// 2 endpoint sulla tabella RaceReports.
// 
// PRIVACY MODEL (decisione 2A.6 Wave 4):
//  - staff/admin → vedono TUTTI i report
//  - driver      → vede SOLO i propri report (driver_id === ctx.driver_id)
//  - Tutti i campi sono visibili (incluso staff_rating, staff_notes)
//    sui report a cui si ha accesso. Trasparenza piena.
// ═══════════════════════════════════════════════════════════

/**
 * Helper: applica il filtro privacy a un array di reports in base al ctx.
 *  - staff/admin: nessun filtro (vede tutto)
 *  - driver: filtra solo i propri
 */
function filterReportsByPrivacy(reports, ctx) {
  if (ctx.isStaff) return reports;
  return reports.filter(r => r.driver_id === ctx.driver_id);
}

/**
 * reports.list — Lista report di gara.
 * Auth: richiesta.
 *
 * Filtri opzionali combinabili:
 *  - race_id: solo report di una gara specifica
 *  - driver_id: solo report di un pilota specifico (richiede comunque privacy)
 *
 * @param {Object} payload - { race_id?, driver_id? }
 * @param {Object} ctx - Auth context (richiesto)
 * @returns {Object} { ok, data: { reports: [...], count } }
 */
function handleReportsList(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');

  const raceId = payload && payload.race_id;
  const driverId = payload && payload.driver_id;

  let reports = sheetToObjects(SHEETS.RACE_REPORTS);

  // Privacy filter PRIMA dei filtri di payload (importante: un driver
  // non può aggirare il filtro privacy chiedendo report di altri)
  reports = filterReportsByPrivacy(reports, ctx);

  // Filtri opzionali del client
  if (raceId) reports = reports.filter(r => r.race_id === raceId);
  if (driverId) reports = reports.filter(r => r.driver_id === driverId);

  // Ordina per data decrescente (più recenti prima)
  reports.sort((a, b) => {
    const da = new Date(a.created_at).getTime() || 0;
    const db = new Date(b.created_at).getTime() || 0;
    return db - da;
  });

  return ok({ reports, count: reports.length });
}

/**
 * reports.recent — Top N report più recenti (dopo filtro privacy).
 * Auth: richiesta.
 *
 * @param {Object} payload - { limit?: number = 5 }
 * @param {Object} ctx - Auth context (richiesto)
 * @returns {Object} { ok, data: { reports: [...], count } }
 */
function handleReportsRecent(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');

  const limit = (payload && payload.limit) || 5;

  let reports = sheetToObjects(SHEETS.RACE_REPORTS);
  reports = filterReportsByPrivacy(reports, ctx);

  reports.sort((a, b) => {
    const da = new Date(a.created_at).getTime() || 0;
    const db = new Date(b.created_at).getTime() || 0;
    return db - da;
  });

  const top = reports.slice(0, limit);
  return ok({ reports: top, count: top.length });
}

// ═══════════════════════════════════════════════════════════
// TEST FUNCTIONS
// ═══════════════════════════════════════════════════════════

/**
 * Test: reports.list come admin (VSD005).
 * Atteso: 5 report (admin vede tutti).
 */
function testReportsListAsAdmin() {
  const login = handleAuthLogin({ code: 'CRUCITTI-9182' });
  const ctx = verifyToken(login.data.token);

  const result = handleReportsList({}, ctx);
  Logger.log('reports.list (admin) result:');
  Logger.log(`Totale visibili: ${result.data.count}`);
  result.data.reports.forEach(r => {
    Logger.log(`  ${r.report_id} | ${r.driver_id} | P${r.finish_position} | rating=${r.staff_rating}`);
  });

  if (result.data.count === 5) {
    Logger.log('✓ Admin vede tutti e 5 i report');
  } else {
    Logger.log(`⚠️ Atteso 5, trovati ${result.data.count}`);
  }
}

/**
 * Test: reports.list come driver (VSD007 = Gianluca Fabbro).
 * Atteso: 1 report (solo il proprio RPT002).
 */
function testReportsListAsDriver() {
  // VSD007 è un driver normale (non staff/admin)
  // Login come VSD007 — uso il suo access_code dal seed
  const login = handleAuthLogin({ code: 'PANERI-2841' });
  if (!login.ok) {
    Logger.log('⚠️ Login VSD007 fallito: ' + login.error);
    return;
  }
  const ctx = verifyToken(login.data.token);

  Logger.log(`Login OK come ${ctx.driver_id} (role: ${ctx.role})`);

  const result = handleReportsList({}, ctx);
  Logger.log('reports.list (driver VSD007) result:');
  Logger.log(`Totale visibili: ${result.data.count}`);
  result.data.reports.forEach(r => {
    Logger.log(`  ${r.report_id} | ${r.driver_id}`);
  });

  if (result.data.count === 1 && result.data.reports[0].driver_id === 'VSD002') {
  Logger.log('✓ Driver vede SOLO il proprio report');
}
}

/**
 * Test: reports.list con filtro race_id come admin.
 * Atteso: 5 report (tutti i seed sono su RACE001).
 */
function testReportsListByRace() {
  const login = handleAuthLogin({ code: 'CRUCITTI-9182' });
  const ctx = verifyToken(login.data.token);

  const result = handleReportsList({ race_id: 'RACE001' }, ctx);
  Logger.log(`reports.list RACE001 (admin): ${result.data.count} report`);
}

/**
 * Test: reports.recent con limit=3.
 * Atteso: 3 report più recenti (RPT005, RPT004, RPT003 per data decrescente).
 */
function testReportsRecent() {
  const login = handleAuthLogin({ code: 'CRUCITTI-9182' });
  const ctx = verifyToken(login.data.token);

  const result = handleReportsRecent({ limit: 3 }, ctx);
  Logger.log(`reports.recent (limit 3): ${result.data.count} report`);
  result.data.reports.forEach((r, i) => {
    Logger.log(`  ${i + 1}. ${r.report_id} | ${r.created_at}`);
  });
}