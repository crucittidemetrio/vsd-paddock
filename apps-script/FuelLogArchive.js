// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Archiviazione sessioni FuelLog concluse
// ═══════════════════════════════════════════════════════════
// Perché questo file: fuel.summary (FuelLog.js) rilegge l'INTERO tab
// FuelLog ad ogni chiamata — è il pannello live durante le gare, quindi
// deve restare veloce. Se FuelLog cresce indefinitamente (un campione
// per giro per vettura, per sempre), quella lettura rallenta un po'
// alla volta anche per le gare future.
//
// archiveStaleFuelLogSessions() sposta le sessioni "concluse" (nessun
// nuovo campione da FUEL_LOG_STALE_DAYS giorni) dal tab live
// FuelLog a FuelLogArchive (dati grezzi, mai buttati) + scrive una
// riga di medie in FuelLogSummary (consumo medio/giro, giri coperti,
// intervallo temporale) per confronti storici veloci senza dover
// rileggere migliaia di campioni.
//
// Pensato per girare da trigger giornaliero (vedi Triggers.js), ma è
// sicuro anche lanciarla a mano più volte — le sessioni già archiviate
// non esistono più in FuelLog quindi non vengono riprocessate.
//
// Prima di attivare il trigger la prima volta, consigliato lanciare
// previewFuelLogArchive() dall'editor per vedere cosa verrebbe
// spostato senza toccare nulla.
// ═══════════════════════════════════════════════════════════

// Una sessione (race_id + car_number) è "conclusa" se il suo campione
// più recente è più vecchio di così. 2 giorni è ampio margine anche
// per una 24h endurance con pit prolungati — nessuna sessione reale
// dovrebbe mai risultare ancora "viva" a quella distanza.
const FUEL_LOG_STALE_DAYS = 2;

/**
 * Legge FuelLog e raggruppa i campioni per race_id::car_number,
 * individuando quali gruppi sono "stale" (inattivi da
 * FUEL_LOG_STALE_DAYS+ giorni). Non scrive né cancella nulla — helper
 * condiviso da preview ed esecuzione reale.
 */
function computeStaleFuelLogGroups_() {
  const fuelSheet = getSheet(SHEETS.FUEL_LOG);
  const data = fuelSheet.getDataRange().getValues();
  if (data.length <= 1) return { fuelSheet, headers: [], colIdx: {}, staleGroups: [] };

  const headers = data[0];
  const colIdx = {};
  headers.forEach((h, i) => { colIdx[h] = i; });

  const groups = {};
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const raceId = String(row[colIdx.race_id] || '').trim();
    if (!raceId) continue; // riga vuota
    const carNumber = String(row[colIdx.car_number] || '').trim();
    const key = raceId + '::' + carNumber;
    if (!groups[key]) groups[key] = { raceId, carNumber, rows: [] };
    // rowIndex 1-based nel foglio: data[i] è la riga i+1.
    groups[key].rows.push({ rowIndex: i + 1, values: row });
  }

  const staleMs = FUEL_LOG_STALE_DAYS * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const staleGroups = Object.values(groups).filter(g => {
    const lastCreatedAt = g.rows.reduce((max, r) => {
      const t = new Date(r.values[colIdx.created_at]).getTime();
      return isNaN(t) ? max : Math.max(max, t);
    }, 0);
    return lastCreatedAt > 0 && (now - lastCreatedAt) > staleMs;
  });

  return { fuelSheet, headers, colIdx, staleGroups };
}

/**
 * Sola lettura — logga quali sessioni verrebbero archiviate senza
 * modificare nulla. Da lanciare a mano prima di fidarsi del trigger
 * automatico.
 * Dropdown function → previewFuelLogArchive → ▶ Esegui → Visualizza log.
 */
function previewFuelLogArchive() {
  const { staleGroups } = computeStaleFuelLogGroups_();
  if (staleGroups.length === 0) {
    Logger.log(`Nessuna sessione FuelLog inattiva da >${FUEL_LOG_STALE_DAYS} giorni al momento.`);
    return;
  }
  Logger.log(`${staleGroups.length} sessioni verrebbero archiviate (inattive da >${FUEL_LOG_STALE_DAYS} giorni):`);
  staleGroups.forEach(g => {
    Logger.log(`  - race_id="${g.raceId}" car_number="${g.carNumber}": ${g.rows.length} campioni`);
  });
}

/**
 * Esecuzione reale: sposta le sessioni concluse da FuelLog a
 * FuelLogArchive (grezzo) + FuelLogSummary (medie). Sicura da rilanciare
 * più volte — non c'è nulla da riprocessare dopo il primo passaggio.
 * Chiamata dal trigger giornaliero fuelLogArchiveDailyRun (Triggers.js),
 * ma invocabile anche a mano dall'editor.
 */
