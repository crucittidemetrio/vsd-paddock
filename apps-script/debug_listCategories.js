/**
 * Debug: lista valori unici di Cars.category raggruppati per sim.
 * Esegui dall'editor: seleziona la funzione e clicca Esegui.
 * Output in "Registro di esecuzione" sotto.
 */
function debug_listCategories() {
  const ss = SpreadsheetApp.openById(VSD_HUB_SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Cars');
  if (!sheet) throw new Error('Sheet "Cars" non trovato');

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    Logger.log('Sheet Cars vuoto o solo header');
    return;
  }

  const headers = values[0].map(h => String(h).trim());
  const simIdx = headers.indexOf('sim');
  const catIdx = headers.indexOf('category');

  if (simIdx === -1) throw new Error('Colonna "sim" non trovata. Headers: ' + headers.join(', '));
  if (catIdx === -1) throw new Error('Colonna "category" non trovata. Headers: ' + headers.join(', '));

  // NO trim su category: vogliamo vedere eventuali trailing/leading space sporchi
  const bySim = {};
  for (let i = 1; i < values.length; i++) {
    const sim = String(values[i][simIdx] || '').trim();
    const cat = String(values[i][catIdx] || '');
    if (!sim) continue;
    if (!bySim[sim]) bySim[sim] = {};
    bySim[sim][cat] = (bySim[sim][cat] || 0) + 1;
  }

  const sims = Object.keys(bySim).sort();
  Logger.log('=== Categories per sim ===');
  Logger.log('Totale auto: ' + (values.length - 1));
  Logger.log('');

  sims.forEach(sim => {
    const cats = bySim[sim];
    const catNames = Object.keys(cats).sort();
    Logger.log('--- ' + sim + ' (' + catNames.length + ' categorie) ---');
    catNames.forEach(c => {
      const display = c === '' ? '(EMPTY)' : '"' + c + '"';
      Logger.log('  ' + display + ' → ' + cats[c] + ' auto');
    });
    Logger.log('');
  });
}
/**
 * Popola la colonna race_class nelle righe LMU del sheet Cars.
 * Mapping: LMH→Hypercar, LMP2→LMP2, LMP3→LMP3, GTE→GTE, GT3→LMGT3
 * Idempotente: non sovrascrive race_class già popolate.
 */
function populate_lmu_raceclass() {
  const ss = SpreadsheetApp.openById(VSD_HUB_SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Cars');
  if (!sheet) throw new Error('Sheet "Cars" non trovato');

  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(h => String(h).trim());
  const simIdx = headers.indexOf('sim');
  const catIdx = headers.indexOf('category');
  const rcIdx = headers.indexOf('race_class');

  if (simIdx === -1) throw new Error('Colonna "sim" non trovata');
  if (catIdx === -1) throw new Error('Colonna "category" non trovata');
  if (rcIdx === -1) throw new Error('Colonna "race_class" non trovata. Aggiungila al sheet prima di eseguire.');

  const MAPPING = {
    'LMH':  'Hypercar',
    'LMP2': 'LMP2',
    'LMP3': 'LMP3',
    'GTE':  'GTE',
    'GT3':  'LMGT3'
  };

  let updated = 0, skippedAlreadySet = 0, skippedUnknownCat = 0, skippedNonLmu = 0;

  for (let i = 1; i < values.length; i++) {
    const sim = String(values[i][simIdx] || '').trim();
    const cat = String(values[i][catIdx] || '').trim();
    const currentRc = String(values[i][rcIdx] || '').trim();

    if (sim !== 'LMU') { skippedNonLmu++; continue; }
    if (currentRc !== '') { skippedAlreadySet++; continue; }

    const newRc = MAPPING[cat];
    if (!newRc) {
      Logger.log('⚠️ Riga ' + (i + 1) + ': category "' + cat + '" non mappata, skip');
      skippedUnknownCat++;
      continue;
    }

    sheet.getRange(i + 1, rcIdx + 1).setValue(newRc);
    updated++;
  }

  Logger.log('=== Risultato populate_lmu_raceclass ===');
  Logger.log('Righe LMU aggiornate: ' + updated);
  Logger.log('Righe LMU già popolate (skip): ' + skippedAlreadySet);
  Logger.log('Righe LMU con category sconosciuta (skip): ' + skippedUnknownCat);
  Logger.log('Righe non-LMU (skip, normali per ACE/IRC): ' + skippedNonLmu);
}

/**
 * Lista tutti i track_id "sporchi" nei sheet Tracks, BestLaps, Races.
 * Sporco = contiene spazi, OPPURE caratteri fuori da [a-z0-9-].
 */
function debug_listDirtyTrackIds() {
  const ss = SpreadsheetApp.openById(VSD_HUB_SPREADSHEET_ID);
  const sheets = ['Tracks', 'BestLaps', 'Races'];

  const isDirty = (id) => {
    const s = String(id || '');
    if (!s) return false;
    if (s.includes(' ')) return true;
    if (!/^[a-z0-9-]+$/.test(s)) return true;
    return false;
  };

  const allDirty = {}; // track_id → [ "Sheet(count)", ... ]

  sheets.forEach(sheetName => {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      Logger.log('⚠️ Sheet ' + sheetName + ' non trovato');
      return;
    }
    const values = sheet.getDataRange().getValues();
    if (values.length < 2) {
      Logger.log(sheetName + ' vuoto');
      return;
    }
    const headers = values[0].map(h => String(h).trim());
    const trackIdx = headers.indexOf('track_id');
    if (trackIdx === -1) {
      Logger.log('⚠️ Colonna "track_id" non trovata in ' + sheetName + '. Headers: ' + headers.join(', '));
      return;
    }

    const dirtyCounts = {};
    for (let i = 1; i < values.length; i++) {
      const tid = String(values[i][trackIdx] || '');
      if (isDirty(tid)) {
        dirtyCounts[tid] = (dirtyCounts[tid] || 0) + 1;
      }
    }

    if (Object.keys(dirtyCounts).length === 0) {
      Logger.log('✅ ' + sheetName + ': nessun track_id sporco');
      Logger.log('');
      return;
    }

    Logger.log('--- ' + sheetName + ' ---');
    Object.keys(dirtyCounts).sort().forEach(tid => {
      Logger.log('  "' + tid + '" → ' + dirtyCounts[tid] + ' righe');
      if (!allDirty[tid]) allDirty[tid] = [];
      allDirty[tid].push(sheetName + '(' + dirtyCounts[tid] + ')');
    });
    Logger.log('');
  });

  Logger.log('=== SINTESI track_id sporchi totali ===');
  const allKeys = Object.keys(allDirty).sort();
  if (allKeys.length === 0) {
    Logger.log('✅ Nessuno');
  } else {
    allKeys.forEach(tid => {
      Logger.log('  "' + tid + '" → ' + allDirty[tid].join(', '));
    });
  }
}

