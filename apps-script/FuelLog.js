// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Fuel/Energy Log Endpoints
// ═══════════════════════════════════════════════════════════
// Consumo reale di carburante ed energia virtuale osservato in pista,
// alimentato dal companion app (script Python che legge la shared
// memory di Le Mans Ultimate) via token dispositivo long-lived
// (vedi devices.createToken in Devices.js).
//
// fuel.logSample scrive un campione per giro. fuel.summary calcola
// consumo medio mobile e proietta autonomia residua / rabbocco
// necessario — usato dal pannello live in AdminRaceStints.jsx.
//
// Registrate in Codice.js dispatcher come:
//   'fuel.logSample':  handleFuelLogSample
//   'fuel.summary':    handleFuelSummary
//   'fuel.mySession':  handleFuelMySession
//   'fuel.stints':     handleFuelStints
// ═══════════════════════════════════════════════════════════

// Sessione personale considerata "attiva" solo se l'ultimo campione del
// pilota risale a meno di 30 minuti fa — stessa idea di
// FUEL_LIVE_MAX_AGE_MS (staleness del ping live), estesa qui alla
// domanda "questo pilota sta ancora correndo?". Il companion, in
// modalità solo (nessun race_id in config.json), apre una NUOVA
// sessione locale dopo lo stesso identico gap — i due lati non sono
// accoppiati a livello di codice, ma usano la stessa soglia per dare
// un comportamento coerente all'utente.
const FUEL_MY_SESSION_MAX_AGE_MS = 30 * 60 * 1000;

/**
 * Migrazione one-shot: aggiunge le colonne telemetria auto-rilevata a
 * una tab FuelLog GIÀ ESISTENTE — track_name/vehicle_name (letti dalla
 * shared memory LMU, stesso blocco di fuel/lap) e speed_min/max/avg_kmh
 * (aggregati per giro dal companion da mLocalVel). Servono alla
 * simplificazione "sessione personale senza ID manuale" (fuel.mySession)
 * e alle nuove card velocità in FuelPanel. Idempotente: aggiunge solo
 * le colonne mancanti, non tocca righe esistenti — i campioni già
 * salvati restano senza questi valori (celle vuote), nessun backfill.
 *
 * Esecuzione: editor Apps Script → dropdown funzioni →
 *             setupFuelLogTelemetryColumns → ▶ Esegui (una volta sola).
 */
function setupFuelLogTelemetryColumns() {
  const sheet = getSheet(SHEETS.FUEL_LOG);
  if (!sheet) {
    Logger.log('⚠️  Tab FuelLog non trovata — esegui prima setupFuelLogTab().');
    return;
  }
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  ['track_name', 'vehicle_name', 'speed_min_kmh', 'speed_max_kmh', 'speed_avg_kmh'].forEach(col => {
    if (headers.indexOf(col) !== -1) {
      Logger.log('✓ Colonna "' + col + '" già esistente, nessuna modifica.');
      return;
    }
    const nextCol = sheet.getLastColumn() + 1;
    sheet.getRange(1, nextCol).setValue(col).setFontWeight('bold');
    Logger.log('✅ Colonna "' + col + '" aggiunta in posizione ' + nextCol + '.');
  });
}

/**
 * Migrazione one-shot: aggiunge le colonne di passo/stint a una tab
 * FuelLog GIÀ ESISTENTE — lap_time_s/sector1-3_s (tempo giro e settori
 * reali dal buffer Scoring della shared memory LMU, non più solo
 * l'approssimazione via created_at), in_pits/yellow_flag (giro
 * "sporco" da escludere da passo/consumo medio) e num_pitstops/
 * driver_name (confini di stint + attribuzione pilota nei driver-swap).
 * Stesso pattern idempotente di setupFuelLogTelemetryColumns: aggiunge
 * solo le colonne mancanti, nessun backfill sulle righe esistenti.
 *
 * Esecuzione: editor Apps Script → dropdown funzioni →
 *             setupFuelLogStintColumns → ▶ Esegui (una volta sola).
 */
