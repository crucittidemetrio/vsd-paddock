// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Standings Endpoints (Wave 9.9 + LMU import)
// ═══════════════════════════════════════════════════════════

/**
 * standings.byChampionship — Classifica di un campionato.
 *
 * Sorgente:
 *  - Se Championships.standings_json è valorizzato → parsing JSON LMU (autorevole)
 *  - Altrimenti → compute da RaceResults (fallback)
 */
function handleStandingsByChampionship(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');

  const championshipId = payload && payload.championship_id;
  if (!championshipId) return fail('championship_id mancante');

  // 1. Campionato
  const championships = sheetToObjects(SHEETS.CHAMPIONSHIPS);
  const championship = championships.find(c => c.id === championshipId);
  if (!championship) return fail('Campionato non trovato: ' + championshipId);

  // 2. Round del campionato
  const allRaces = sheetToObjects(SHEETS.RACES);
  const rounds = allRaces
    .filter(r =>
      r.championship_id === championshipId &&
      r.event_type === 'championship'
    )
    .sort((a, b) => {
      const ar = Number(a.round) || 999;
      const br = Number(b.round) || 999;
      if (ar !== br) return ar - br;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    })
    .map(r => ({
      race_id: r.race_id,
      race_name: r.race_name,
      round: Number(r.round) || null,
      date: r.date,
      track_id: r.track_id,
      status: r.status,
    }));

  // 3. Se c'è JSON LMU importato, usa quello (sorgente autorevole)
  const storedJson = championship.standings_json && String(championship.standings_json).trim();
  if (storedJson) {
    try {
      const parsed = parseLmuStandingsJson_(storedJson);
      return ok({
        championship,
        classes: parsed.classes,
        rounds,
        points_configured: true,
        source: 'lmu_import',
      });
    } catch (e) {
      Logger.log('⚠️ Parse standings_json fallito, fallback al compute: ' + e.message);
    }
  }

  // 4. Fallback: compute da RaceResults
  if (rounds.length === 0) {
    return ok({ championship, classes: [], rounds: [], points_configured: false, source: 'computed' });
  }

  const allResults = sheetToObjects(SHEETS.RACE_RESULTS);
  const roundRaceIds = {};
  rounds.forEach(r => { roundRaceIds[r.race_id] = true; });

  const relevantResults = allResults.filter(r =>
    roundRaceIds[r.race_id] && r.session_type === 'race'
  );

  const drivers = sheetToObjects(SHEETS.DRIVERS);
  const driverMap = {};
  drivers.forEach(d => { driverMap[d.driver_id] = d; });

  const aggregates = {};

  relevantResults.forEach(r => {
    const isVsd = String(r.is_vsd_driver).toUpperCase() === 'TRUE';
    const driverKey = isVsd ? r.driver_id : (r.driver_name_external || 'UNKNOWN');
    const carClass = r.car_class || 'Unknown';
    const aggKey = `${driverKey}__${carClass}`;

    if (!aggregates[aggKey]) {
      aggregates[aggKey] = {
        driver_id: isVsd ? r.driver_id : '',
        driver_name_external: isVsd ? '' : r.driver_name_external,
        is_vsd: isVsd,
        car_class: carClass,
        total_points: 0,
        races_count: 0,
        wins: 0,
        podiums: 0,
        best_finish: null,
        dnfs: 0,
        dns_count: 0,
      };
    }

    const agg = aggregates[aggKey];
    const isDnf = String(r.dnf).toUpperCase() === 'TRUE';
    const isDns = String(r.dns).toUpperCase() === 'TRUE';
    const points = Number(r.point_total) || 0;
    const position = Number(r.finish_position) || null;

    if (!isDns) agg.races_count++;
    if (isDnf) agg.dnfs++;
    if (isDns) agg.dns_count++;
    agg.total_points += points;

    if (position && !isDns) {
      if (position === 1) agg.wins++;
      if (position <= 3) agg.podiums++;
      if (agg.best_finish === null || position < agg.best_finish) {
        agg.best_finish = position;
      }
    }
  });

  const classesMap = {};
  Object.values(aggregates).forEach(agg => {
    const driverInfo = agg.driver_id ? driverMap[agg.driver_id] : null;
    const display_name = driverInfo ? driverInfo.display_name : agg.driver_name_external;
    if (!classesMap[agg.car_class]) classesMap[agg.car_class] = [];
    classesMap[agg.car_class].push({ ...agg, display_name });
  });

  const classPriority = ['Hypercar', 'LMP1', 'LMP2', 'LMP3', 'GTE', 'LMGTE Pro', 'LMGTE AM', 'LMGT3', 'GT3', 'GT4', 'TCR'];
  const classes = Object.keys(classesMap)
    .sort((a, b) => {
      const ai = classPriority.indexOf(a);
      const bi = classPriority.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    })
    .map(className => {
      const standings = classesMap[className]
        .sort((a, b) => {
          if (b.total_points !== a.total_points) return b.total_points - a.total_points;
          if (b.wins !== a.wins) return b.wins - a.wins;
          if (b.podiums !== a.podiums) return b.podiums - a.podiums;
          const ab = a.best_finish || 999;
          const bb = b.best_finish || 999;
          return ab - bb;
        })
        .map((s, idx) => ({ ...s, position: idx + 1 }));
      return { class_name: className, standings };
    });

  const pointsConfigured = Object.values(aggregates).some(a => a.total_points > 0);

  return ok({
    championship,
    classes,
    rounds,
    points_configured: pointsConfigured,
    source: 'computed',
  });
}