/**
 * Rinomina i track_id sporchi in Tracks, BestLaps, Races.
 * Idempotente: se eseguito due volte, la seconda non fa nulla.
 */
function rename_track_ids() {
  const ss = SpreadsheetApp.openById(VSD_HUB_SPREADSHEET_ID);

  const MAPPING = {
    // Tracks (26)
    'ace-brands hatch-gp':                  'ace-brands-hatch-gp',
    'ace-brands hatch-indy':                'ace-brands-hatch-indy',
    'ace-donington park-gp':                'ace-donington-park-gp',
    'ace-donington park-national':          'ace-donington-park-national',
    'ace-fuji-gp short':                    'ace-fuji-gp-short',
    'ace-mount panorama-gp':                'ace-mount-panorama-gp',
    'ace-oulton park-foster':               'ace-oulton-park-foster',
    'ace-oulton park-gp':                   'ace-oulton-park-gp',
    'ace-paul ricard-1AV2':                 'ace-paul-ricard-1av2',
    'ace-paul ricard-1CV2':                 'ace-paul-ricard-1cv2',
    'ace-paul ricard-3A':                   'ace-paul-ricard-3a',
    'ace-paul ricard-3C':                   'ace-paul-ricard-3c',
    'ace-red bul ring-national':            'ace-red-bull-ring-national',     // typo fix
    'ace-red bull ring-gp':                 'ace-red-bull-ring-gp',
    'ace-road atlanta-gp':                  'ace-road-atlanta-gp',
    'ace-watkins glen-gp ':                 'ace-watkins-glen-gp',            // trailing space
    'ace-watkins glen-gp inner loop':       'ace-watkins-glen-gp-inner-loop',
    'ace-watkins glen-short':               'ace-watkins-glen-short',
    'ace-watkins glen-short inner loop':    'ace-watkins-glen-short-inner-loop',
    'irc-summit point raceway':             'irc-summit-point-raceway',
    'irc-tzukuba circuit- 2000 full':       'irc-tsukuba-circuit-2000-full',  // typo fix
    'lmu-paul ricard-1A':                   'lmu-paul-ricard-1a',
    'lmu-paul ricard-1AV2':                 'lmu-paul-ricard-1av2',
    'lmu-paul ricard-1AV2Sh':               'lmu-paul-ricard-1av2sh',
    'lmu-paul ricard-3A':                   'lmu-paul-ricard-3a',
    'lmu-paul ricard-gp':                   'lmu-paul-ricard-gp',

    // Races (12)
    'irc-charlotte motor speedway':         'irc-charlotte-motor-speedway',
    'irc-circuito de navarra':              'irc-circuito-de-navarra',
    'irc-lime rock park':                   'irc-lime-rock-park',
    'irc-miami international autodrome':    'irc-miami-international-autodrome',
    'irc-motorsport arena raceway':         'irc-motorsport-arena-raceway',
    'irc-oulton park circuit':              'irc-oulton-park-circuit',
    'irc-snetterton circuit':               'irc-snetterton-circuit',
    'irc-tsukuba circuit':                  'irc-tsukuba-circuit',
    'irc-virginia international raceway':   'irc-virginia-international-raceway',
    'lmu-fuji speedway-gp':                 'lmu-fuji-speedway-gp',           // ⭐ Lumh Round 1
    'lmu-le mans-gp':                       'lmu-le-mans-gp',
  };

  const sheets = ['Tracks', 'BestLaps', 'Races', 'RaceResults', 'RaceReports'];
  const stats = {};

  sheets.forEach(sheetName => {
    stats[sheetName] = { renamed: 0, skipped: 0 };
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      Logger.log('⚠️ Sheet ' + sheetName + ' non trovato');
      return;
    }

    const values = sheet.getDataRange().getValues();
    if (values.length < 2) return;

    const headers = values[0].map(h => String(h).trim());
    const trackIdx = headers.indexOf('track_id');
    if (trackIdx === -1) {
      Logger.log('⚠️ Colonna track_id non trovata in ' + sheetName);
      return;
    }

    Logger.log('--- ' + sheetName + ' ---');
    for (let i = 1; i < values.length; i++) {
      const currentId = String(values[i][trackIdx] || '');
      const newId = MAPPING[currentId];
      if (newId && newId !== currentId) {
        sheet.getRange(i + 1, trackIdx + 1).setValue(newId);
        Logger.log('  riga ' + (i + 1) + ': "' + currentId + '" → "' + newId + '"');
        stats[sheetName].renamed++;
      } else {
        stats[sheetName].skipped++;
      }
    }
    Logger.log('');
  });

  Logger.log('=== STATISTICHE ===');
  Object.keys(stats).forEach(s => {
    Logger.log(s + ': ' + stats[s].renamed + ' rinominate, ' + stats[s].skipped + ' invariate');
  });
}