function setupFuelLogStintColumns() {
  const sheet = getSheet(SHEETS.FUEL_LOG);
  if (!sheet) {
    Logger.log('⚠️  Tab FuelLog non trovata — esegui prima setupFuelLogTab().');
    return;
  }
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  ['lap_time_s', 'sector1_s', 'sector2_s', 'sector3_s', 'in_pits', 'num_pitstops', 'driver_name', 'yellow_flag'].forEach(col => {
    if (headers.indexOf(col) !== -1) {
      Logger.log('✓ Colonna "' + col + '" già esistente, nessuna modifica.');
      return;
    }
    const nextCol = sheet.getLastColumn() + 1;
    sheet.getRange(1, nextCol).setValue(col).setFontWeight('bold');
    Logger.log('✅ Colonna "' + col + '" aggiunta in posizione ' + nextCol + '.');
  });
}

/**
 * fuel.logSample — Registra un campione di consumo (un giro).
 * Auth: richiesta. driver_id preso da ctx (token), MAI dal payload,
 * per evitare che un token compromesso possa scrivere a nome di un
 * altro pilota.
 *
 * @param {Object} payload - {
 *   race_id, car_number, lap_number,
 *   fuel_remaining_l, fuel_capacity_l,
 *   virtual_energy_pct?,  // solo classi ibride (LMDh/Hypercar), opzionale
 *   lap_time_s?, sector1_s?, sector2_s?, sector3_s?,  // buffer Scoring, giro appena concluso
 *   in_pits?, yellow_flag?,   // booleani: giro "sporco" (out/in-lap o FCY/locale) — esclusi da passo/consumo medio
 *   num_pitstops?,            // contatore cumulativo, usato per i confini di stint
 *   driver_name?              // chi guidava (mDriverName) — solo testo di conferma, driver_id resta da ctx
 * }
 * @param {Object} ctx - Auth context (richiesto)
 * @returns {Object} ok({ sample }) oppure fail
 */
function handleFuelLogSample(payload, ctx) {
  if (!ctx || !ctx.driver_id) return fail('Auth richiesto');

  payload = payload || {};
  const raceId = String(payload.race_id || '').trim();
  const carNumber = String(payload.car_number || '').trim();
  const lapNumber = payload.lap_number;
  const fuelRemaining = payload.fuel_remaining_l;
  const fuelCapacity = payload.fuel_capacity_l;

  if (!raceId) return fail('race_id obbligatorio');
  if (!carNumber) return fail('car_number obbligatorio');
  if (lapNumber === undefined || lapNumber === null || lapNumber === '') {
    return fail('lap_number obbligatorio');
  }
  if (fuelRemaining === undefined || fuelRemaining === null || fuelRemaining === '') {
    return fail('fuel_remaining_l obbligatorio');
  }

  const sample = {
    sample_id: Utilities.getUuid(),
    race_id: raceId,
    car_number: carNumber,
    driver_id: ctx.driver_id,
    lap_number: Number(lapNumber),
    fuel_remaining_l: Number(fuelRemaining),
    fuel_capacity_l: fuelCapacity !== undefined && fuelCapacity !== null && fuelCapacity !== ''
      ? Number(fuelCapacity) : '',
    virtual_energy_pct: payload.virtual_energy_pct !== undefined && payload.virtual_energy_pct !== null && payload.virtual_energy_pct !== ''
      ? Number(payload.virtual_energy_pct) : '',
    // Wave: track_name/vehicle_name auto-rilevati dal companion (stessa
    // shared memory di fuel/lap) — usati da fuel.mySession per mostrare
    // "dove si corre" senza che il pilota digiti nulla. speed_* sono
    // aggregati per giro (min/max/media km/h da mLocalVel), tutti
    // opzionali per restare compatibili con companion non aggiornati.
    track_name: payload.track_name ? String(payload.track_name).trim() : '',
    vehicle_name: payload.vehicle_name ? String(payload.vehicle_name).trim() : '',
    speed_min_kmh: payload.speed_min_kmh !== undefined && payload.speed_min_kmh !== null && payload.speed_min_kmh !== ''
      ? Number(payload.speed_min_kmh) : '',
    speed_max_kmh: payload.speed_max_kmh !== undefined && payload.speed_max_kmh !== null && payload.speed_max_kmh !== ''
      ? Number(payload.speed_max_kmh) : '',
    speed_avg_kmh: payload.speed_avg_kmh !== undefined && payload.speed_avg_kmh !== null && payload.speed_avg_kmh !== ''
      ? Number(payload.speed_avg_kmh) : '',
    // Wave: passo/stint dal buffer Scoring — tempo giro e settori reali
    // (non l'approssimazione via created_at usata prima), più i due
    // flag "giro sporco" (in_pits, yellow_flag) che fuel.summary e
    // fuel.stints usano per escludere questo giro da passo/consumo
    // medio. num_pitstops/driver_name servono solo a fuel.stints per
    // capire dove finisce uno stint e chi lo ha guidato. Tutti
    // opzionali per restare compatibili con companion non aggiornati.
    lap_time_s: payload.lap_time_s !== undefined && payload.lap_time_s !== null && payload.lap_time_s !== ''
      ? Number(payload.lap_time_s) : '',
    sector1_s: payload.sector1_s !== undefined && payload.sector1_s !== null && payload.sector1_s !== ''
      ? Number(payload.sector1_s) : '',
    sector2_s: payload.sector2_s !== undefined && payload.sector2_s !== null && payload.sector2_s !== ''
      ? Number(payload.sector2_s) : '',
    sector3_s: payload.sector3_s !== undefined && payload.sector3_s !== null && payload.sector3_s !== ''
      ? Number(payload.sector3_s) : '',
    in_pits: payload.in_pits === true,
    yellow_flag: payload.yellow_flag === true,
    num_pitstops: payload.num_pitstops !== undefined && payload.num_pitstops !== null && payload.num_pitstops !== ''
      ? Number(payload.num_pitstops) : '',
    driver_name: payload.driver_name ? String(payload.driver_name).trim() : '',
    source: 'telemetry',
    created_at: new Date().toISOString(),
  };

  const sheet = getSheet(SHEETS.FUEL_LOG);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = headers.map(h => (sample[h] !== undefined ? sample[h] : ''));
  sheet.appendRow(row);

  // car_number è quasi sempre puramente numerico ("69") — Sheets lo
  // convertirebbe in automatico in un valore numerico. Forziamo testo
  // puro sulla cella appena scritta, stessa cautela già usata per
  // birth_date (Consent.js) e scheduled_date (SocialManager.js).
  const carNumberCol = headers.indexOf('car_number') + 1;
  if (carNumberCol > 0) {
    const cell = sheet.getRange(sheet.getLastRow(), carNumberCol);
    cell.setNumberFormat('@');
    cell.setValue(sample.car_number);
  }

  invalidateSheetCache_(SHEETS.FUEL_LOG);

  return ok({ sample });
}

