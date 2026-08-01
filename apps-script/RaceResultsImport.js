// ═══════════════════════════════════════════════════════════
// RACE RESULTS IMPORT — LMU (qualifying+race) + iRacing event_result
// Wave 9.5/9.6/9.8: LMU import
// Wave 9.12: + iRacing event_result format support
// Wave 9.13: + Discord notifications post-import
// ═══════════════════════════════════════════════════════════

function msToLapDisplay_(ms) {
  if (ms == null || isNaN(ms)) return '';
  const total = Number(ms);
  if (total <= 0) return '';
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const millis = total % 1000;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function msToTimeDisplay_(ms) {
  if (ms == null || isNaN(ms)) return '';
  const total = Number(ms);
  if (total <= 0) return '';
  const hours = Math.floor(total / 3600000);
  const minutes = Math.floor((total % 3600000) / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const millis = total % 1000;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

/**
 * Costruisce mappa { display_name_lowercase: driver_id } dal tab Drivers.
 */
function buildDriverNameMap_() {
  const drivers = getCachedSheetData_(SHEETS.DRIVERS, 600);
  const map = {};
drivers.forEach(d => {
    if (!d.driver_id) return;
    // chiave da display_name (compatto, es. "alessandro p.")
    if (d.display_name) {
      const key = String(d.display_name).toLowerCase().trim();
      if (!map[key]) map[key] = d.driver_id;
    }
    // chiave da real_name (completo, es. "alessandro paneri") — distingue gli omonimi
    // con stessa iniziale cognome (Paneri vs Ponchiardi) nei campionati esterni
    if (d.real_name) {
      const rkey = String(d.real_name).toLowerCase().trim();
      if (!map[rkey]) map[rkey] = d.driver_id;
    }
  });
  return map;
}

/**
 * Wave 9.12: costruisce mappa cust_id (iRacing) → driver_id (VSD).
 */
function buildIracingIdMap_() {
  const sheet = getSheet(SHEETS.DRIVERS);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idIdx = headers.indexOf('driver_id');
  const iracingIdx = headers.indexOf('iracing_id');

  if (idIdx < 0 || iracingIdx < 0) {
    Logger.log('⚠️  Colonne driver_id o iracing_id mancanti in Drivers tab');
    return {};
  }

  const map = {};
  for (let i = 1; i < data.length; i++) {
    const iracingId = String(data[i][iracingIdx] || '').trim();
    const driverId = String(data[i][idIdx] || '').trim();
    if (iracingId && driverId) {
      map[iracingId] = driverId;
    }
  }
  return map;
}

/**
 * Matching multi-livello tra nome esterno e Drivers.display_name.
 *  1. Match esatto lowercase
 *  2. "FirstName LastName" → "firstname l."
 *  3. Single-name driver
 */
function matchDriverName_(externalName, matchMap) {
  if (!externalName) return null;
  const name = String(externalName).toLowerCase().trim();

  if (matchMap[name]) return matchMap[name];

  const parts = name.split(/\s+/);

  if (parts.length >= 2) {
    const variant = `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
    if (matchMap[variant]) return matchMap[variant];
  }

  if (parts.length >= 1 && matchMap[parts[0]]) {
    return matchMap[parts[0]];
  }

  return null;
}

// ═══════════════════════════════════════════════════════════
// IMPORT — entry point con autodetect formato LMU/iRacing
// ═══════════════════════════════════════════════════════════

function importRaceResults_(jsonData, metadata) {
  // Wave 9.12: autodetect iRacing event_result format
  if (jsonData && !Array.isArray(jsonData) && jsonData.type === 'event_result') {
    return importIRacingEventResult_(jsonData, metadata);
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('RaceResults');
  if (!sheet) throw new Error('Tab "RaceResults" non trovato.');

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const driverNameMap = buildDriverNameMap_();
  const timestamp = Date.now();
  const importedAt = new Date().toISOString();

  // ═══ Wave 9.14.2: pre-load chiavi esistenti per dedup ═══
  // Filtra solo per (race_id, session_type) in import → Set di driver_key già presenti.
  // VSD piloti → driver_id; esterni → driver_name_external (lowercase).
  const existingKeys = new Set();
  const lastRow = sheet.getLastRow();
  if (lastRow > 1 && metadata.race_id && metadata.session_type) {
    const allData = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    const idxRace = headers.indexOf('race_id');
    const idxDriverId = headers.indexOf('driver_id');
    const idxDriverExt = headers.indexOf('driver_name_external');
    const idxSession = headers.indexOf('session_type');

    for (let i = 0; i < allData.length; i++) {
      if (String(allData[i][idxRace] || '').trim() !== metadata.race_id) continue;
      if (String(allData[i][idxSession] || '').trim() !== metadata.session_type) continue;
      const did = String(allData[i][idxDriverId] || '').trim();
      const dext = String(allData[i][idxDriverExt] || '').trim().toLowerCase();
      const driverKey = did || dext;
      if (driverKey) existingKeys.add(driverKey);
    }
  }
  // ═══════════════════════════════════════════════════════

  const allRows = [];
  let skippedCount = 0;

  jsonData.forEach((classGroup, classIdx) => {
    const carClass = classGroup.carClass || 'Unknown';
    const results = classGroup.result || [];

    const hasExplicitPosition = results.some(r => r.position != null);

    let sortedResults;
    if (hasExplicitPosition) {
      sortedResults = [...results].sort(
        (a, b) => (a.position != null ? a.position : 999) - (b.position != null ? b.position : 999)
      );
    } else {
      sortedResults = [...results].sort((a, b) => {
        const aLaps = a.totalLaps || 0;
        const bLaps = b.totalLaps || 0;
        if (bLaps !== aLaps) return bLaps - aLaps;
        const aBest = a.bestLap != null ? a.bestLap : Infinity;
        const bBest = b.bestLap != null ? b.bestLap : Infinity;
        return aBest - bBest;
      });
    }

    sortedResults.forEach((r, idx) => {
      const matchedDriverId = matchDriverName_(r.id, driverNameMap) || '';

      // ═══ Wave 9.14.2: dedup check ═══
      const driverKey = matchedDriverId || String(r.id || '').toLowerCase().trim();
      if (driverKey && existingKeys.has(driverKey)) {
        skippedCount++;
        return; // già presente per (race_id, session_type), skip
      }
      if (driverKey) existingKeys.add(driverKey); // evita doppi anche dentro lo stesso JSON
      // ═══════════════════════════════════

      const finishPosition = r.position != null ? r.position : (idx + 1);

      const obj = {
        result_id: `RES-${timestamp}-${classIdx}-${idx}`,
        race_id: metadata.race_id || '',
        sim: metadata.sim || '',
        track_id: metadata.track_id || '',
        set_date: metadata.set_date || '',
        session_type: metadata.session_type || '',
        car_class: carClass,
        car_num: r.carNum != null ? r.carNum : '',
        car_external_name: r.car || '',
        driver_id: matchedDriverId,
        driver_name_external: r.id || '',
        total_laps: r.totalLaps != null ? r.totalLaps : '',
        best_lap_ms: r.bestLap != null ? r.bestLap : '',
        best_lap_display: msToLapDisplay_(r.bestLap),
        total_time_ms: r.totalTime != null ? r.totalTime : '',
        total_time_display: msToTimeDisplay_(r.totalTime),
        finish_position: finishPosition,
        points_given: r.pointsGiven != null ? r.pointsGiven : '',
        penalty_points: r.penaltyPoints != null ? r.penaltyPoints : '',
        point_total: r.pointTotal != null ? r.pointTotal : '',
        dnf: r.dnf === true ? 'TRUE' : (r.dnf === false ? 'FALSE' : ''),
        dns: r.dns === true ? 'TRUE' : (r.dns === false ? 'FALSE' : ''),
        is_vsd_driver: matchedDriverId ? 'TRUE' : 'FALSE',
        incidents: r.incidents != null ? r.incidents : '',
        imported_at: importedAt,
        raw_payload: JSON.stringify(r),
      };

      const row = headers.map(h => obj[h] !== undefined ? obj[h] : '');
      allRows.push(row);
    });
  });

  if (allRows.length === 0) {
    Logger.log(`⚠️ Nessuna riga da importare (skipped duplicati: ${skippedCount})`);
    return {
      imported: 0, vsd_matched: 0, external: 0, dns: 0, dnf: 0,
      skipped_duplicates: skippedCount,
      session_type: metadata.session_type
    };
  }

  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, allRows.length, headers.length).setValues(allRows);

  const vsdCount = allRows.filter(r => r[headers.indexOf('is_vsd_driver')] === 'TRUE').length;
  const dnsCount = allRows.filter(r => r[headers.indexOf('dns')] === 'TRUE').length;
  const dnfCount = allRows.filter(r => r[headers.indexOf('dnf')] === 'TRUE').length;

  Logger.log(`✅ Importate ${allRows.length} righe in RaceResults`);
  Logger.log(`   - VSD drivers: ${vsdCount}`);
  Logger.log(`   - Esterni: ${allRows.length - vsdCount}`);
  Logger.log(`   - DNS: ${dnsCount}`);
  Logger.log(`   - DNF: ${dnfCount}`);
  Logger.log(`   - Skipped (duplicati): ${skippedCount}`);
  Logger.log(`   - Sessione: ${metadata.session_type}`);

  return {
    imported: allRows.length,
    vsd_matched: vsdCount,
    external: allRows.length - vsdCount,
    dns: dnsCount,
    dnf: dnfCount,
    skipped_duplicates: skippedCount,
    session_type: metadata.session_type
  };
}

// ═══════════════════════════════════════════════════════════
// Wave 9.12 — iRacing event_result import
// ═══════════════════════════════════════════════════════════

/**
 * Normalizza il nome sessione iRacing (simsession_name) in session_type VSD.
 * Match "morbido" (contains/startsWith) invece di stringa esatta, perché
 * serie diverse nominano le sessioni in modo diverso:
 *  - endurance con heat: "QUALIFY", "HEAT 1", "FEATURE"
 *  - sprint/normali:     "Lone Qualifying", "Race"
 * Practice/Warmup → null (skip intenzionale, non sono lap da classifica).
 */
function normalizeSessionType_(simsessionName) {
  const n = (simsessionName || '').toUpperCase();
  if (n.includes('QUALIF')) return 'qualifying';
  if (n.startsWith('HEAT')) return 'heat';
  if (n === 'RACE' || n === 'FEATURE') return 'race';
  return null;
}

/**
 * Import iRacing event_result JSON.
 * Trasforma in 3 chiamate a importRaceResults_ (qualifying, heat, race).
 * Practice e Warmup vengono skippate (A1).
 */
function importIRacingEventResult_(raw, metadata) {
  if (!raw || !raw.data) {
    throw new Error('iRacing JSON: campo `data` mancante');
  }
  const data = raw.data;
  const sessions = data.session_results || [];
  if (sessions.length === 0) {
    throw new Error('iRacing JSON: nessuna session_results trovata');
  }

  const aggStats = {
    imported: 0,
    vsd_matched: 0,
    external: 0,
    dnf: 0,
    dns: 0,
    by_session: {},
    sessions_skipped: 0,
  };

  const carClassDefault = (data.car_classes && data.car_classes[0] && data.car_classes[0].name)
    || 'Hosted All Cars';

  for (let s = 0; s < sessions.length; s++) {
    const session = sessions[s];
    const sessionType = normalizeSessionType_(session.simsession_name);

    if (!sessionType) {
      aggStats.sessions_skipped++;
      continue;
    }

    const results = session.results || [];

    const lmuLikeData = [{
      carClass: carClassDefault,
      result: results.map(r => transformIracingResultToLMU_(r)),
    }];

    const sessionMetadata = {
      race_id: metadata.race_id || '',
      sim: metadata.sim || 'IRC',
      track_id: metadata.track_id || '',
      set_date: metadata.set_date || (data.start_time || '').substring(0, 10),
      session_type: sessionType,
    };

    const sessionStats = importRaceResults_(lmuLikeData, sessionMetadata);

    aggStats.imported    += sessionStats.imported    || 0;
    aggStats.vsd_matched += sessionStats.vsd_matched || 0;
    aggStats.external    += sessionStats.external    || 0;
    aggStats.dnf         += sessionStats.dnf         || 0;
    aggStats.dns         += sessionStats.dns         || 0;
    aggStats.by_session[sessionType] = sessionStats.imported || 0;
  }

  Logger.log('✅ iRacing import completato: ' + aggStats.imported + ' righe totali');
  Logger.log('   - Qualifying: ' + (aggStats.by_session.qualifying || 0));
  Logger.log('   - Heat:       ' + (aggStats.by_session.heat       || 0));
  Logger.log('   - Race:       ' + (aggStats.by_session.race       || 0));
  Logger.log('   - Sessioni skippate (practice/warmup): ' + aggStats.sessions_skipped);

  return aggStats;
}

/**
 * Trasforma un singolo driver result iRacing in formato LMU-like.
 */
function transformIracingResultToLMU_(r) {
  const bestLapMs = (r.best_lap_time && r.best_lap_time > 0)
    ? Math.round(r.best_lap_time / 10)
    : null;

  const reasonOut = r.reason_out || '';
  const isDnf = reasonOut !== 'Running' && reasonOut !== '';
  const isDns = (r.laps_complete === 0) && (r.starting_position === -1);

  const position = (r.finish_position != null) ? (r.finish_position + 1) : null;

  const carNum = (r.livery && r.livery.car_number) || '';

  return {
    id: r.display_name || '',
    carNum: carNum,
    car: r.car_name || '',
    totalLaps: r.laps_complete || 0,
    bestLap: bestLapMs,
    totalTime: null,
    position: position,
    pointsGiven: null,
    penaltyPoints: null,
    pointTotal: r.champ_points || 0,
    dnf: isDnf,
    dns: isDns,
    incidents: r.incidents || 0,
  };
}

// ═══════════════════════════════════════════════════════════
// BACKFILL — re-applica matching alle righe esistenti
// ═══════════════════════════════════════════════════════════

function runBackfillRaceResultsMatches() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('RaceResults');
  if (!sheet) throw new Error('Tab RaceResults non trovato');

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const data = sheet.getDataRange().getValues();

  const driverNameMap = buildDriverNameMap_();

  const driverIdIdx = headers.indexOf('driver_id');
  const isVsdIdx = headers.indexOf('is_vsd_driver');
  const externalNameIdx = headers.indexOf('driver_name_external');

  if (driverIdIdx < 0 || isVsdIdx < 0 || externalNameIdx < 0) {
    throw new Error('Colonne mancanti: driver_id, is_vsd_driver, driver_name_external');
  }

  let matchedCount = 0;
  let updatedCount = 0;
  const matchLog = [];

  for (let i = 1; i < data.length; i++) {
    const externalName = data[i][externalNameIdx];
    const matchedId = matchDriverName_(externalName, driverNameMap);

    if (matchedId) {
      matchedCount++;
      const currentId = data[i][driverIdIdx];
      const currentVsd = data[i][isVsdIdx];

      if (currentId !== matchedId || String(currentVsd).toUpperCase() !== 'TRUE') {
        sheet.getRange(i + 1, driverIdIdx + 1).setValue(matchedId);
        sheet.getRange(i + 1, isVsdIdx + 1).setValue('TRUE');
        updatedCount++;
        matchLog.push(`  "${externalName}" → ${matchedId}`);
      }
    }
  }

  Logger.log(`✅ Backfill completato`);
  Logger.log(`   Match trovati: ${matchedCount} / ${data.length - 1} righe`);
  Logger.log(`   Righe aggiornate: ${updatedCount}`);
  if (matchLog.length > 0) {
    Logger.log(`   Dettaglio:`);
    matchLog.forEach(line => Logger.log(line));
  }
}

// ═══════════════════════════════════════════════════════════
// RUN — test manuali editor (editi JSON_DATA + METADATA, esegui)
// ═══════════════════════════════════════════════════════════

function runImportQualifying() {
  const JSON_DATA = [
    {
      "carClass": "Hypercar",
      "result": [
        { "id": "James Wright", "carNum": 46, "car": "Ferrari 499P", "totalLaps": 5, "bestLap": 207531 },
        { "id": "Kieran Diependael", "carNum": 418, "car": "Toyota GR010", "totalLaps": 4, "bestLap": 210267 },
        { "id": "Ivan Foggia", "carNum": 106, "car": "Aston Martin Valkyrie LMH", "totalLaps": 6, "bestLap": 213179 },
        { "id": "Giorgio Tagliapietra", "carNum": 42, "car": "Ferrari 499P", "totalLaps": 5, "bestLap": 214837 }
      ]
    },
    {
      "carClass": "LMGT3",
      "result": [
        { "id": "Demetrio Crucitti", "carNum": 69, "car": "Lexus RCF LMGT3", "totalLaps": 5, "bestLap": 245114 },
        { "id": "Mark Colson", "carNum": 63, "car": "Ford Mustang LMGT3", "totalLaps": 5, "bestLap": 247657 },
        { "id": "Mattia Arosio", "carNum": 15, "car": "Ferrari 296 GT3", "totalLaps": 7, "bestLap": 248284 },
        { "id": "Lucio Canitano", "carNum": 31, "car": "Ferrari 296 GT3", "totalLaps": 7, "bestLap": 248807 },
        { "id": "davide case", "carNum": 25, "car": "BMW M4 GT3", "totalLaps": 6, "bestLap": 251400 },
        { "id": "Corrado Veronesi", "carNum": 59, "car": "BMW M4 GT3", "totalLaps": 5, "bestLap": 254513 }
      ]
    }
  ];

  const METADATA = {
    race_id: '',
    sim: 'LMU',
    track_id: 'lmu-le-mans',
    set_date: '2026-05-09T19:00:00',
    session_type: 'qualifying',
  };

  importRaceResults_(JSON_DATA, METADATA);
}

function runImportRace() {
  const JSON_DATA = [
    {
      "carClass": "Hypercar",
      "result": [
        { "position": 1, "id": "James Wright", "carNum": 46, "car": "Ferrari 499P", "pointsGiven": 0.0, "penaltyPoints": null, "pointTotal": 0.0, "totalLaps": 17, "bestLap": 209828, "totalTime": 3729157, "dnf": false, "dns": false },
        { "position": 2, "id": "Ivan Foggia", "carNum": 106, "car": "Aston Martin Valkyrie LMH", "pointsGiven": 0.0, "penaltyPoints": null, "pointTotal": 0.0, "totalLaps": 17, "bestLap": 214568, "totalTime": 3894878, "dnf": false, "dns": false },
        { "position": 3, "id": "Giorgio Tagliapietra", "carNum": 42, "car": "Ferrari 499P", "pointsGiven": 0.0, "penaltyPoints": null, "pointTotal": 0.0, "totalLaps": 17, "bestLap": 213495, "totalTime": 3898078, "dnf": false, "dns": false },
        { "position": 4, "id": "Kieran Diependael", "carNum": 418, "car": "Toyota GR010", "pointsGiven": 0.0, "penaltyPoints": null, "pointTotal": 0.0, "totalLaps": 6, "bestLap": 210127, "totalTime": 1337161, "dnf": false, "dns": false },
        { "position": 5, "id": "Samuele Faustini", "carNum": 55, "car": "Ferrari 499P", "pointsGiven": 0.0, "penaltyPoints": 0, "pointTotal": 0.0, "totalLaps": null, "bestLap": null, "totalTime": null, "dnf": false, "dns": true }
      ]
    },
    {
      "carClass": "LMGT3",
      "result": [
        { "position": 1, "id": "Mark Colson", "carNum": 63, "car": "Ford Mustang LMGT3", "pointsGiven": 0.0, "penaltyPoints": null, "pointTotal": 0.0, "totalLaps": 15, "bestLap": 247789, "totalTime": 3907518, "dnf": false, "dns": false },
        { "position": 2, "id": "Demetrio Crucitti", "carNum": 69, "car": "Lexus RCF LMGT3", "pointsGiven": 0.0, "penaltyPoints": null, "pointTotal": 0.0, "totalLaps": 14, "bestLap": 245898, "totalTime": 3782578, "dnf": false, "dns": false },
        { "position": 3, "id": "Mattia Arosio", "carNum": 15, "car": "Ferrari 296 GT3", "pointsGiven": 0.0, "penaltyPoints": null, "pointTotal": 0.0, "totalLaps": 14, "bestLap": 248798, "totalTime": 3807657, "dnf": false, "dns": false },
        { "position": 4, "id": "davide case", "carNum": 25, "car": "BMW M4 GT3", "pointsGiven": 0.0, "penaltyPoints": null, "pointTotal": 0.0, "totalLaps": 14, "bestLap": 249599, "totalTime": 3916278, "dnf": false, "dns": false },
        { "position": 5, "id": "Lucio Canitano", "carNum": 31, "car": "Ferrari 296 GT3", "pointsGiven": 0.0, "penaltyPoints": null, "pointTotal": 0.0, "totalLaps": 9, "bestLap": 249131, "totalTime": 2342575, "dnf": false, "dns": false },
        { "position": 6, "id": "Corrado Veronesi", "carNum": 59, "car": "BMW M4 GT3", "pointsGiven": 0.0, "penaltyPoints": null, "pointTotal": 0.0, "totalLaps": 5, "bestLap": 254603, "totalTime": 1307640, "dnf": false, "dns": false },
        { "position": 7, "id": "Matteo Gennusa", "carNum": 13, "car": "BMW M4 GT3", "pointsGiven": 0.0, "penaltyPoints": 0, "pointTotal": 0.0, "totalLaps": null, "bestLap": null, "totalTime": null, "dnf": false, "dns": true }
      ]
    }
  ];

  const METADATA = {
    race_id: '',
    sim: 'LMU',
    track_id: 'lmu-le-mans',
    set_date: '2026-05-09T20:00:00',
    session_type: 'race',
  };

  importRaceResults_(JSON_DATA, METADATA);
}

// ═══════════════════════════════════════════════════════════
// HANDLER FRONTEND-CALLABLE — Wave 9.8 + Wave 9.12 + Wave 9.13
// ═══════════════════════════════════════════════════════════

/**
 * raceResults.import — wrapper frontend-callable.
 * Gated su role=admin.
 *
 * Accetta 2 formati JSON:
 *   - LMU race result:        array [{carClass, result: [...]}]
 *   - iRacing event_result:   oggetto {type:'event_result', data:{...}}
 *
 * Post-success: notifiche Discord (race imported + podi VSD).
 */
function handleRaceResultsImport(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');
  if (!ctx.isStaff) return fail('Forbidden: solo staff può importare risultati');

  if (!payload) return fail('Payload mancante');
  if (!payload.race_id) return fail('race_id mancante');
  if (!payload.json_data) return fail('json_data mancante');

  let jsonData = payload.json_data;
  if (typeof jsonData === 'string') {
    try { jsonData = JSON.parse(jsonData); }
    catch (e) { return fail('JSON non valido: ' + e.message); }
  }

  const races = getCachedSheetData_(SHEETS.RACES, 900);
  const race = races.find(r => r.race_id === payload.race_id);
  if (!race) return fail('Gara non trovata: ' + payload.race_id);

  // Wave 9.12: detect iRacing event_result format
  const isIRacingFormat = jsonData && !Array.isArray(jsonData) && jsonData.type === 'event_result';

  if (isIRacingFormat) {
    const metadata = {
      race_id: race.race_id,
      sim: race.sim || 'IRC',
      track_id: race.track_id || '',
      set_date: race.date || new Date().toISOString(),
      // session_type IGNORATO per iRacing, derivato internamente dalle session_results
    };

    try {
      const stats = importRaceResults_(jsonData, metadata);

      // Wave 9.13: Discord notifications post-import (iRacing)
      try {
        notifyRaceImported_(race, stats);
        checkAndNotifyIracingPodiums_(jsonData, race);
        seedRaceReportsForRace(race.race_id);
      } catch (e) {
        Logger.log('⚠️  Notification error (non-blocking): ' + e.message);
      }

      return ok(stats);
    } catch (e) {
      return fail('Errore durante import iRacing: ' + e.message);
    }
  }

  // LMU format: validation + session detect
  if (!Array.isArray(jsonData) || jsonData.length === 0) {
    return fail('json_data deve essere un array (LMU) o un oggetto event_result (iRacing)');
  }

  const sessionType = detectSessionType_(jsonData);
  if (!sessionType) return fail('Impossibile dedurre session_type dalla struttura JSON');

  const metadata = {
    race_id: race.race_id,
    sim: race.sim || '',
    track_id: race.track_id || '',
    set_date: race.date || new Date().toISOString(),
    session_type: sessionType,
  };

  try {
    const stats = importRaceResults_(jsonData, metadata);

    // Wave 9.13: Discord notifications post-import (LMU)
    try {
      notifyRaceImported_(race, stats);
      // Podi LMU notificati SOLO se sessione race (non qualifying)
      if (sessionType === 'race') {
        checkAndNotifyPodiums_(race, jsonData);
        seedRaceReportsForRace(race.race_id);
      }
    } catch (e) {
      Logger.log('⚠️  Notification error (non-blocking): ' + e.message);
    }

    return ok(stats);
  } catch (e) {
    return fail('Errore durante import: ' + e.message);
  }
}

/**
 * Autodetect session_type per formato LMU:
 *  - 'race'       → results contengono field "position"
 *  - 'qualifying' → results NON contengono "position"
 */
function detectSessionType_(jsonData) {
  if (!Array.isArray(jsonData) || jsonData.length === 0) return null;
  const firstGroup = jsonData[0];
  if (!firstGroup.result || !Array.isArray(firstGroup.result) || firstGroup.result.length === 0) {
    return null;
  }
  const hasPosition = firstGroup.result.some(r => r.position != null);
  return hasPosition ? 'race' : 'qualifying';
}

// ═══════════════════════════════════════════════════════════
// Wave 9.13 — Helper podium detection per Discord notifications
// ═══════════════════════════════════════════════════════════

/**
 * LMU format: scansiona i risultati per podi VSD nella sessione race.
 * Chiama notifyVsdPodium_ una volta per podio trovato.
 */
function checkAndNotifyPodiums_(race, jsonData) {
  if (!Array.isArray(jsonData)) return;

  const matchMap = buildDriverNameMap_();

  jsonData.forEach(classGroup => {
    const results = classGroup.result || [];
    results.forEach(r => {
      if (!r.position || r.position > 3) return;
      if (r.dnf || r.dns) return;
      const matchedId = matchDriverName_(r.id, matchMap);
      if (matchedId) {
        notifyVsdPodium_(r.id, r.position, race, 'race');
      }
    });
  });
}

/**
 * iRacing format: scansiona i risultati per podi VSD nella sessione FEATURE.
 * Chiama notifyVsdPodium_ una volta per podio trovato.
 */
function checkAndNotifyIracingPodiums_(raw, race) {
  if (!raw || !raw.data || !Array.isArray(raw.data.session_results)) return;

  const featureSession = raw.data.session_results.find(s =>
    (s.simsession_name || '').toUpperCase() === 'FEATURE'
  );
  if (!featureSession || !Array.isArray(featureSession.results)) return;

  const iracingIdMap = buildIracingIdMap_();
  const nameMap = buildDriverNameMap_();

  featureSession.results.forEach(r => {
    // iRacing finish_position è 0-indexed: 0=P1, 1=P2, 2=P3
    if (r.finish_position == null || r.finish_position > 2) return;
    if (r.reason_out !== 'Running') return; // skip DNF/DNS

    const position = r.finish_position + 1; // → 1, 2, 3
    const custId = String(r.cust_id || '');

    let matched = false;
    if (custId && iracingIdMap[custId]) {
      matched = true;
    } else if (r.display_name && matchDriverName_(r.display_name, nameMap)) {
      matched = true;
    }

    if (matched) {
      notifyVsdPodium_(r.display_name, position, race, 'race');
    }
  });
}

// ═══════════════════════════════════════════════════════════
// ADMIN CLEANUP — utility manuale, esegui da editor
// ═══════════════════════════════════════════════════════════

/**
 * Cancella tutte le righe in RaceResults che hanno race_id == TARGET_RACE_ID.
 * Idempotente.
 */
function admin_deleteRaceResults() {
  // ⚠️ MODIFICA QUI prima di eseguire
  const TARGET_RACE_ID = 'irc-gr86-r02-limerock';

  if (!TARGET_RACE_ID || TARGET_RACE_ID === '') {
    throw new Error('TARGET_RACE_ID vuoto: imposta il race_id da pulire in cima alla function');
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('RaceResults');
  if (!sheet) throw new Error('Tab RaceResults non trovato');

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const raceIdIdx = headers.indexOf('race_id');

  if (raceIdIdx < 0) throw new Error('Colonna race_id mancante in RaceResults');

  const rowsToDelete = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][raceIdIdx] === TARGET_RACE_ID) {
      rowsToDelete.push(i + 1);
    }
  }

  if (rowsToDelete.length === 0) {
    Logger.log('⏭️  Nessuna riga trovata per race_id="' + TARGET_RACE_ID + '"');
    return { deleted: 0, race_id: TARGET_RACE_ID };
  }

  rowsToDelete.reverse().forEach(rowNum => {
    sheet.deleteRow(rowNum);
  });

  Logger.log('✅ Cancellate ' + rowsToDelete.length + ' righe per race_id="' + TARGET_RACE_ID + '"');
  Logger.log('   Tab Races NON toccato (la gara resta valida)');

  return { deleted: rowsToDelete.length, race_id: TARGET_RACE_ID };
}

function admin_listRaceIds() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('RaceResults');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const raceIdIdx = headers.indexOf('race_id');

  const counts = {};
  for (let i = 1; i < data.length; i++) {
    const rid = data[i][raceIdIdx];
    if (!rid) continue;
    counts[rid] = (counts[rid] || 0) + 1;
  }

  Logger.log('=== race_id distinti in RaceResults ===');
  Object.keys(counts).sort().forEach(rid => {
    Logger.log('  ' + rid + ': ' + counts[rid] + ' righe');
  });
  Logger.log('Totale race_id distinti: ' + Object.keys(counts).length);
}