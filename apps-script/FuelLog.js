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
  invalidateSheetCache_(SHEETS.FUEL_LOG);

  return ok({ sample });
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
 *   energy: { avg_pct_per_lap, laps_remaining } | null
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

  const samples = sheetToObjects(SHEETS.FUEL_LOG)
    .filter(s => s.race_id === raceId && s.car_number === carNumber)
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

  if (samples.length === 0) {
    return ok({ sample_count: 0, latest: null, fuel: null, energy: null });
  }

  const latest = samples[samples.length - 1];

  // Delta positivo = consumo. Delta negativo = rabbocco (pit) — escluso
  // dalla media mobile, altrimenti falserebbe la stima di consumo.
  const fuelDeltas = [];
  const energyDeltas = [];
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
  }

  const recentAvg = arr => {
    if (arr.length === 0) return null;
    const recent = arr.slice(-windowSize);
    return recent.reduce((s, v) => s + v, 0) / recent.length;
  };

  const avgFuelPerLap = recentAvg(fuelDeltas);
  const avgEnergyPctPerLap = recentAvg(energyDeltas);

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
  } : null;

  return ok({ sample_count: samples.length, latest, fuel, energy });
}