/**
 * fuel.logLive — Ping leggero di stato corrente, mandato dal companion
 * app ogni ~15s indipendentemente dal cambio giro (a differenza di
 * fuel.logSample, che scrive un campione solo ad ogni giro completato).
 * Serve SOLO a mostrare il valore istantaneo nel pannello — non scrive
 * righe nello sheet e non entra mai nel calcolo di consumo medio per
 * giro (quello resta fuel.logSample/fuel.summary, invariato). Salvato
 * in Script Properties: costo quasi zero anche con ping ravvicinati,
 * niente crescita dello sheet.
 *
 * @param {Object} payload - { race_id, car_number, lap_number?, fuel_remaining_l, virtual_energy_pct? }
 * @param {Object} ctx - Auth context (richiesto)
 */
function handleFuelLogLive(payload, ctx) {
  if (!ctx || !ctx.driver_id) return fail('Auth richiesto');

  payload = payload || {};
  const raceId = String(payload.race_id || '').trim();
  const carNumber = String(payload.car_number || '').trim();

  if (!raceId) return fail('race_id obbligatorio');
  if (!carNumber) return fail('car_number obbligatorio');
  if (payload.fuel_remaining_l === undefined || payload.fuel_remaining_l === null || payload.fuel_remaining_l === '') {
    return fail('fuel_remaining_l obbligatorio');
  }

  const live = {
    lap_number: payload.lap_number !== undefined && payload.lap_number !== null && payload.lap_number !== ''
      ? Number(payload.lap_number) : null,
    fuel_remaining_l: Number(payload.fuel_remaining_l),
    virtual_energy_pct: payload.virtual_energy_pct !== undefined && payload.virtual_energy_pct !== null && payload.virtual_energy_pct !== ''
      ? Number(payload.virtual_energy_pct) : null,
    // Wave: stessi campi auto-rilevati di fuel.logSample, qui solo il
    // valore istantaneo (non ha senso un min/max/avg su un singolo ping).
    track_name: payload.track_name ? String(payload.track_name).trim() : null,
    vehicle_name: payload.vehicle_name ? String(payload.vehicle_name).trim() : null,
    speed_kmh: payload.speed_kmh !== undefined && payload.speed_kmh !== null && payload.speed_kmh !== ''
      ? Number(payload.speed_kmh) : null,
    ts: new Date().toISOString(),
  };

  PropertiesService.getScriptProperties().setProperty(fuelLiveKey_(raceId, carNumber), JSON.stringify(live));

  return ok({});
}

