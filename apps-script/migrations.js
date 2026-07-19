function migrate_wave98_championshipsAndEventType() {
  const ss = SpreadsheetApp.openById('1ADUq7CRy0_PtPqbPYS42iCNgpdxZrNlSMY3HX6T8XQA');
  const log = [];

  // ── 1. Tab Championships ─────────────────────────────────────────
  let champ = ss.getSheetByName('Championships');
  if (!champ) {
    champ = ss.insertSheet('Championships');
    const headers = ['id','name','sim','season','status','format','start_date','end_date','notes'];
    champ.getRange(1, 1, 1, headers.length).setValues([headers]);
    champ.setFrozenRows(1);

    const seeds = [
      ['chmp-lmu-iconic-gte-2026',            'Iconic Series GTE',                    'LMU', '2026', 'completed', 'endurance',   '', '', 'Serie GTE conclusa'],
      ['chmp-irc-toyota-gr86-zero-cost-2026', 'Toyota GR86 "Zero Cost" Championship', 'IRC', '2026', 'active',    'single-make', '', '', 'Spec series fixed-setup'],
      ['chmp-lmu-ultimate-endurance-144-2026','Ultimate Endurance 144\'',             'LMU', '2026', 'upcoming',  'endurance',   '', '', 'Format 144 min'],
      ['chmp-lmu-gte-vs-gt3-clash-2026',      'GTE vs GT3 Clash of Classes',          'LMU', '2026', 'draft',     'multi-class', '', '', 'Sfida multi-classe']
    ];
    champ.getRange(2, 1, seeds.length, seeds[0].length).setValues(seeds);
    log.push(`✅ Tab "Championships" creato con ${seeds.length} record seed`);
  } else {
    log.push(`⚠️ Tab "Championships" già esistente, skip creazione`);
  }

  // ── 2. Colonne nuove su Races ────────────────────────────────────
  const races = ss.getSheetByName('Races');
  if (!races) throw new Error('Tab "Races" non trovato!');

  const racesHeaders = races.getRange(1, 1, 1, races.getLastColumn()).getValues()[0];
  const newCols = ['event_type', 'championship_id', 'poster_url'];
  const toAdd = newCols.filter(c => !racesHeaders.includes(c));

  if (toAdd.length === 0) {
    log.push(`⚠️ Tutte le colonne già presenti su Races, skip`);
  } else {
    const startCol = races.getLastColumn() + 1;
    races.getRange(1, startCol, 1, toAdd.length).setValues([toAdd]);
    log.push(`✅ Aggiunte colonne a Races: ${toAdd.join(', ')}`);

    // ── 3. Backfill event_type='4fun' su righe esistenti ──────────
    if (toAdd.includes('event_type')) {
      const evCol = startCol + toAdd.indexOf('event_type');
      const lastRow = races.getLastRow();
      if (lastRow > 1) {
        const fill = Array(lastRow - 1).fill(['4fun']);
        races.getRange(2, evCol, fill.length, 1).setValues(fill);
        log.push(`✅ Backfill event_type='4fun' su ${fill.length} righe esistenti`);
      }
    }
  }

  log.push('🏁 Migration completata');
  log.forEach(l => Logger.log(l));
  return log.join('\n');
}
/**
 * Migration: aggiunge colonna `banner_url` al tab Championships.
 * Inserita PRIMA di standings_json per mantenere l'ordine logico.
 * Idempotente: se la colonna esiste già, non fa nulla.
 * Da eseguire UNA VOLTA dal dropdown function dell'editor Apps Script.
 */
function migrate_addBannerUrlColumn() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Championships');
  if (!sheet) throw new Error('Tab Championships non trovato');

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (headers.includes('banner_url')) {
    Logger.log('⚠️ Colonna banner_url già presente, skip');
    return;
  }

  // Inserisci prima di standings_json (se esiste), altrimenti in append
  const jsonIdx = headers.indexOf('standings_json');
  if (jsonIdx !== -1) {
    sheet.insertColumnBefore(jsonIdx + 1);
    sheet.getRange(1, jsonIdx + 1).setValue('banner_url');
    Logger.log('✅ Colonna banner_url inserita prima di standings_json (col ' + (jsonIdx + 1) + ')');
  } else {
    const newCol = sheet.getLastColumn() + 1;
    sheet.getRange(1, newCol).setValue('banner_url');
    Logger.log('✅ Colonna banner_url aggiunta in fondo (col ' + newCol + ')');
  }

  // Invalida cache Championships
  try {
    invalidateSheetCache_(SHEETS.CHAMPIONSHIPS);
    Logger.log('✅ Cache Championships invalidata');
  } catch(e) {
    Logger.log('⚠️ Cache non invalidata (normale se non in contesto API): ' + e.message);
  }
}

