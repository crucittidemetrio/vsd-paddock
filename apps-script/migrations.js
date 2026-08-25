function migrate_wave98_championshipsAndEventType() {
  const ss = SpreadsheetApp.openById(VSD_HUB_SPREADSHEET_ID);
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
  const ss = SpreadsheetApp.openById(VSD_HUB_SPREADSHEET_ID);
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
/**
 * migrate_addRosterTrackColumn
 * Aggiunge la colonna `roster_track` al foglio Drivers — valori attesi
 * 'competitivo' | 'amatoriale' | '' (non ancora dichiarato). Introdotta
 * con l'annuncio "Due strade, stesso team" (08/2026): da qui in avanti
 * ogni pilota dichiara in quale roster si riconosce, self-declare via
 * roster.updateSelf (vedi Roster.js — ROSTER_SELF_EDITABLE_FIELDS).
 * Campo pubblico (DRIVER_PUBLIC_FIELDS in Codice.js): non è dato
 * sensibile, ed è utile a tutto il team sapere chi corre su quale
 * percorso. Idempotente.
 */
function migrate_addRosterTrackColumn() {
  const ss = SpreadsheetApp.openById(VSD_HUB_SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Drivers');
  if (!sheet) { Logger.log('❌ Tab Drivers non trovato'); return; }

  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  if (headers.indexOf('roster_track') !== -1) {
    Logger.log('⏭️  Colonna `roster_track` già esistente, migration skippata');
    return;
  }

  const newColIdx = lastCol + 1;
  sheet.getRange(1, newColIdx).setValue('roster_track');
  Logger.log('✅ Colonna `roster_track` aggiunta a Drivers (colonna #' + newColIdx + ')');
}

function migrate_addRaceNumberColumn() {
  const ss = SpreadsheetApp.openById(VSD_HUB_SPREADSHEET_ID);
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

/**
 * migrate_addGalleryUrlsColumn
 * Aggiunge la colonna `gallery_urls` al foglio Races.
 * Contiene una lista di URL immagini (screenshot gara) separati da virgola,
 * stesso pattern CSV usato per preferred_sims/specialties su Drivers.
 * Idempotente.
 */
function migrate_addGalleryUrlsColumn() {
  const ss = SpreadsheetApp.openById(VSD_HUB_SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Races');
  if (!sheet) { Logger.log('❌ Tab Races non trovato'); return; }

  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  if (headers.indexOf('gallery_urls') !== -1) {
    Logger.log('⏭️  Colonna `gallery_urls` già esistente, migration skippata');
    return;
  }

  const newColIdx = lastCol + 1;
  sheet.getRange(1, newColIdx).setValue('gallery_urls');
  Logger.log('✅ Colonna `gallery_urls` aggiunta a Races (colonna #' + newColIdx + ')');
}

/**
 * migrate_addWeatherColumnsToBestLaps
 * Aggiunge le colonne `air_temp_c` e `track_temp_c` (temperatura aria e
 * pista, °C) ai fogli BestLaps e BestLapSubmissions. Dati facoltativi e
 * non vincolanti: chi non li rileva/vuole segnalare lascia il campo
 * vuoto, nessuna validazione a bloccare il salvataggio del tempo.
 * Idempotente su entrambi i fogli.
 */
function migrate_addWeatherColumnsToBestLaps() {
  const newCols = ['air_temp_c', 'track_temp_c'];

  [SHEETS.BEST_LAPS, SHEETS.BEST_LAP_SUBMISSIONS].forEach(sheetName => {
    const sheet = getSheet(sheetName);
    if (!sheet) {
      Logger.log(`❌ Tab "${sheetName}" non trovato, skip`);
      return;
    }

    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const toAdd = newCols.filter(c => !headers.includes(c));

    if (toAdd.length === 0) {
      Logger.log(`⏭️  "${sheetName}": colonne già presenti, skip`);
      return;
    }

    const startCol = lastCol + 1;
    sheet.getRange(1, startCol, 1, toAdd.length).setValues([toAdd]);
    Logger.log(`✅ "${sheetName}": aggiunte colonne ${toAdd.join(', ')} (da col #${startCol})`);
  });
}

/**
 * migrate_addCarNumberToEnduranceStints
 * Aggiunge la colonna `car_number` al foglio EnduranceStints — permette a
 * più equipaggi VSD di condividere lo stesso race_id (es. due auto alla
 * 8h di Daytona), ciascuno col proprio piano stint indipendente.
 * Nessun backfill: gli stint esistenti restano con car_number vuoto, da
 * assegnare manualmente (decisione esplicita, vedi thread). Idempotente.
 */
function migrate_addCarNumberToEnduranceStints() {
  const sheet = getSheet(SHEETS.ENDURANCE_STINTS);
  if (!sheet) {
    Logger.log('❌ Tab EnduranceStints non trovato');
    return;
  }

  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  if (headers.includes('car_number')) {
    Logger.log('⏭️  Colonna `car_number` già esistente, migration skippata');
    return;
  }

  const newColIdx = lastCol + 1;
  sheet.getRange(1, newColIdx).setValue('car_number');
  Logger.log('✅ Colonna `car_number` aggiunta a EnduranceStints (colonna #' + newColIdx + ')');
  Logger.log('⚠️  Gli stint esistenti hanno car_number vuoto — assegnalo manualmente dove serve.');
}

/**
 * migrate_add_aciLmgt3Challenge2026
 * Aggiunge il record Championships per l'ACI LMGT3 Challenge 2026 —
 * campionato ESTERNO (indetto da ACI Sport, organizzato tramite il
 * portale Apex Italia Simracing) a cui alcuni piloti VSD tentano di
 * qualificarsi. Riusa il motore Championships/Races/RaceResults già
 * esistente (stesso pattern di UE144, non un dominio bespoke come
 * ClashOfClasses.js) — season='2026' così le edizioni future si
 * aggiungono come nuove righe con season diverso, stesso id-prefix.
 *
 * Dati dal regolamento ufficiale ACI Sport (RDS LMGT3 Challenge 2026,
 * pubblicato 17/07/2026): 6 gare da 75', field 35 equipaggi, classe
 * unica LMGT3 (10 modelli ammessi), iscrizioni chiuse 15/09/2026,
 * prequalifiche 17 e 20/09/2026 se sovrannumero.
 *
 * NB: nessun riferimento a Apex Italia Simracing (nome, logo, link) va
 * pubblicato sul sito finché non arriva l'autorizzazione esplicita —
 * vedi note VSD del 21/08/2026. Questo record backend è dati tecnici
 * (id/date/note interne), non contenuto pubblicato: nessun problema.
 *
 * Idempotente: se il record esiste già (stesso id), non fa nulla.
 */
function migrate_add_aciLmgt3Challenge2026() {
  const sheet = getSheet(SHEETS.CHAMPIONSHIPS);
  if (!sheet) { Logger.log('❌ Tab Championships non trovato'); return; }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const idCol = headers.indexOf('id');
  const lastRow = sheet.getLastRow();
  const id = 'chmp-lmu-aci-lmgt3-challenge-2026';

  if (lastRow > 1) {
    const ids = sheet.getRange(2, idCol + 1, lastRow - 1, 1).getValues().flat();
    if (ids.indexOf(id) !== -1) {
      Logger.log('⏭️  Championship "' + id + '" già presente, migration skippata');
      return;
    }
  }

  const row = {
    id: id,
    name: 'ACI LMGT3 Challenge',
    sim: 'LMU',
    season: '2026',
    status: 'upcoming',
    format: 'sprint',
    start_date: '2026-10-01',
    end_date: '2026-12-10',
    notes: 'Campionato esterno indetto da ACI Sport. Piloti VSD in tentativo di qualificazione. Iscrizioni chiuse 15/09/2026, prequalifiche 17 e 20/09/2026 se sovrannumero (>35 iscritti). Regolamento ufficiale: acisport.it.',
    banner_url: '',
    standings_json: '',
    points_adjustments_json: '',
  };
  const newRow = headers.map(h => (row[h] !== undefined ? row[h] : ''));
  sheet.appendRow(newRow);
  Logger.log('✅ Championship "' + id + '" (ACI LMGT3 Challenge, season 2026) aggiunto.');

  try {
    invalidateSheetCache_(SHEETS.CHAMPIONSHIPS);
    Logger.log('✅ Cache Championships invalidata');
  } catch (e) {
    Logger.log('⚠️ Cache non invalidata (normale se non in contesto API): ' + e.message);
  }
}

/**
 * migrate_addCanMessageColumn
 * Aggiunge la colonna `can_message` (checkbox) al foglio Drivers.
 *
 * Permesso granulare per il compilatore messaggi Discord (Task #86/#102):
 * promuovere un pilota a role='staff' sblocca TUTTA l'area admin
 * (Best Laps, Gestione Gare, Import Risultati, Candidature, Sponsor,
 * Incidenti...), non solo il Messenger — troppo ampio per chi deve
 * solo poter scrivere ai piloti. can_message=true dà accesso alla sola
 * pagina /admin/messenger (vedi ctx.canMessage in verifyToken,
 * Codice.js), lasciando role='driver' per tutto il resto.
 *
 * Tutte le righe esistenti vengono inizializzate a FALSE esplicito
 * (non blank) per evitare ambiguità nel check ctx.canMessage lato
 * backend. Idempotente.
 */
function migrate_addCanMessageColumn() {
  const ss = SpreadsheetApp.openById(VSD_HUB_SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Drivers');
  if (!sheet) { Logger.log('❌ Tab Drivers non trovato'); return; }

  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  if (headers.indexOf('can_message') !== -1) {
    Logger.log('⏭️  Colonna `can_message` già esistente, migration skippata');
    return;
  }

  const newColIdx = lastCol + 1;
  sheet.getRange(1, newColIdx).setValue('can_message');

  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    const dataRange = sheet.getRange(2, newColIdx, lastRow - 1, 1);
    dataRange.setValue(false);
    const rule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
    dataRange.setDataValidation(rule);
  }

  Logger.log('✅ Colonna `can_message` aggiunta a Drivers (colonna #' + newColIdx + '), tutte le righe inizializzate a FALSE');
}