function fuelLiveKey_(raceId, carNumber) {
  return 'fuel_live_' + raceId + '|' + carNumber;
}

// Un giro è "pulito" (utilizzabile per passo/consumo medio e per il
// ranking hotstint) solo se non è un out/in-lap (in_pits) e non è
// stato percorso sotto bandiera gialla, a tutto campo o locale
// (yellow_flag) — entrambi falsano il dato: un in-lap è più lento per
// via del limitatore, un giro sotto FCY consuma meno carburante del
// normale, quindi includerlo abbasserebbe la stima di consumo e
// rischierebbe un rifornimento insufficiente al box successivo.
// Righe scritte da un companion pre-Wave (senza questi due campi)
// risultano '' non true/false: trattate come pulite (comportamento
// invariato per lo storico esistente).
function isCleanLap_(sample) {
  return sample.in_pits !== true && sample.yellow_flag !== true;
}

// Ping considerato valido solo se recente — se il companion si chiude
// a metà sessione (o il pilota smette di giocare), dopo questa soglia
// fuel.summary ignora il ping congelato e torna silenziosamente
// all'ultimo campione "ufficiale" per giro, invece di mostrare un
// valore fantasma che non si muove più.
const FUEL_LIVE_MAX_AGE_MS = 2 * 60 * 1000;

function readFuelLive_(raceId, carNumber) {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty(fuelLiveKey_(raceId, carNumber));
    if (!raw) return null;
    const live = JSON.parse(raw);
    const ageMs = Date.now() - new Date(live.ts).getTime();
    if (isNaN(ageMs) || ageMs > FUEL_LIVE_MAX_AGE_MS) return null;
    return live;
  } catch (e) {
    return null;
  }
}

/**
 * fuel.summary — Consumo medio mobile e proiezione autonomia per una
 * vettura su una gara.
 * Auth: richiesta (qualsiasi utente loggato, stesso livello di
 * raceCrews.list — utile anche ai piloti in rotazione, non solo staff).
 *
 * @param {Object} payload - {
 *   race_id, car_number,
 *   window?,      // n. di delta recenti usati per la media mobile (default 5)
 *   target_laps?  // se fornito, calcola il rabbocco per coprire N giri extra
 * }
 * @param {Object} ctx - Auth context (richiesto)
 * @returns {Object} ok({
 *   sample_count, latest,  // latest include anche track_name/vehicle_name
 *                          // auto-rilevati e speed_min/max/avg_kmh del
 *                          // giro (null se companion non aggiornato)
 *   fuel: { avg_per_lap_l, laps_remaining, needed_for_target_l },
 *   energy: { avg_pct_per_lap, laps_remaining, needed_for_target_pct } | null,
 *   speed: { session_min_kmh, session_max_kmh, session_avg_kmh } | null,
 *   series: [{ lap_number, fuel_remaining_l, virtual_energy_pct, lap_time_s }],  // per il grafico
 *   avg_lap_time_s, // tempo medio reale tra un campione e il successivo,
 *                    // secondi — usato dal frontend per convertire l'ora
 *                    // di fine stint in un numero di giri (vedi FuelPanel.jsx)
 *   live            // true se "latest" viene da un ping fuel.logLive
 *                    // recente invece che dall'ultimo campione per-giro
 * })
 */
