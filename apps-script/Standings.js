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
  const championships = getCachedSheetData_(SHEETS.CHAMPIONSHIPS, 3600);
  const championship = championships.find(c => c.id === championshipId);
  if (!championship) return fail('Campionato non trovato: ' + championshipId);

  // 2. Round del campionato
  const allRaces = getCachedSheetData_(SHEETS.RACES, 900);
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
      race_number: Number(r.race_number) || 1,
      date: r.date,
      track_id: r.track_id,
      status: r.status,
    }));

  // 3. Leggi aggiustamenti manuali (penalità, scarti)
  const adjustments = parseAdjustments_(championship.points_adjustments_json);

  // 4. Se c'è JSON LMU importato, usa quello (sorgente autorevole)
  const storedJson = championship.standings_json && String(championship.standings_json).trim();
  if (storedJson) {
    try {
      const parsed = parseLmuStandingsJson_(storedJson);
      let classes = applyAdjustments_(parsed.classes, adjustments);

      // Hybrid: augmenta con statistiche per-gara da RaceResults (W/P/BEST/DNF/GARE)
      // se ci sono risultati importati per questo campionato
      Logger.log('[Hybrid] rounds.length=' + rounds.length + ' for ' + championshipId);
      if (rounds.length > 0) {
        const allResults = sheetToObjects(SHEETS.RACE_RESULTS);
        const roundRaceIds = {};
        rounds.forEach(r => { roundRaceIds[r.race_id] = true; });
        Logger.log('[Hybrid] roundRaceIds=' + JSON.stringify(Object.keys(roundRaceIds)));
        const relevantResults = allResults.filter(r =>
          roundRaceIds[r.race_id] && r.session_type === 'race'
        );
        Logger.log('[Hybrid] relevantResults.length=' + relevantResults.length);
        if (relevantResults.length > 0) {
          classes = mergeRaceStats_(classes, relevantResults);
        }
      }

      return ok({
        championship,
        classes,
        rounds,
        points_configured: true,
        source: 'lmu_import',
        adjustments,
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

  const drivers = getCachedSheetData_(SHEETS.DRIVERS, 600);
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
  const classesWithAdj = applyAdjustments_(classes, adjustments);

  return ok({
    championship,
    classes: classesWithAdj,
    rounds,
    points_configured: pointsConfigured,
    source: 'computed',
    adjustments,
  });
}
/**
 * Match STRICT per standings di campionati ESTERNI: solo nome completo identico.
 * A differenza di matchDriverName_ (import gara, piloti nostri, fuzzy utile), qui NO fuzzy:
 * su un campionato esterno "Alessandro", "Marco" ecc. darebbero falsi positivi (un esterno
 * omonimo erediterebbe il badge VSD di un nostro pilota). Meglio mancare un match
 * (correggibile a mano) che marcare VSD chi non lo è.
 */
function matchDriverNameStrict_(externalName, matchMap) {
  if (!externalName) return null;
  const name = String(externalName).toLowerCase().trim();
  return matchMap[name] || null;
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

  const drivers = getCachedSheetData_(SHEETS.DRIVERS, 600);
  const driverNameMap = buildDriverNameMap_();
  const driverInfoMap = {};
  drivers.forEach(d => { driverInfoMap[d.driver_id] = d; });

  const classPriority = ['Hypercar', 'LMP1', 'LMP2', 'LMP3', 'GTE', 'LMGTE Pro', 'LMGTE AM', 'LMGT3', 'GT3', 'GT4', 'TCR'];

  const classes = data
    .map(classGroup => {
      const className = String(classGroup.carClass || 'Unknown').trim();
      const standings = (classGroup.standings || []).map(s => {
        const matchedDriverId = matchDriverNameStrict_(s.id, driverNameMap);
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
 * mergeRaceStats_ — augmenta standings (da standings_json) con statistiche
 * per-gara (GARE, W, P, BEST, DNF) calcolate dai RaceResults importati.
 * Usata in modalità ibrida: punti da standings_json, stats da RaceResults.
 */
function mergeRaceStats_(classes, relevantResults) {
  // Costruisce mappa: driverKey → stats
  const statsMap = {};

  relevantResults.forEach(function(r) {
    var isVsd = String(r.is_vsd_driver).toUpperCase() === 'TRUE';
    var driverKey = isVsd ? r.driver_id : (r.driver_name_external || 'UNKNOWN');

    if (!statsMap[driverKey]) {
      statsMap[driverKey] = { races_count: 0, wins: 0, podiums: 0, best_finish: null, dnfs: 0 };
    }

    var stats = statsMap[driverKey];
    var isDnf = String(r.dnf).toUpperCase() === 'TRUE';
    var isDns = String(r.dns).toUpperCase() === 'TRUE';
    var position = Number(r.finish_position) || null;

    if (!isDns) stats.races_count++;
    if (isDnf) stats.dnfs++;
    if (position && !isDns && !isDnf) {
      if (position === 1) stats.wins++;
      if (position <= 3) stats.podiums++;
      if (stats.best_finish === null || position < stats.best_finish) {
        stats.best_finish = position;
      }
    }
  });

  return classes.map(function(cls) {
    return {
      class_name: cls.class_name,
      standings: cls.standings.map(function(s) {
        var key = s.driver_id || s.driver_name_external || s.display_name;
        var stats = statsMap[key];
        if (!stats) return s;
        return Object.assign({}, s, {
          races_count: stats.races_count,
          wins: stats.wins,
          podiums: stats.podiums,
          best_finish: stats.best_finish,
          dnfs: stats.dnfs,
        });
      }),
    };
  });
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
  invalidateSheetCache_(SHEETS.CHAMPIONSHIPS);

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
// AGGIUSTAMENTI PUNTI — helper + endpoint admin
// ═══════════════════════════════════════════════════════════

/**
 * Legge e valida il JSON degli aggiustamenti dalla colonna points_adjustments_json.
 * Ritorna array vuoto se assente/invalido.
 */
function parseAdjustments_(raw) {
  if (!raw || String(raw).trim() === '') return [];
  try {
    const arr = JSON.parse(String(raw).trim());
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    Logger.log('⚠️ parseAdjustments_ parse error: ' + e.message);
    return [];
  }
}

/**
 * Applica i delta di aggiustamento ai standings calcolati.
 * Ogni adjustment: { id, driver_key, car_class, race_id?, delta, reason? }
 * driver_key = driver_id (VSD) o display_name (esterno)
 * delta può essere positivo (bonus) o negativo (penalità/scarto)
 */
function applyAdjustments_(classes, adjustments) {
  if (!adjustments || adjustments.length === 0) return classes;

  return classes.map(cls => {
    const standings = cls.standings.map(s => {
      const driverKey = s.driver_id || s.driver_name_external || s.display_name;
      const relevant = adjustments.filter(a =>
        a.car_class === cls.class_name &&
        (a.driver_key === driverKey || a.driver_key === s.display_name)
      );
      if (relevant.length === 0) return s;

      const totalDelta = relevant.reduce((sum, a) => sum + (Number(a.delta) || 0), 0);
      return {
        ...s,
        total_points: (s.total_points || 0) + totalDelta,
        points_adjustments: relevant,
      };
    });

    // Ri-ordina per punti aggiornati
    const sorted = standings
      .sort((a, b) => {
        if (b.total_points !== a.total_points) return b.total_points - a.total_points;
        if ((b.wins || 0) !== (a.wins || 0)) return (b.wins || 0) - (a.wins || 0);
        if ((b.podiums || 0) !== (a.podiums || 0)) return (b.podiums || 0) - (a.podiums || 0);
        return (a.best_finish || 999) - (b.best_finish || 999);
      })
      .map((s, idx) => ({ ...s, position: idx + 1 }));

    return { ...cls, standings: sorted };
  });
}

/**
 * championships.saveAdjustments — admin only.
 * Salva l'array completo di aggiustamenti manuali nel foglio Championships.
 *
 * payload: { championship_id, adjustments: [...] }
 */
function handleChampionshipsSaveAdjustments(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');
  if (!ctx.isStaff) return fail('Forbidden: solo staff/admin');
  if (!payload || !payload.championship_id) return fail('championship_id mancante');

  const adjustments = Array.isArray(payload.adjustments) ? payload.adjustments : [];

  // Valida ogni entry
  for (const a of adjustments) {
    if (!a.driver_key) return fail('driver_key mancante in un aggiustamento');
    if (!a.car_class)  return fail('car_class mancante in un aggiustamento');
    if (typeof a.delta !== 'number') return fail('delta deve essere un numero');
    if (!a.id) a.id = 'adj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  }

  const sheet = getSheet(SHEETS.CHAMPIONSHIPS);
  const data  = sheet.getDataRange().getValues();
  const headers = data[0];
  const idIdx  = headers.indexOf('id');
  const adjIdx = headers.indexOf('points_adjustments_json');

  if (idIdx  < 0) return fail('Colonna id mancante in Championships');
  if (adjIdx < 0) return fail('Colonna points_adjustments_json mancante — aggiungila al foglio');

  let foundRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][idIdx] === payload.championship_id) { foundRow = i + 1; break; }
  }
  if (foundRow === -1) return fail('Campionato non trovato: ' + payload.championship_id);

  sheet.getRange(foundRow, adjIdx + 1).setValue(
    adjustments.length > 0 ? JSON.stringify(adjustments) : ''
  );
  invalidateSheetCache_(SHEETS.CHAMPIONSHIPS);

  return ok({ championship_id: payload.championship_id, saved: adjustments.length });
}
