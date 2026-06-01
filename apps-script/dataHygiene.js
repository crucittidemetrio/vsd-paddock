// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Data Hygiene
// ═══════════════════════════════════════════════════════════
// Utility Apps Script per identificare e ripulire incongruenze
// nei dati del database VSD_HUB_DB.
//
// Operazioni:
//   - auditOrphanRaceIds()  → read-only, logga race_id presenti
//                             in RaceResults/RaceReports ma assenti
//                             dal tab Races
// ═══════════════════════════════════════════════════════════

/**
 * Identifica race_id orfani: presenti in sheet collegati (RaceResults,
 * RaceReports) ma assenti dal tab Races autoritativo.
 *
 * Per ogni orfano logga:
 *  - sorgente (quale sheet lo contiene)
 *  - conta righe associate
 *  - sim, track_id, date inferiti dai dati associati
 *  - sample piloti (per identificazione visiva)
 *
 * Sola lettura, idempotente. Esegui per audit prima di decidere
 * la strategia di pulizia.
 */
function auditOrphanRaceIds() {
  Logger.log('[AUDIT race_id orfani] avviato...');

  const racesRaw = getCachedSheetData_(SHEETS.RACES, 900);
  const existingRaceIds = new Set(
    racesRaw.map(r => String(r.race_id || '').trim()).filter(Boolean)
  );
  Logger.log(`  Race in tab Races: ${existingRaceIds.size}`);

  const sources = [
    { name: SHEETS.RACE_RESULTS, label: 'RaceResults' },
    { name: SHEETS.RACE_REPORTS, label: 'RaceReports' },
  ];

  const orphans = new Map(); // race_id → aggregated data

  sources.forEach(({ name, label }) => {
    const rows = sheetToObjects(name);
    Logger.log(`  Scanning ${label}: ${rows.length} righe`);
    rows.forEach(r => {
      const raceId = String(r.race_id || '').trim();
      if (!raceId) return;
      if (existingRaceIds.has(raceId)) return;

      if (!orphans.has(raceId)) {
        orphans.set(raceId, {
          count: 0,
          sources: new Set(),
          sims: new Set(),
          tracks: new Set(),
          dates: new Set(),
          drivers: new Set(),
        });
      }
      const d = orphans.get(raceId);
      d.count++;
      d.sources.add(label);
      if (r.sim) d.sims.add(String(r.sim));
      if (r.track_id) d.tracks.add(String(r.track_id));
      const date = r.set_date || r.date;
      if (date) d.dates.add(String(date).split('T')[0]);
      if (r.driver_id) d.drivers.add(String(r.driver_id));
    });
  });

  Logger.log('───');

  if (orphans.size === 0) {
    Logger.log('✅ Nessun race_id orfano. Data hygiene clean.');
    return { orphans: 0 };
  }

  Logger.log(`⚠️  ${orphans.size} race_id orfani trovati:`);
  Logger.log('');

  const sortedKeys = Array.from(orphans.keys()).sort();
  sortedKeys.forEach(rid => {
    const d = orphans.get(rid);
    const sims = [...d.sims].join(', ') || '(none)';
    const tracks = [...d.tracks].slice(0, 2).join(', ') + (d.tracks.size > 2 ? `... (+${d.tracks.size - 2})` : '');
    const dates = [...d.dates].slice(0, 2).join(', ') + (d.dates.size > 2 ? `... (+${d.dates.size - 2})` : '');
    Logger.log(`  ${rid}`);
    Logger.log(`    Sorgente: ${[...d.sources].join(' + ')} (${d.count} righe)`);
    Logger.log(`    Sim: ${sims} | Track: ${tracks || '(none)'} | Date: ${dates || '(none)'}`);
    Logger.log(`    Piloti distinti: ${d.drivers.size}`);
    Logger.log('');
  });

  return { orphans: orphans.size, list: sortedKeys };
}