function handleFuelSummary(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');

  payload = payload || {};
  const raceId = String(payload.race_id || '').trim();
  const carNumber = String(payload.car_number || '').trim();
  const windowSize = payload.window ? Number(payload.window) : 5;
  const targetLaps = payload.target_laps !== undefined && payload.target_laps !== null
    ? Number(payload.target_laps) : null;

  if (!raceId) return fail('race_id obbligatorio');
  if (!carNumber) return fail('car_number obbligatorio');

  // Confronto con String(...).trim() su entrambi i lati: se il numero
  // vettura è puramente numerico (es. "69"), Google Sheets converte
  // in automatico la cella in un valore numerico — un uguale stretto
  // tra stringa e numero fallirebbe sempre, facendo apparire 0
  // campioni anche quando lo sheet li ha già ricevuti correttamente.
  const samples = sheetToObjects(SHEETS.FUEL_LOG)
    .filter(s => String(s.race_id).trim() === raceId && String(s.car_number).trim() === carNumber)
    .map(s => ({
      ...s,
      lap_number: Number(s.lap_number),
      fuel_remaining_l: s.fuel_remaining_l !== '' ? Number(s.fuel_remaining_l) : null,
      virtual_energy_pct: s.virtual_energy_pct !== '' ? Number(s.virtual_energy_pct) : null,
      speed_min_kmh: s.speed_min_kmh !== '' && s.speed_min_kmh != null ? Number(s.speed_min_kmh) : null,
      speed_max_kmh: s.speed_max_kmh !== '' && s.speed_max_kmh != null ? Number(s.speed_max_kmh) : null,
      speed_avg_kmh: s.speed_avg_kmh !== '' && s.speed_avg_kmh != null ? Number(s.speed_avg_kmh) : null,
      // Wave: passo reale dal buffer Scoring (sostituisce l'approssimazione
      // via created_at quando disponibile — vedi loop delta sotto) e i due
      // flag "giro sporco" usati da isCleanLap_.
      lap_time_s: s.lap_time_s !== '' && s.lap_time_s != null ? Number(s.lap_time_s) : null,
      in_pits: s.in_pits === true,
      yellow_flag: s.yellow_flag === true,
    }))
    .sort((a, b) => {
      if (a.lap_number !== b.lap_number) return a.lap_number - b.lap_number;
      return String(a.created_at || '').localeCompare(String(b.created_at || ''));
    });

  const liveReading = readFuelLive_(raceId, carNumber);

  if (samples.length === 0 && !liveReading) {
    return ok({ sample_count: 0, latest: null, fuel: null, energy: null, speed: null });
  }

  const lastLapSample = samples.length ? samples[samples.length - 1] : null;

  // "latest" per la UI: se c'è un ping live recente lo preferiamo per
  // il valore istantaneo (più fresco di un giro intero), ma le medie/
  // autonomia qui sotto restano calcolate SOLO sui campioni per-giro
  // in "samples" — il ping live non li tocca in alcun modo, evitando
  // di falsare "consumo per giro" con letture infra-giro.
  const latest = liveReading ? {
    lap_number: liveReading.lap_number != null ? liveReading.lap_number : (lastLapSample ? lastLapSample.lap_number : null),
    fuel_remaining_l: liveReading.fuel_remaining_l,
    virtual_energy_pct: liveReading.virtual_energy_pct != null ? liveReading.virtual_energy_pct : (lastLapSample ? lastLapSample.virtual_energy_pct : null),
    // Wave: track_name/vehicle_name dal ping live se presenti, altrimenti
    // dall'ultimo campione per-giro — sempre "cosa sto guidando ora", non
    // congelati al giro precedente se il ping li ha aggiornati nel
    // frattempo (es. cambio vettura ai box). speed_* SOLO dal giro
    // completato: un ping istantaneo non è un min/max/avg di giro.
    track_name: liveReading.track_name || (lastLapSample ? lastLapSample.track_name : '') || '',
    vehicle_name: liveReading.vehicle_name || (lastLapSample ? lastLapSample.vehicle_name : '') || '',
    speed_min_kmh: lastLapSample ? lastLapSample.speed_min_kmh : null,
    speed_max_kmh: lastLapSample ? lastLapSample.speed_max_kmh : null,
    speed_avg_kmh: lastLapSample ? lastLapSample.speed_avg_kmh : null,
    created_at: liveReading.ts,
  } : lastLapSample;

  // Delta positivo = consumo. Delta negativo = rabbocco (pit) — escluso
  // dalla media mobile, altrimenti falserebbe la stima di consumo.
  // Wave: in più, il consumo/passo del giro "cur" entra in gioco SOLO
  // se isCleanLap_(cur) — un in/out-lap o un giro sotto gialla non
  // rappresenta il consumo/passo "di gara" e falserebbe la proiezione
  // (tipicamente un giro a bandiera gialla consuma MENO carburante del
  // normale: includerlo abbassa la stima e rischia un rifornimento
  // insufficiente al pit stop successivo).
  const fuelDeltas = [];
  const energyDeltas = [];
  const lapTimeDeltas = [];
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const cur = samples[i];
    const clean = isCleanLap_(cur);
    if (clean && prev.fuel_remaining_l != null && cur.fuel_remaining_l != null) {
      const d = prev.fuel_remaining_l - cur.fuel_remaining_l;
      if (d > 0) fuelDeltas.push(d);
    }
    if (clean && prev.virtual_energy_pct != null && cur.virtual_energy_pct != null) {
      const d = prev.virtual_energy_pct - cur.virtual_energy_pct;
      if (d > 0) energyDeltas.push(d);
    }
    // Tempo giro: preferito il valore reale dal buffer Scoring
    // (lap_time_s, timer di gioco) quando il companion lo manda; solo
    // se assente si torna al vecchio calcolo via created_at (companion
    // non aggiornati, o dati storici pre-Wave) — quest'ultimo include
    // anche latenza di rete quindi è sempre un'approssimazione.
    // Usato per convertire "minuti a fine stint" in "giri residui" lato
    // frontend (vedi FuelPanel.jsx, calcolo automatico target laps).
    let lapTimeS = cur.lap_time_s;
    if (lapTimeS == null) {
      const prevT = new Date(prev.created_at).getTime();
      const curT = new Date(cur.created_at).getTime();
      if (!isNaN(prevT) && !isNaN(curT) && curT > prevT) lapTimeS = (curT - prevT) / 1000;
    }
    if (lapTimeS != null) {
      // Riattaccato al campione stesso (non solo all'array flat delle
      // delta) così la series sotto può esporre il passo giro-per-giro
      // per il grafico "Passo Gara".
      cur._lapTimeS = lapTimeS;
      if (clean) lapTimeDeltas.push(lapTimeS);
    }
  }

  const recentAvg = arr => {
    if (arr.length === 0) return null;
    const recent = arr.slice(-windowSize);
    return recent.reduce((s, v) => s + v, 0) / recent.length;
  };

  const avgFuelPerLap = recentAvg(fuelDeltas);
  const avgEnergyPctPerLap = recentAvg(energyDeltas);
  const avgLapTimeS = recentAvg(lapTimeDeltas);

  const fuel = latest.fuel_remaining_l != null ? {
    avg_per_lap_l: avgFuelPerLap,
    laps_remaining: avgFuelPerLap ? latest.fuel_remaining_l / avgFuelPerLap : null,
    needed_for_target_l: (targetLaps != null && avgFuelPerLap)
      ? Math.max(0, targetLaps * avgFuelPerLap - latest.fuel_remaining_l)
      : null,
  } : null;

  const energy = latest.virtual_energy_pct != null ? {
    avg_pct_per_lap: avgEnergyPctPerLap,
    laps_remaining: avgEnergyPctPerLap ? latest.virtual_energy_pct / avgEnergyPctPerLap : null,
    needed_for_target_pct: (targetLaps != null && avgEnergyPctPerLap)
      ? Math.max(0, targetLaps * avgEnergyPctPerLap - latest.virtual_energy_pct)
      : null,
  } : null;

  // Velocità aggregate sull'intera sessione (non solo l'ultimo giro):
  // min dei min, max dei max, media pesata per numero di giri presi in
  // considerazione — coerente col fatto che ogni campione porta già il
  // min/max/avg calcolato dal companion sul SUO giro. Nessun windowSize
  // qui: a differenza del consumo, la velocità non "deriva" nel tempo,
  // ha senso vedere l'intera sessione.
  const speedSamples = samples.filter(s => s.speed_avg_kmh != null);
  const speed = speedSamples.length > 0 ? {
    session_min_kmh: Math.min(...speedSamples.map(s => s.speed_min_kmh != null ? s.speed_min_kmh : s.speed_avg_kmh)),
    session_max_kmh: Math.max(...speedSamples.map(s => s.speed_max_kmh != null ? s.speed_max_kmh : s.speed_avg_kmh)),
    session_avg_kmh: speedSamples.reduce((sum, s) => sum + s.speed_avg_kmh, 0) / speedSamples.length,
  } : null;

  // Serie per il grafico di tendenza lato frontend — solo i campi
  // essenziali, un punto per giro (già ordinati per lap_number sopra).
  const series = samples.map(s => ({
    lap_number: s.lap_number,
    fuel_remaining_l: s.fuel_remaining_l,
    virtual_energy_pct: s.virtual_energy_pct,
    lap_time_s: s._lapTimeS != null ? s._lapTimeS : null,
  }));

  return ok({ sample_count: samples.length, latest, fuel, energy, speed, series, avg_lap_time_s: avgLapTimeS, live: !!liveReading });
}

