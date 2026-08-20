// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Reports Endpoints
// ═══════════════════════════════════════════════════════════
// 2 endpoint sulla tabella RaceReports, più reazioni emoji (sotto).
//
// PRIVACY MODEL — AGGIORNATO 20/08/2026 (era "2A.6 Wave 4": driver vede
// SOLO i propri report). Decisione esplicita del team: i Race Report
// sono ora visibili a TUTTI i tesserati loggati, non solo al proprio
// autore — prerequisito per le reazioni tra piloti (altrimenti non c'era
// nulla su cui reagire). staff_rating e staff_notes NON sono toccati da
// questo cambio: restano nascosti ai non-staff lato FRONTEND (Reports.jsx
// già li mostra solo se isStaff, indipendentemente da chi ha scritto il
// report) — qui il backend continua a restituirli sempre, la UI decide
// chi li vede, stesso pattern già in uso per gli altri campi staff-only
// nell'app.
// ═══════════════════════════════════════════════════════════

/**
 * Helper: applica il filtro privacy a un array di reports in base al ctx.
 * Chiunque sia autenticato (ctx.driver_id presente, già verificato dal
 * chiamante) vede tutti i report — nessun filtro per proprietà.
 */
function filterReportsByPrivacy(reports, ctx) {
  return reports;
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
  if (!ctx.driver_id) return fail('Auth richiesto');

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
  if (!ctx.driver_id) return fail('Auth richiesto');

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
// REAZIONI EMOJI SUI RACE REPORT
// ═══════════════════════════════════════════════════════════
// Un pilota può reagire a un report (anche il proprio, non c'è motivo di
// vietarlo) con UNA sola emoji da un set fisso — niente picker libero,
// per restare scannabile e coerente. Un secondo tap sulla stessa emoji la
// rimuove (toggle off); tap su un'emoji diversa sostituisce la
// precedente. Un solo reazione per (report_id, driver_id).
//
// Setup: setupReportReactionsTab() — editor Apps Script → ▶ Esegui
// (una tantum, idempotente).
//
// Registrate in Codice.js dispatcher come:
//   'reportReactions.list':   handleReportReactionsList
//   'reportReactions.toggle': handleReportReactionsToggle

const REPORT_REACTIONS_HEADERS = ['reaction_id', 'report_id', 'driver_id', 'emoji', 'created_at'];

// Set fisso — cambiare qui aggiorna anche il frontend (stessa lista
// importata da REPORT_REACTION_EMOJI in src/utils/constants.js, tenerle
// allineate a mano se si tocca questo elenco).
const REPORT_REACTION_EMOJI = ['🔥', '👏', '😂', '💀', '😬'];

function setupReportReactionsTab() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEETS.REPORT_REACTIONS);
  if (sheet) {
    Logger.log('✓ Tab "' + SHEETS.REPORT_REACTIONS + '" già esistente, nessuna modifica.');
    return;
  }
  sheet = ss.insertSheet(SHEETS.REPORT_REACTIONS);
  sheet.getRange(1, 1, 1, REPORT_REACTIONS_HEADERS.length).setValues([REPORT_REACTIONS_HEADERS]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, REPORT_REACTIONS_HEADERS.length).setFontWeight('bold');
  Logger.log('✅ Tab "' + SHEETS.REPORT_REACTIONS + '" creata con ' + REPORT_REACTIONS_HEADERS.length + ' colonne.');
}

/**
 * reportReactions.list — TUTTE le reazioni (dataset piccolo, stesso
 * pattern "carica tutto, filtra client-side" già usato per reports.list).
 * Auth: richiesta.
 */
function handleReportReactionsList(payload, ctx) {
  if (!ctx || !ctx.driver_id) return fail('Auth richiesto');
  const reactions = sheetToObjects(SHEETS.REPORT_REACTIONS);
  return ok({ reactions, count: reactions.length });
}

/**
 * reportReactions.toggle — imposta/toglie/sostituisce la reazione del
 * pilota loggato su un report.
 * Auth: richiesta.
 * @param {Object} payload - { report_id, emoji }
 */
function handleReportReactionsToggle(payload, ctx) {
  if (!ctx || !ctx.driver_id) return fail('Auth richiesto');

  payload = payload || {};
  const reportId = String(payload.report_id || '').trim();
  const emoji = String(payload.emoji || '').trim();
  if (!reportId) return fail('report_id obbligatorio');
  if (REPORT_REACTION_EMOJI.indexOf(emoji) === -1) {
    return fail('emoji non valida — atteso una tra: ' + REPORT_REACTION_EMOJI.join(' '));
  }

  const sheet = getSheet(SHEETS.REPORT_REACTIONS);
  if (!sheet) return fail('Tab ReportReactions non trovata — esegui setupReportReactionsTab() una volta');

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const reportIdx = headers.indexOf('report_id');
  const driverIdx = headers.indexOf('driver_id');
  const emojiIdx = headers.indexOf('emoji');

  for (let i = 1; i < data.length; i++) {
    if (data[i][reportIdx] === reportId && data[i][driverIdx] === ctx.driver_id) {
      if (data[i][emojiIdx] === emoji) {
        // Stessa emoji già presente → toggle off, rimuove la riga.
        sheet.deleteRow(i + 1);
        return ok({ report_id: reportId, emoji: null });
      }
      // Emoji diversa → sostituisce sul posto.
      sheet.getRange(i + 1, emojiIdx + 1).setValue(emoji);
      sheet.getRange(i + 1, headers.indexOf('created_at') + 1).setValue(new Date().toISOString());
      return ok({ report_id: reportId, emoji });
    }
  }

  // Nessuna reazione precedente di questo pilota su questo report → nuova riga.
  const row = {
    reaction_id: 'rx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    report_id: reportId,
    driver_id: ctx.driver_id,
    emoji,
    created_at: new Date().toISOString(),
  };
  sheet.appendRow(REPORT_REACTIONS_HEADERS.map(h => row[h]));
  return ok({ report_id: reportId, emoji });
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
 * AGGIORNATO 20/08/2026: da quando i Race Report sono visibili a tutta
 * la squadra (vedi commento privacy in testa al file), un driver normale
 * vede TUTTI e 5 i report seed, non solo il proprio — comportamento
 * atteso, non una regressione. Nota: usa handleAuthLogin(), rimossa da
 * tempo lato backend (auth.login deprecato, Discord OAuth è l'unico
 * flusso) — questo test è già rotto per motivi indipendenti da questo
 * cambio, non l'ho sistemato qui (fuori scope).
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

  if (result.data.count === 5) {
    Logger.log('✓ Driver vede TUTTI i report della squadra (privacy aperta)');
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