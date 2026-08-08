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
//   'fuel.logSample': handleFuelLogSample
//   'fuel.summary':   handleFuelSummary
// ═══════════════════════════════════════════════════════════

/**
 * fuel.logSample — Registra un campione di consumo (un giro).
 * Auth: richiesta. driver_id preso da ctx (token), MAI dal payload,
 * per evitare che un token compromesso possa scrivere a nome di un
 * altro pilota.
 *
 * @param {Object} payload - {
 *   race_id, car_number, lap_number,
 *   fuel_remaining_l, fuel_capacity_l,
 *   virtual_energy_pct?  // solo classi ibride (LMDh/Hypercar), opzionale
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
    ts: new Date().toISOString(),
  };

  PropertiesService.getScriptProperties().setProperty(fuelLiveKey_(raceId, carNumber), JSON.stringify(live));

  return ok({});
}

function fuelLiveKey_(raceId, carNumber) {
  return 'fuel_live_' + raceId + '|' + carNumber;
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
 *   sample_count, latest,
 *   fuel: { avg_per_lap_l, laps_remaining, needed_for_target_l },
 *   energy: { avg_pct_per_lap, laps_remaining, needed_for_target_pct } | null,
 *   series: [{ lap_number, fuel_remaining_l, virtual_energy_pct }],  // per il grafico
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
    }))
    .sort((a, b) => {
      if (a.lap_number !== b.lap_number) return a.lap_number - b.lap_number;
      return String(a.created_at || '').localeCompare(String(b.created_at || ''));
    });

  const liveReading = readFuelLive_(raceId, carNumber);

  if (samples.length === 0 && !liveReading) {
    return ok({ sample_count: 0, latest: null, fuel: null, energy: null });
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
    created_at: liveReading.ts,
  } : lastLapSample;

  // Delta positivo = consumo. Delta negativo = rabbocco (pit) — escluso
  // dalla media mobile, altrimenti falserebbe la stima di consumo.
  const fuelDeltas = [];
  const energyDeltas = [];
  const lapTimeDeltas = [];
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const cur = samples[i];
    if (prev.fuel_remaining_l != null && cur.fuel_remaining_l != null) {
      const d = prev.fuel_remaining_l - cur.fuel_remaining_l;
      if (d > 0) fuelDeltas.push(d);
    }
    if (prev.virtual_energy_pct != null && cur.virtual_energy_pct != null) {
      const d = prev.virtual_energy_pct - cur.virtual_energy_pct;
      if (d > 0) energyDeltas.push(d);
    }
    // Tempo reale tra un campione e il successivo — usato per convertire
    // "minuti a fine stint" in "giri residui" lato frontend (vedi
    // FuelPanel.jsx, calcolo automatico target laps per gare ufficiali).
    const prevT = new Date(prev.created_at).getTime();
    const curT = new Date(cur.created_at).getTime();
    if (!isNaN(prevT) && !isNaN(curT) && curT > prevT) {
      lapTimeDeltas.push((curT - prevT) / 1000);
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

  // Serie per il grafico di tendenza lato frontend — solo i campi
  // essenziali, un punto per giro (già ordinati per lap_number sopra).
  const series = samples.map(s => ({
    lap_number: s.lap_number,
    fuel_remaining_l: s.fuel_remaining_l,
    virtual_energy_pct: s.virtual_energy_pct,
  }));

  return ok({ sample_count: samples.length, latest, fuel, energy, series, avg_lap_time_s: avgLapTimeS, live: !!liveReading });
}