/**
 * fuel.mySession — Risolve automaticamente la sessione carburante più
 * recente del pilota loggato, SENZA che debba digitare nessun ID.
 * Usata da FuelEnergy.jsx (pagina personale) per sostituire i due campi
 * manuali "ID sessione"/"numero vettura" — funziona perché il token del
 * companion porta già ctx.driver_id (vedi Devices.js), quindi non c'è
 * bisogno di nessuna etichetta condivisa da far coincidere a mano tra
 * companion e sito.
 *
 * NON copre le gare ufficiali multi-pilota (AdminRaceStints, che
 * restano su race_id di calendario + car_number esplicito — lì serve
 * correlare la VETTURA attraverso i cambi turno, un singolo driver_id
 * non basta): quel flusso resta invariato.
 *
 * Guarda solo FuelLog (giri completati), non i ping fuel.logLive —
 * quindi durante il primissimo giro di una sessione nuova (prima che
 * arrivi il primo campione per-giro) risulta ancora "nessuna sessione
 * attiva", si allinea entro il primo giro completato.
 *
 * @param {Object} _payload - non usato
 * @param {Object} ctx - Auth context (richiesto, driver_id valorizzato)
 * @returns {Object} ok({ active: false }) oppure
 *   ok({ active: true, race_id, car_number, track_name, vehicle_name,
 *        lap_number, created_at })
 */