// ═══════════════════════════════════════════════════════════
// LMU STANDINGS JSON — parsing + import
// ═══════════════════════════════════════════════════════════

/**
 * Parser del JSON standings esportato da LMU.
 * Trasforma lo shape LMU nello shape che il frontend si aspetta
 * (compatibile con la response del compute).
 */
function parseLmuStandingsJson_(rawJson) {
  if (!rawJson || typeof rawJson !== 'string') throw new Error('JSON vuoto');

  let data;
  try { data = JSON.parse(rawJson); }
  catch (e) { throw new Error('Parse error: ' + e.message); }

  if (!Array.isArray(data)) throw new Error('Atteso array di carClass groups');
  if (data.length === 0) throw new Error('Array vuoto');

  const drivers = sheetToObjects(SHEETS.DRIVERS);
  const driverNameMap = buildDriverNameMap_();
  const driverInfoMap = {};
  drivers.forEach(d => { driverInfoMap[d.driver_id] = d; });

  const classPriority = ['Hypercar', 'LMP1', 'LMP2', 'LMP3', 'GTE', 'LMGTE Pro', 'LMGTE AM', 'LMGT3', 'GT3', 'GT4', 'TCR'];

  const classes = data
    .map(classGroup => {
      const className = String(classGroup.carClass || 'Unknown').trim();
      const standings = (classGroup.standings || []).map(s => {
        const matchedDriverId = matchDriverName_(s.id, driverNameMap);
        const isVsd = !!matchedDriverId;
        const driverInfo = isVsd ? driverInfoMap[matchedDriverId] : null;

        const races = Array.isArray(s.races) ? s.races : [];
        let races_count = 0;
        let wins = 0;
        let podiums = 0;
        let best_finish = null;
        let dnfs = 0;
        let dns_count = 0;

        races.forEach(r => {
          if (r.position == null) return;
          if (r.dns === true) { dns_count++; return; }
          races_count++;
          if (r.dnf === true) { dnfs++; return; }
          const pos = Number(r.position);
          if (pos === 1) wins++;
          if (pos <= 3) podiums++;
          if (best_finish === null || pos < best_finish) best_finish = pos;
        });

        return {
          position: Number(s.position),
          driver_id: matchedDriverId || '',
          driver_name_external: isVsd ? '' : s.id,
          is_vsd: isVsd,
          display_name: driverInfo ? driverInfo.display_name : s.id,
          car_class: className,
          total_points: Number(s.actualPoints) || Number(s.championshipScore) || 0,
          championship_points: Number(s.championshipPoints) || 0,
          championship_penalties: Number(s.championshipPenalties) || 0,
          championship_score: Number(s.championshipScore) || 0,
          points_adjustment: Number(s.pointsAdjustment) || 0,
          races_count,
          wins,
          podiums,
          best_finish,
          dnfs,
          dns_count,
        };
      });
      return { class_name: className, standings };
    })
    .sort((a, b) => {
      const ai = classPriority.indexOf(a.class_name);
      const bi = classPriority.indexOf(b.class_name);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.class_name.localeCompare(b.class_name);
    });

  return { classes, points_configured: true };
}

/**
 * championships.importStandings — admin only.
 * Salva il JSON LMU nella colonna standings_json del campionato.
 */