function migrate_addStandingsJsonColumn() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Championships');
  if (!sheet) throw new Error('Tab Championships non trovato');

const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (headers.includes('standings_json')) {
    Logger.log('⚠️ Colonna standings_json già presente, skip');
    return;
  }  

const newCol = sheet.getLastColumn() + 1;
  sheet.getRange(1, newCol).setValue('standings_json');
  Logger.log('✅ Colonna standings_json aggiunta a Championships');
}

/**
 * Migration: aggiunge colonna `incidents` (numero) al tab RaceResults.
 * 
 * Motivo: iRacing event_result JSON contiene `incidents` per pilota,
 * LMU non lo dà. La colonna serve per Wave 9.12 (iRacing import).
 * 
 * Idempotente: se la colonna esiste già, non fa nulla.
 * Da eseguire UNA VOLTA dal dropdown function dell'editor Apps Script.
 */
function migrate_addIncidentsColumn() {
  const sheet = getSheet(SHEETS.RACE_RESULTS);
  if (!sheet) {
    Logger.log('❌ Sheet RaceResults non trovato');
    return;
  }
  
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  
  if (headers.indexOf('incidents') !== -1) {
    Logger.log('⏭️  Colonna `incidents` già esistente, migration skippata');
    return;
  }
  
  const newColIdx = lastCol + 1;
  sheet.getRange(1, newColIdx).setValue('incidents');
  
  // Formato: intero, no decimali
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, newColIdx, lastRow - 1, 1).setNumberFormat('0');
  }
  
  Logger.log('✅ Colonna `incidents` aggiunta a RaceResults (colonna #' + newColIdx + ')');
}

/**
 * migrate_addPointsAdjustmentsColumn
 * Aggiunge la colonna `points_adjustments_json` al foglio Championships.
 * Idempotente: se già presente, esce senza modifiche.
 */
function migrate_addPointsAdjustmentsColumn() {
  const ss = SpreadsheetApp.openById('1ADUq7CRy0_PtPqbPYS42iCNgpdxZrNlSMY3HX6T8XQA');
  const sheet = ss.getSheetByName('Championships');
  if (!sheet) { Logger.log('❌ Tab Championships non trovato'); return; }

  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  if (headers.indexOf('points_adjustments_json') !== -1) {
    Logger.log('⏭️  Colonna `points_adjustments_json` già esistente, migration skippata');
    return;
  }

  const newColIdx = lastCol + 1;
  sheet.getRange(1, newColIdx).setValue('points_adjustments_json');
  Logger.log('✅ Colonna `points_adjustments_json` aggiunta a Championships (colonna #' + newColIdx + ')');
}

/**
 * migrate_addRaceNumberColumn
 * Aggiunge la colonna `race_number` al foglio Races.
 * Usata per campionati multi-gara (es. Race 1 + Race 2 per tracciato).
 * Idempotente.
 */
function migrate_addRaceNumberColumn() {
  const ss = SpreadsheetApp.openById('1ADUq7CRy0_PtPqbPYS42iCNgpdxZrNlSMY3HX6T8XQA');
  const sheet = ss.getSheetByName('Races');
  if (!sheet) { Logger.log('❌ Tab Races non trovato'); return; }

  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  if (headers.indexOf('race_number') !== -1) {
    Logger.log('⏭️  Colonna `race_number` già esistente, migration skippata');
    return;
  }

  const newColIdx = lastCol + 1;
  sheet.getRange(1, newColIdx).setValue('race_number');
  Logger.log('✅ Colonna `race_number` aggiunta a Races (colonna #' + newColIdx + ')');
}