function handleFuelMySession(_payload, ctx) {
  if (!ctx || !ctx.driver_id) return fail('Auth richiesto');

  const mine = sheetToObjects(SHEETS.FUEL_LOG)
    .filter(s => s.driver_id === ctx.driver_id)
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

  if (mine.length === 0) return ok({ active: false });

  const latest = mine[0];
  const ageMs = Date.now() - new Date(latest.created_at).getTime();
  if (isNaN(ageMs) || ageMs > FUEL_MY_SESSION_MAX_AGE_MS) return ok({ active: false });

  return ok({
    active: true,
    race_id: latest.race_id,
    car_number: latest.car_number,
    track_name: latest.track_name || '',
    vehicle_name: latest.vehicle_name || '',
    lap_number: latest.lap_number !== '' ? Number(latest.lap_number) : null,
    created_at: latest.created_at,
  });
}

// Soglia minima di giri puliti perché uno stint entri in gara per il
// titolo di "hotstint" — evita che un singolo giro isolato (es. subito
// prima di una bandiera rossa) con un tempo fortunato vinca il
// confronto solo perché non c'è nulla con cui fare la media.
const FUEL_STINTS_MIN_CLEAN_LAPS_FOR_HOTSTINT = 3;

/**
 * fuel.stints — Raggruppa i giri di una vettura (letti da FuelLog) in
 * stint (sequenza di giri tra due soste ai box) e calcola passo medio,
 * degrado, consumo e velocità media per ciascuno — sola lettura, non
 * scrive nulla. Individua anche l'"hotstint": lo stint con il miglior
 * passo medio tra quelli con abbastanza giri puliti da essere
 * significativi (vedi FUEL_STINTS_MIN_CLEAN_LAPS_FOR_HOTSTINT).
 *
 * Confine di stint = nuova riga quando la riga PRECEDENTE aveva
 * in_pits=true (questa riga è l'out-lap del nuovo stint), oppure
 * num_pitstops è salito rispetto alla riga precedente (copre il caso
 * in cui il campione in_pits fosse mancante), oppure cambia driver_id
 * (driver swap). "Giro pulito" = stessa definizione di isCleanLap_,
 * PIÙ il primo giro di ogni stint escluso a prescindere (out-lap:
 * anche quando in_pits non lo marca esplicitamente, il passo di un
 * out-lap non è mai rappresentativo dello stint).
 *
 * Richiede companion aggiornato (lap_time_s, sector1-3_s, in_pits,
 * yellow_flag, num_pitstops, driver_name) — righe FuelLog pre-Wave senza
 * questi campi vengono comunque incluse nel raggruppamento (in_pits/
 * yellow_flag assenti = giro trattato come pulito) ma senza lap_time_s
 * non contribuiscono a best/avg/degradation di nessuno stint.
 *
 * @param {Object} payload - { race_id, car_number }
 * @param {Object} ctx - Auth context (richiesto, stesso livello di fuel.summary)
 * @returns {Object} ok({
 *   stints: [{ driver_id, driver_name, start_lap, end_lap, lap_count,
 *              clean_lap_count, best_lap_s, avg_lap_s, degradation_s,
 *              fuel_used_l, avg_speed_kmh }],
 *   hotstint: <uno degli oggetti sopra, o null se nessuno stint ha
 *              abbastanza giri puliti>
 * })
 */