/**
 * Lista i track_id usati in BestLaps/Races che NON hanno
 * una riga corrispondente in Tracks (orphans).
 * Quelli verranno mostrati come slug raw nell'UI.
 */
function debug_orphanTrackIds() {
  const ss = SpreadsheetApp.openById(VSD_HUB_SPREADSHEET_ID);

  // 1. Carica i track_id definiti in Tracks
  const tracksSheet = ss.getSheetByName('Tracks');
  const tracksValues = tracksSheet.getDataRange().getValues();
  const tracksHeaders = tracksValues[0].map(h => String(h).trim());
  const tracksIdx = tracksHeaders.indexOf('track_id');
  if (tracksIdx === -1) throw new Error('track_id non trovato in Tracks');

  const definedIds = new Set();
  for (let i = 1; i < tracksValues.length; i++) {
    const id = String(tracksValues[i][tracksIdx] || '').trim();
    if (id) definedIds.add(id);
  }
  Logger.log('Tracks definisce ' + definedIds.size + ' track_id unici');
  Logger.log('');

  // 2. Per BestLaps + Races, lista quelli che NON sono in Tracks
  ['BestLaps', 'Races', 'RaceResults', 'RaceReports'].forEach(sheetName => {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    const values = sheet.getDataRange().getValues();
    const headers = values[0].map(h => String(h).trim());
    const idx = headers.indexOf('track_id');
    if (idx === -1) {
      Logger.log('⚠️ track_id non trovato in ' + sheetName);
      return;
    }

    // Anche includo il sim per riferimento (aiuta a capire dove inserirlo)
    const simIdx = headers.indexOf('sim');

    const orphans = {}; // track_id → { count, sim }
    for (let i = 1; i < values.length; i++) {
      const id = String(values[i][idx] || '').trim();
      if (!id) continue;
      if (!definedIds.has(id)) {
        if (!orphans[id]) orphans[id] = { count: 0, sim: simIdx !== -1 ? String(values[i][simIdx] || '') : '?' };
        orphans[id].count++;
      }
    }

    const keys = Object.keys(orphans).sort();
    if (keys.length === 0) {
      Logger.log('✅ ' + sheetName + ': tutti i track_id hanno match in Tracks');
    } else {
      Logger.log('--- ' + sheetName + ' — orfani (usati ma non definiti in Tracks) ---');
      keys.forEach(id => {
        Logger.log('  sim=' + orphans[id].sim + '  "' + id + '"  → ' + orphans[id].count + ' righe');
      });
    }
    Logger.log('');
  });
}