function handleChampionshipsImportStandings(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');
  if (!ctx.isStaff) return fail('Forbidden: solo staff o admin può importare standings');
  if (!payload) return fail('Payload mancante');
  if (!payload.championship_id) return fail('championship_id mancante');
  if (!payload.json_data) return fail('json_data mancante');

  let jsonStr = payload.json_data;
  if (typeof jsonStr !== 'string') jsonStr = JSON.stringify(jsonStr);

  let parsed;
  try { parsed = parseLmuStandingsJson_(jsonStr); }
  catch (e) { return fail('JSON non valido: ' + e.message); }

  const sheet = getSheet(SHEETS.CHAMPIONSHIPS);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idIdx = headers.indexOf('id');
  const jsonIdx = headers.indexOf('standings_json');

  if (idIdx < 0) return fail('Colonna id mancante in Championships');
  if (jsonIdx < 0) return fail('Colonna standings_json mancante. Esegui migrate_addStandingsJsonColumn');

  let foundRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][idIdx] === payload.championship_id) {
      foundRow = i + 1;
      break;
    }
  }
  if (foundRow === -1) return fail('Campionato non trovato: ' + payload.championship_id);

  sheet.getRange(foundRow, jsonIdx + 1).setValue(jsonStr);

  const totalDrivers = parsed.classes.reduce((sum, c) => sum + c.standings.length, 0);
  const matchedVsd = parsed.classes.reduce(
    (sum, c) => sum + c.standings.filter(s => s.is_vsd).length, 0
  );

  return ok({
    championship_id: payload.championship_id,
    classes_count: parsed.classes.length,
    drivers_count: totalDrivers,
    vsd_matched: matchedVsd,
    external: totalDrivers - matchedVsd,
  });
}

// ═══════════════════════════════════════════════════════════
// TEST FUNCTIONS
// ═══════════════════════════════════════════════════════════

function testStandingsIconicGte() {
  const login = handleAuthLogin({ code: 'DEMETRIO-6899' });
  if (!login.ok) { Logger.log('❌ Login: ' + login.error); return; }
  const ctx = verifyToken(login.data.token);

  const result = handleStandingsByChampionship(
    { championship_id: 'chmp-lmu-iconic-gte-2026' },
    ctx
  );

  if (!result.ok) { Logger.log('❌ ' + result.error); return; }

  const { championship, classes, rounds, points_configured, source } = result.data;
  Logger.log(`🏆 ${championship.name}`);
  Logger.log(`   Sorgente: ${source}`);
  Logger.log(`   Round: ${rounds.length}`);
  Logger.log(`   Punti configurati: ${points_configured}`);
  Logger.log('');

  classes.forEach(c => {
    Logger.log(`── ${c.class_name} ──`);
    c.standings.forEach(s => {
      const flag = s.is_vsd ? '[VSD]' : '     ';
      Logger.log(`  ${s.position}. ${flag} ${s.display_name} | pts ${s.total_points} | W ${s.wins} | P ${s.podiums} | best ${s.best_finish || '—'} | gare ${s.races_count}`);
    });
    Logger.log('');
  });
}

/**
 * Test: importa il JSON LMU di esempio per Iconic Series GTE.
 * ⚠️ Sostituisci `INCOLLA_QUI_IL_JSON_LMU_INTERO` con il contenuto del tuo file standings di LMU.
 */
function testImportStandingsIconicGte() {
  const login = handleAuthLogin({ code: 'DEMETRIO-6899' });
  if (!login.ok) { Logger.log('❌ Login: ' + login.error); return; }
  const ctx = verifyToken(login.data.token);

  const JSON_HERE = `INCOLLA_QUI_IL_JSON_LMU_INTERO`;

  const result = handleChampionshipsImportStandings(
    { championship_id: 'chmp-lmu-iconic-gte-2026', json_data: JSON_HERE },
    ctx
  );
  Logger.log(JSON.stringify(result, null, 2));
}

function testImportStandingsHandler() {
  const login = handleAuthLogin({ code: 'DEMETRIO-6899' });
  if (!login.ok) { Logger.log('❌ Login: ' + login.error); return; }
  const ctx = verifyToken(login.data.token);

  const testJson = '[{"carClass":"LMGTE AM","standings":[{"position":1,"id":"Demetrio Crucitti","carNum":"42","car":"Test Car","championshipPoints":100,"championshipPenalties":0,"championshipScore":100,"pointsAdjustment":0,"actualPoints":100,"races":[]}]}]';

  const result = handleChampionshipsImportStandings({
    championship_id: 'chmp-lmu-iconic-gte-2026',
    json_data: testJson
  }, ctx);

  Logger.log('=== RESULT ===');
  Logger.log(JSON.stringify(result, null, 2));
}