function archiveStaleFuelLogSessions() {
  const { fuelSheet, colIdx, staleGroups } = computeStaleFuelLogGroups_();

  if (staleGroups.length === 0) {
    Logger.log(`Nessuna sessione FuelLog inattiva da >${FUEL_LOG_STALE_DAYS} giorni.`);
    return { archived_sessions: 0, archived_rows: 0 };
  }

  const archiveSheet = getSheet(SHEETS.FUEL_LOG_ARCHIVE);
  const summarySheet = getSheet(SHEETS.FUEL_LOG_SUMMARY);
  const archivedAt = new Date().toISOString();

  const archiveRows = [];
  const summaryRows = [];
  const rowIndicesToDelete = [];

  staleGroups.forEach(g => {
    // Stesso ordinamento di handleFuelSummary (FuelLog.js): per giro,
    // poi per timestamp a parità di giro.
    const sorted = g.rows.slice().sort((a, b) => {
      const la = Number(a.values[colIdx.lap_number]);
      const lb = Number(b.values[colIdx.lap_number]);
      if (la !== lb) return la - lb;
      return String(a.values[colIdx.created_at]).localeCompare(String(b.values[colIdx.created_at]));
    });

    sorted.forEach(r => {
      archiveRows.push(r.values.concat([archivedAt]));
      rowIndicesToDelete.push(r.rowIndex);
    });

    // Medie sull'intera sessione (non finestra mobile come nel live):
    // stessa regola "solo consumo, il rabbocco/pit non conta" di
    // handleFuelSummary, per restare coerenti col numero che i piloti
    // vedono durante la gara.
    const fuelDeltas = [];
    const energyDeltas = [];
    for (let i = 1; i < sorted.length; i++) {
      const prevFuel = sorted[i - 1].values[colIdx.fuel_remaining_l];
      const curFuel = sorted[i].values[colIdx.fuel_remaining_l];
      if (prevFuel !== '' && curFuel !== '') {
        const d = Number(prevFuel) - Number(curFuel);
        if (d > 0) fuelDeltas.push(d);
      }
      const prevEnergy = sorted[i - 1].values[colIdx.virtual_energy_pct];
      const curEnergy = sorted[i].values[colIdx.virtual_energy_pct];
      if (prevEnergy !== '' && curEnergy !== '') {
        const d = Number(prevEnergy) - Number(curEnergy);
        if (d > 0) energyDeltas.push(d);
      }
    }
    const avg = arr => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : '');

    const driverIds = Array.from(new Set(sorted.map(r => r.values[colIdx.driver_id]).filter(Boolean)));
    const lapNumbers = sorted.map(r => Number(r.values[colIdx.lap_number])).filter(n => !isNaN(n));
    const fuelCapacitySample = sorted.map(r => r.values[colIdx.fuel_capacity_l]).find(v => v !== '');
    const createdAts = sorted.map(r => String(r.values[colIdx.created_at] || '')).filter(Boolean).sort();

    summaryRows.push([
      Utilities.getUuid(),
      g.raceId,
      g.carNumber,
      driverIds.join(', '),
      lapNumbers.length ? Math.max(...lapNumbers) : sorted.length,
      avg(fuelDeltas),
      avg(energyDeltas),
      fuelCapacitySample !== undefined ? fuelCapacitySample : '',
      createdAts[0] || '',
      createdAts[createdAts.length - 1] || '',
      archivedAt,
    ]);
  });

  if (archiveRows.length > 0) {
    archiveSheet.getRange(archiveSheet.getLastRow() + 1, 1, archiveRows.length, FUEL_LOG_ARCHIVE_HEADERS.length)
      .setValues(archiveRows);
  }
  if (summaryRows.length > 0) {
    summarySheet.getRange(summarySheet.getLastRow() + 1, 1, summaryRows.length, FUEL_LOG_SUMMARY_HEADERS.length)
      .setValues(summaryRows);
  }

  // Cancellazione decrescente per non sballare gli indici di riga
  // (stesso accorgimento già usato in Maintenance.js).
  rowIndicesToDelete.sort((a, b) => b - a);
  rowIndicesToDelete.forEach(r => fuelSheet.deleteRow(r));

  Logger.log(`✅ Archiviate ${staleGroups.length} sessioni (${rowIndicesToDelete.length} campioni grezzi) FuelLog → FuelLogArchive/FuelLogSummary.`);
  return { archived_sessions: staleGroups.length, archived_rows: rowIndicesToDelete.length };
}

/**
 * Wrapper per il trigger a tempo (Triggers.js) — stesso ruolo di
 * runStintNotificationsCheck / garage61RunSync: nome dedicato così lo
 * si riconosce subito in listTriggers() senza doverlo dedurre dal nome
 * "generico" della funzione che fa il lavoro vero.
 */
function fuelLogArchiveDailyRun() {
  archiveStaleFuelLogSessions();
}
