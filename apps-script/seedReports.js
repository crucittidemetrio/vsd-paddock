// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Seed RaceReports
// ═══════════════════════════════════════════════════════════
// Utility Apps Script per pre-popolare il tab RaceReports a partire
// dai dati autoritativi di RaceResults.
//
// Per ogni RaceResult VSD non-DNS della sessione 'race', crea una riga
// in RaceReports con i campi numerici già compilati (grid_position,
// finish_position, best_lap_ms). I campi qualitativi (incident_notes,
// damage_report, strategy_notes, staff_rating, staff_notes) restano
// vuoti e vanno compilati dal team manager nel sheet.
//
// Operazioni:
//   - seedRaceReports()           → pre-popola report per TUTTE le gare
//   - seedRaceReportsForRace(id)  → pre-popola solo per una gara specifica
//
// Idempotente: usa (race_id, driver_id) come chiave unica. Righe già
// presenti vengono skippate, quindi puoi rilanciare in sicurezza.
// ═══════════════════════════════════════════════════════════

/**
 * Pre-popola RaceReports per tutte le gare presenti in RaceResults.
 */
function seedRaceReports() {
  return seedRaceReports_(null);
}

/**
 * Pre-popola RaceReports per una singola gara (utile dopo aver importato
 * una gara nuova, per non rifare il merge sull'intero storico).
 */
function seedRaceReportsForRace(raceId) {
  if (!raceId) throw new Error('raceId obbligatorio');
  return seedRaceReports_(raceId);
}

function seedRaceReports_(filterRaceId) {
  const tag = filterRaceId ? `[SEED ${filterRaceId}]` : '[SEED ALL]';
  Logger.log(`${tag} RaceReports avviato...`);

  const raceResultsRaw = sheetToObjects(SHEETS.RACE_RESULTS);
  const raceReportsRaw = sheetToObjects(SHEETS.RACE_REPORTS);

  // Lookup (race_id, driver_id) già presenti
  const existing = new Set();
  raceReportsRaw.forEach(r => {
    if (r.race_id && r.driver_id) {
      existing.add(`${r.race_id}__${r.driver_id}`);
    }
  });

  // Max report num corrente
  let maxReportNum = 0;
  raceReportsRaw.forEach(r => {
    const m = String(r.report_id || '').match(/REP(\d+)/i);
    if (m) maxReportNum = Math.max(maxReportNum, parseInt(m[1], 10));
  });

  Logger.log(`  RaceResults caricati: ${raceResultsRaw.length}`);
  Logger.log(`  RaceReports esistenti: ${raceReportsRaw.length}. maxReportNum=${maxReportNum}`);

  const draftRows = [];
  const skipped = { dns: 0, notVsd: 0, notRace: 0, alreadyExists: 0, otherRace: 0 };
  const now = new Date().toISOString();

  raceResultsRaw.forEach(rr => {
    // Filtro per gara specifica (se richiesto)
    if (filterRaceId && rr.race_id !== filterRaceId) { skipped.otherRace++; return; }

    // Solo piloti VSD
    const isVsd = String(rr.is_vsd_driver || '').toUpperCase() === 'TRUE';
    if (!isVsd) { skipped.notVsd++; return; }

    // Skip DNS (non c'era gara per quel pilota)
    const isDns = String(rr.dns || '').toUpperCase() === 'TRUE';
    if (isDns) { skipped.dns++; return; }

    // Solo sessioni race (non qualifying)
    const sessionType = String(rr.session_type || 'race').toLowerCase();
    if (sessionType !== 'race') { skipped.notRace++; return; }

    // Dedup per (race_id, driver_id)
    const key = `${rr.race_id}__${rr.driver_id}`;
    if (existing.has(key)) { skipped.alreadyExists++; return; }
    existing.add(key);

    maxReportNum++;
    const reportId = 'REP' + String(maxReportNum).padStart(3, '0');

    const isDnf = String(rr.dnf || '').toUpperCase() === 'TRUE';

    draftRows.push({
      report_id: reportId,
      race_id: rr.race_id,
      driver_id: rr.driver_id,
      grid_position: rr.qual_position || '',
      finish_position: isDnf ? '' : (rr.finish_position || ''),
      best_lap_ms: rr.best_lap_ms || '',
      incidents: '',
      incident_notes: isDnf ? '⚠ DNF — investigare causa nel replay' : '',
      damage_report: '',
      strategy_notes: '',
      staff_rating: '',
      staff_notes: '',
      created_at: now,
    });
    Logger.log(`  + ${reportId} ← ${rr.race_id} / ${rr.driver_id} (${isDnf ? 'DNF' : 'P' + rr.finish_position})`);
  });

  Logger.log('───');
  Logger.log(`Skip DNS: ${skipped.dns}`);
  Logger.log(`Skip non-VSD: ${skipped.notVsd}`);
  Logger.log(`Skip non-race (qualifying): ${skipped.notRace}`);
  Logger.log(`Skip già presenti: ${skipped.alreadyExists}`);
  if (filterRaceId) Logger.log(`Skip gara diversa: ${skipped.otherRace}`);

  if (draftRows.length === 0) {
    Logger.log('🚫 Nessun nuovo report da creare.');
    return { drafted: 0 };
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.RACE_REPORTS);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rows = draftRows.map(r => headers.map(h => (r[h] !== undefined ? r[h] : '')));
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);

  Logger.log(`✅ ${rows.length} report draftati in RaceReports.`);
  Logger.log('Compila incident_notes, damage_report, strategy_notes, staff_rating, staff_notes nel sheet.');
  return { drafted: rows.length };
}