/**
 * Aggiunge a Tracks le 15 entries orphan rilevate da debug_orphanTrackIds.
 * Idempotente: skip se track_id già esistente.
 * Le altre colonne (se Tracks ne ha oltre sim/track_id/track_name) restano vuote.
 */
function populate_missing_tracks() {
  const ss = SpreadsheetApp.openById(VSD_HUB_SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Tracks');

  const NEW_TRACKS = [
    // LMU (4)
    { sim: 'LMU', track_id: 'lmu-algarve-gp',                     track_name: 'Algarve GP' },
    { sim: 'LMU', track_id: 'lmu-fuji-speedway-gp',               track_name: 'Fuji Speedway GP' },
    { sim: 'LMU', track_id: 'lmu-le-mans-gp',                     track_name: 'Le Mans Bugatti' },
    { sim: 'LMU', track_id: 'lmu-qatar-gp',                       track_name: 'Losail GP' },
    // IRC (11)
    { sim: 'IRC', track_id: 'irc-barcellona',                     track_name: 'Barcelona' },
    { sim: 'IRC', track_id: 'irc-charlotte-motor-speedway',       track_name: 'Charlotte Motor Speedway' },
    { sim: 'IRC', track_id: 'irc-circuito-de-navarra',            track_name: 'Circuito de Navarra' },
    { sim: 'IRC', track_id: 'irc-imola',                          track_name: 'Imola' },
    { sim: 'IRC', track_id: 'irc-lime-rock-park',                 track_name: 'Lime Rock Park' },
    { sim: 'IRC', track_id: 'irc-miami-international-autodrome',  track_name: 'Miami International Autodrome' },
    { sim: 'IRC', track_id: 'irc-motorsport-arena-raceway',       track_name: 'Motorsport Arena Raceway' },
    { sim: 'IRC', track_id: 'irc-oulton-park-circuit',            track_name: 'Oulton Park' },
    { sim: 'IRC', track_id: 'irc-snetterton-circuit',             track_name: 'Snetterton' },
    { sim: 'IRC', track_id: 'irc-tsukuba-circuit',                track_name: 'Tsukuba' },
    { sim: 'IRC', track_id: 'irc-virginia-international-raceway', track_name: 'Virginia International Raceway' },
  ];

  const values = sheet.getDataRange().getValues();
  if (values.length < 1) {
    Logger.log('⚠️ Sheet Tracks vuoto');
    return;
  }
  const headers = values[0].map(h => String(h).trim());
  Logger.log('Headers Tracks: ' + headers.join(' | '));

  const idxSim  = headers.indexOf('sim');
  const idxTid  = headers.indexOf('track_id');
  const idxName = headers.indexOf('track_name');

  if (idxSim === -1 || idxTid === -1 || idxName === -1) {
    Logger.log('⚠️ Headers mancanti (sim, track_id o track_name). Stop.');
    return;
  }

  // Set track_id già esistenti per dedup
  const existing = new Set();
  for (let i = 1; i < values.length; i++) {
    const id = String(values[i][idxTid] || '').trim();
    if (id) existing.add(id);
  }

  let added = 0, skipped = 0;
  NEW_TRACKS.forEach(t => {
    if (existing.has(t.track_id)) {
      Logger.log('  SKIP (già presente): ' + t.track_id);
      skipped++;
      return;
    }
    const newRow = new Array(headers.length).fill('');
    newRow[idxSim]  = t.sim;
    newRow[idxTid]  = t.track_id;
    newRow[idxName] = t.track_name;
    sheet.appendRow(newRow);
    Logger.log('  ADD: ' + t.sim + '  "' + t.track_id + '"  →  "' + t.track_name + '"');
    added++;
  });

  Logger.log('');
  Logger.log('=== STATS ===');
  Logger.log('Aggiunte: ' + added);
  Logger.log('Skipped: ' + skipped);
}

function debug_inspectLeMansTracks() {
  const ss = SpreadsheetApp.openById(VSD_HUB_SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Tracks');
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(h => String(h).trim());
  const idx = headers.indexOf('track_id');
  let found = 0;
  for (let i = 1; i < values.length; i++) {
    const id = String(values[i][idx] || '').trim();
    if (id.includes('le-mans') || id.includes('le mans')) {
      Logger.log('--- riga ' + (i + 1) + ' ---');
      headers.forEach((h, j) => Logger.log(h + ': ' + JSON.stringify(values[i][j])));
      Logger.log('');
      found++;
    }
  }
  Logger.log('Trovate ' + found + ' righe Le Mans');
}

/**
 * 1. INSPECT — conta righe per (race_id, session_type).
 *    Se vedi valori inattesi (es. 44 invece di 22), c'è doppio import.
 */
function debug_inspect_race_results() {
  const ss = SpreadsheetApp.openById(VSD_HUB_SPREADSHEET_ID);
  const sheet = ss.getSheetByName('RaceResults');
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(h => String(h).trim());
  const idxRace = headers.indexOf('race_id');
  const idxSession = headers.indexOf('session_type');
  if (idxRace === -1 || idxSession === -1) {
    Logger.log('⚠️ Headers mancanti'); return;
  }
  const counts = {};
  for (let i = 1; i < values.length; i++) {
    const r = String(values[i][idxRace] || '').trim();
    const s = String(values[i][idxSession] || '').trim();
    const key = r + '  [' + s + ']';
    counts[key] = (counts[key] || 0) + 1;
  }
  Object.keys(counts).sort().forEach(k => {
    Logger.log(k + ': ' + counts[k] + ' righe');
  });
}

/**
 * 2. DRY RUN — mostra quali righe verrebbero rimosse, NON cancella nulla.
 *    Esegui questa PRIMA di apply per verificare.
 */
function dedup_race_results_dry() {
  return _dedup_race_results_internal(true);
}

/**
 * 3. APPLY — rimuove i duplicati per chiave (race_id, session_type, driver_id).
 *    Tiene la PRIMA occorrenza (top-down), rimuove le successive.
 *    NON reversibile — esegui dry run prima.
 */
function dedup_race_results_apply() {
  return _dedup_race_results_internal(false);
}

function _dedup_race_results_internal(dryRun) {
  const ss = SpreadsheetApp.openById(VSD_HUB_SPREADSHEET_ID);
  const sheet = ss.getSheetByName('RaceResults');
  if (!sheet) { Logger.log('⚠️ RaceResults non trovato'); return; }

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) { Logger.log('Vuoto'); return; }
  const headers = values[0].map(h => String(h).trim());
  const idxRace = headers.indexOf('race_id');
  const idxDriver = headers.indexOf('driver_id');
  const idxDriverExt = headers.indexOf('driver_name_external');
  const idxSession = headers.indexOf('session_type');

  if (idxRace === -1 || idxSession === -1) {
    Logger.log('⚠️ Headers mancanti: race_id / session_type');
    return;
  }
  if (idxDriver === -1 && idxDriverExt === -1) {
    Logger.log('⚠️ Né driver_id né driver_name_external trovati');
    return;
  }

  const seen = new Set();
  const rowsToDelete = [];

  for (let i = 1; i < values.length; i++) {
    const raceId = String(values[i][idxRace] || '').trim();
    const sessionType = String(values[i][idxSession] || '').trim();
    const driverId = idxDriver !== -1 ? String(values[i][idxDriver] || '').trim() : '';
    const driverExt = idxDriverExt !== -1 ? String(values[i][idxDriverExt] || '').trim().toLowerCase() : '';
    // Fallback: VSD piloti usano driver_id, esterni usano driver_name_external
    const driverKey = driverId || driverExt;

    if (!raceId || !driverKey) continue;
    const key = raceId + '__' + sessionType + '__' + driverKey;

    if (seen.has(key)) {
      rowsToDelete.push(i + 1);
    } else {
      seen.add(key);
    }
  }

  Logger.log('Entries uniche: ' + seen.size);
  Logger.log('Duplicati trovati: ' + rowsToDelete.length);
  Logger.log('');

  if (rowsToDelete.length === 0) {
    Logger.log('✅ Nessun duplicato. Niente da fare.');
    return;
  }

  if (dryRun) {
    Logger.log('🔍 DRY RUN — niente cancellato. Anteprima prime 20 righe da rimuovere:');
    rowsToDelete.slice(0, 20).forEach(r => Logger.log('  riga ' + r));
    Logger.log('');
    Logger.log('Per applicare il cleanup → esegui dedup_race_results_apply()');
    return;
  }

  rowsToDelete.sort((a, b) => b - a);
  rowsToDelete.forEach(r => sheet.deleteRow(r));
  Logger.log('✅ Rimosse ' + rowsToDelete.length + ' righe duplicate.');
}