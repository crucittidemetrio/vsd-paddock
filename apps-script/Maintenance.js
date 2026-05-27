// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Maintenance Scripts (one-shot, non production)
// ═══════════════════════════════════════════════════════════

/**
 * Pre-launch cleanup: rimuove dati di test prima del go-live.
 *
 * USO:
 * 1. Imposta DRY_RUN = true → Esegui → controlla i log
 * 2. Se i conteggi sono corretti, imposta DRY_RUN = false → Esegui
 *
 * ⚠️ FAI IL BACKUP DEL SHEET PRIMA. File → Crea una copia.
 */
function cleanup_preLaunch_2026_05_15() {
  const DRY_RUN = false;  // ← Cambia a false SOLO dopo aver verificato i log
  const TEST_RACE_IDS = ['RACE001', 'RACE002', 'RACE003'];

  Logger.log(`=== CLEANUP PRE-LAUNCH ${DRY_RUN ? '[DRY RUN]' : '[EXECUTE]'} ===`);
  Logger.log(`Race IDs target: ${TEST_RACE_IDS.join(', ')}`);
  Logger.log('');

  const findRowsByRaceId = (sheetName) => {
    const sheet = getSheet(sheetName);
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return { sheet, rows: [] };
    const headers = data[0];
    const idx = headers.indexOf('race_id');
    if (idx < 0) return { sheet, rows: [] };
    const rows = [];
    for (let i = 1; i < data.length; i++) {
      if (TEST_RACE_IDS.includes(data[i][idx])) rows.push(i + 1);
    }
    return { sheet, rows };
  };

  // Inventario
  const results = findRowsByRaceId(SHEETS.RACE_RESULTS);
  const laps    = findRowsByRaceId(SHEETS.BEST_LAPS);
  const reports = findRowsByRaceId(SHEETS.RACE_REPORTS);
  const races   = findRowsByRaceId(SHEETS.RACES);
  const auditSheet = getSheet(SHEETS.AUDIT_LOG);
  const auditCount = Math.max(0, auditSheet.getLastRow() - 1);

  Logger.log(`📊 INVENTARIO:`);
  Logger.log(`   RaceResults da cancellare: ${results.rows.length}`);
  Logger.log(`   BestLaps da cancellare:    ${laps.rows.length}`);
  Logger.log(`   RaceReports da cancellare: ${reports.rows.length}`);
  Logger.log(`   Races da cancellare:       ${races.rows.length}`);
  Logger.log(`   AuditLog da pulire:        ${auditCount} righe`);
  Logger.log('');

  if (DRY_RUN) {
    Logger.log('🟡 DRY RUN — nessuna modifica effettuata.');
    Logger.log('Per eseguire davvero: imposta DRY_RUN = false e rilancia.');
    return;
  }

  // EXECUTE — ordine cascading-safe + cancellazione decrescente per non sballare indici
  Logger.log('🔴 EXECUTE — cancellazione in corso...');

  const deleteDescending = (sheet, rows, label) => {
    rows.sort((a, b) => b - a);
    rows.forEach(r => sheet.deleteRow(r));
    Logger.log(`   ✅ ${label}: ${rows.length} righe`);
  };

  deleteDescending(results.sheet, results.rows, 'RaceResults');
  deleteDescending(laps.sheet,    laps.rows,    'BestLaps');
  deleteDescending(reports.sheet, reports.rows, 'RaceReports');
  deleteDescending(races.sheet,   races.rows,   'Races');

  if (auditCount > 0) {
    auditSheet.deleteRows(2, auditCount);
    Logger.log(`   ✅ AuditLog: ${auditCount} righe`);
  }

  Logger.log('');
  Logger.log('=== CLEANUP COMPLETATO ===');
}

/**
 * Verifica stato post-cleanup: logga conteggi per tab.
 */
function verify_postLaunch_state() {
  const tabs = [
    SHEETS.DRIVERS,
    SHEETS.TRACKS,
    SHEETS.CARS,
    SHEETS.CHAMPIONSHIPS,
    SHEETS.RACES,
    SHEETS.RACE_RESULTS,
    SHEETS.BEST_LAPS,
    SHEETS.RACE_REPORTS,
    SHEETS.AUDIT_LOG,
  ];

  Logger.log('=== STATO ATTUALE DB ===');
  tabs.forEach(name => {
    const count = Math.max(0, getSheet(name).getLastRow() - 1);
    Logger.log(`   ${name.padEnd(15)} ${count} righe`);
  });
}