function handleFuelStints(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');

  payload = payload || {};
  const raceId = String(payload.race_id || '').trim();
  const carNumber = String(payload.car_number || '').trim();
  if (!raceId) return fail('race_id obbligatorio');
  if (!carNumber) return fail('car_number obbligatorio');

  const rows = sheetToObjects(SHEETS.FUEL_LOG)
    .filter(s => String(s.race_id).trim() === raceId && String(s.car_number).trim() === carNumber)
    .map(s => ({
      driver_id: s.driver_id,
      driver_name: s.driver_name || '',
      lap_number: Number(s.lap_number),
      lap_time_s: s.lap_time_s !== '' && s.lap_time_s != null ? Number(s.lap_time_s) : null,
      fuel_remaining_l: s.fuel_remaining_l !== '' ? Number(s.fuel_remaining_l) : null,
      speed_avg_kmh: s.speed_avg_kmh !== '' && s.speed_avg_kmh != null ? Number(s.speed_avg_kmh) : null,
      in_pits: s.in_pits === true,
      yellow_flag: s.yellow_flag === true,
      num_pitstops: s.num_pitstops !== '' && s.num_pitstops != null ? Number(s.num_pitstops) : null,
      created_at: s.created_at,
    }))
    .sort((a, b) => {
      if (a.lap_number !== b.lap_number) return a.lap_number - b.lap_number;
      return String(a.created_at || '').localeCompare(String(b.created_at || ''));
    });

  if (rows.length === 0) return ok({ stints: [], hotstint: null });

  const stintGroups = [];
  let current = null;
  rows.forEach((row, i) => {
    const prev = i > 0 ? rows[i - 1] : null;
    const startsNewStint = !prev
      || prev.in_pits === true
      || (prev.num_pitstops != null && row.num_pitstops != null && row.num_pitstops > prev.num_pitstops)
      || prev.driver_id !== row.driver_id;
    if (startsNewStint) {
      current = { driver_id: row.driver_id, driver_name: row.driver_name, laps: [] };
      stintGroups.push(current);
    }
    current.laps.push(row);
  });

  const stints = stintGroups.map(group => {
    const laps = group.laps;
    // idx !== 0: il primo giro dello stint (out-lap) è sempre escluso
    // dal passo, anche se in_pits non l'ha marcato esplicitamente — vedi
    // commento sopra la funzione.
    const cleanLaps = laps.filter((lap, idx) => idx !== 0 && isCleanLap_(lap) && lap.lap_time_s != null);
    const lapTimes = cleanLaps.map(l => l.lap_time_s);
    const bestLapS = lapTimes.length ? Math.min(...lapTimes) : null;
    const avgLapS = lapTimes.length ? lapTimes.reduce((s, v) => s + v, 0) / lapTimes.length : null;
    const degradationS = lapTimes.length >= 2 ? (lapTimes[lapTimes.length - 1] - lapTimes[0]) : null;

    const fuelValues = laps.map(l => l.fuel_remaining_l).filter(v => v != null);
    const fuelUsedL = fuelValues.length >= 2 ? Math.max(0, fuelValues[0] - fuelValues[fuelValues.length - 1]) : null;

    const speedValues = cleanLaps.map(l => l.speed_avg_kmh).filter(v => v != null);
    const avgSpeedKmh = speedValues.length ? speedValues.reduce((s, v) => s + v, 0) / speedValues.length : null;

    return {
      driver_id: group.driver_id,
      driver_name: group.driver_name,
      start_lap: laps[0].lap_number,
      end_lap: laps[laps.length - 1].lap_number,
      lap_count: laps.length,
      clean_lap_count: cleanLaps.length,
      best_lap_s: bestLapS,
      avg_lap_s: avgLapS,
      degradation_s: degradationS,
      fuel_used_l: fuelUsedL,
      avg_speed_kmh: avgSpeedKmh,
    };
  });

  const eligible = stints.filter(s => s.clean_lap_count >= FUEL_STINTS_MIN_CLEAN_LAPS_FOR_HOTSTINT && s.avg_lap_s != null);
  const hotstint = eligible.length
    ? eligible.reduce((best, s) => (s.avg_lap_s < best.avg_lap_s ? s : best))
    : null;

  return ok({ stints, hotstint });
}
