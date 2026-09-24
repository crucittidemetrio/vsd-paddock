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

// ═══════════════════════════════════════════════════════════
// Pulizia post-cutover (24/09/2026) — richiesta esplicita di Demetrio
// ("rimuovere dal foglio sheet tutto quanto non necessario, per limitare
// la possibilità di errore"), dopo che TUTTI i domini dati sono stati
// portati su Supabase (vedi cloud/README.md, decisione #265: Apps Script
// resta acceso solo per auth+presence+companion). Verificato leggendo il
// codice sorgente reale (non i commenti) di Codice.js/Presence.js/
// discordAuth.js/Devices.js: le uniche azioni ancora servite da Apps
// Script in produzione (auth.verify/discordStart/discordCallback,
// presence.heartbeat/online — devices.createToken è già migrata a
// Supabase, vedi SUPABASE_MIGRATED_ACTIONS in client.js) leggono un solo
// tab, SHEETS.DRIVERS. Ogni altro tab è dato storico ormai duplicato su
// Supabase (vedi migrazioni #245/#349/#353 in cloud/README.md).
// ═══════════════════════════════════════════════════════════

/**
 * Elenca (sola lettura) tutti i tab del foglio con conteggio righe,
 * marcando quali verrebbero eliminati da deleteOrphanTabs(). Esegui
 * SEMPRE questa PRIMA di deleteOrphanTabs() e controlla i log.
 */
function previewOrphanTabs() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const KEEP = ['Drivers']; // unico tab letto dal codice Apps Script ancora in produzione
  const sheets = ss.getSheets();

  Logger.log(`=== PREVIEW PULIZIA TAB (${sheets.length} tab totali) ===`);
  Logger.log(`Tab che RESTANO: ${KEEP.join(', ')}`);
  Logger.log('');

  const toDelete = [];
  sheets.forEach(sh => {
    const name = sh.getName();
    const rows = Math.max(0, sh.getLastRow() - 1);
    if (KEEP.indexOf(name) !== -1) {
      Logger.log(`✅ MANTIENI  ${name.padEnd(28)} ${rows} righe`);
    } else {
      Logger.log(`🗑️  ELIMINA   ${name.padEnd(28)} ${rows} righe`);
      toDelete.push(name);
    }
  });

  Logger.log('');
  Logger.log(`Totale da eliminare: ${toDelete.length} tab su ${sheets.length}.`);
  Logger.log('Per eseguire davvero: lancia deleteOrphanTabs().');
  return { keep: KEEP, delete: toDelete };
}

/**
 * Elimina tutti i tab tranne Drivers. DISTRUTTIVO — esegui
 * previewOrphanTabs() prima e controlla i log. I dati non vengono persi:
 * sono già tutti migrati su Supabase (vedi note migrazione in
 * cloud/README.md); questa funzione pulisce solo la copia legacy.
 */
function deleteOrphanTabs() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const KEEP = ['Drivers'];
  const sheets = ss.getSheets();

  const deleted = [];
  sheets.forEach(sh => {
    const name = sh.getName();
    if (KEEP.indexOf(name) === -1) {
      ss.deleteSheet(sh);
      deleted.push(name);
      Logger.log(`🗑️  Eliminato: ${name}`);
    }
  });

  Logger.log('');
  Logger.log(`=== COMPLETATO: ${deleted.length} tab eliminati, resta solo ${KEEP.join(', ')} ===`);
  return deleted;
}

/**
 * Rimuove gli 8+1 trigger a tempo ormai RIDONDANTI: sostituiti il
 * 24/09/2026 da pg_cron su Supabase (notifications-cron, job notif-*,
 * vedi cloud/README.md gap #388 — stessa identica logica, ma su dati
 * aggiornati invece che congelati dal cutover). Lasciarli attivi
 * significa rischiare notifiche Discord/push duplicate o contraddittorie
 * (es. doppio augurio di compleanno). garage61RunSync non è in lista:
 * risulta già sospeso/non installato (#361). Esegui una sola volta
 * dall'editor Apps Script.
 */
function removeSupersededTriggers() {
  const SUPERSEDED_HANDLERS = [
    'runBirthdayCheck',            // → notif-birthday-daily
    'runWeeklyDigest',             // → notif-weekly-digest
    'runSponsorFollowUpDigest',    // → notif-sponsor-follow-up
    'runRsvpReminderCheck',        // → notif-rsvp-reminder
    'runSkillIndexSnapshot',       // → notif-skill-index-snapshot
    'runStintNotificationsCheck',  // → notif-stint-notifications
    'runUpcomingRacePushCheck',    // → notif-upcoming-race-push
    'runTeamSessionReminderCheck', // → notif-team-session-reminder
    // Dominio Fuel/Energy già su Supabase: archivia un tab (FuelLog) che
    // nessun codice legge più, nessun equivalente Supabase necessario
    // (non è una notifica, solo manutenzione di un tab ora orfano).
    'fuelLogArchiveDailyRun',
  ];

  const triggers = ScriptApp.getProjectTriggers();
  const removed = [];
  triggers.forEach(t => {
    const handler = t.getHandlerFunction();
    if (SUPERSEDED_HANDLERS.indexOf(handler) !== -1) {
      ScriptApp.deleteTrigger(t);
      removed.push(handler);
      Logger.log(`🗑️  Trigger rimosso: ${handler}`);
    }
  });

  Logger.log('');
  Logger.log(`=== COMPLETATO: ${removed.length}/${SUPERSEDED_HANDLERS.length} trigger rimossi ===`);
  const stillInstalled = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction());
  Logger.log(`Trigger ancora attivi sul progetto: ${stillInstalled.join(', ') || '(nessuno)'}`);
  return removed;
}