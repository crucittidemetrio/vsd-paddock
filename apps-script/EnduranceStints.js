/**
 * EnduranceStints.js — Gestione stint pianificati per gare endurance.
 *
 * Sheet: EnduranceStints (20 colonne)
 *   NOTA: distinto da EnduranceAuditionStints (stint durante audizioni di selezione).
 *   EnduranceStints = stint pianificati per le GARE VERE (es. Le Mans 24h).
 *
 * Actions registrate in Codice.js:
 *   - endurance.stints.list    (auth required)
 *   - endurance.stints.add     (admin/staff only)
 *   - endurance.stints.update  (admin/staff only)
 *   - endurance.stints.remove  (admin/staff only)
 *
 * Design point confermati:
 *   A. Re-numbering automatico stint_order dopo add/remove
 *   B. UNIQUE (race_id, stint_order)
 *   C. Swap pilota = workflow client-side (update status=completed + add nuovo)
 *   D. UI pubblica mostra tutti gli stint con proprio evidenziato (server ritorna tutti)
 *
 * Autore: Phase 5 — giugno 2026
 */

// ═══════════════════════════════════════════════════════════
// COSTANTI
// ═══════════════════════════════════════════════════════════

const ES_TIRE_COMPOUNDS = ['soft', 'medium', 'hard', 'wet', 'intermediate'];
const ES_STATUSES       = ['planned', 'active', 'completed', 'aborted'];

const ES_CACHE_TTL_SECONDS = 300; // 5 min, basso perché in-race può cambiare velocemente

// ═══════════════════════════════════════════════════════════
// HANDLERS PUBBLICI (registrati in Codice.js)
// ═══════════════════════════════════════════════════════════

/**
 * endurance.stints.list — Lista stint pianificati per una gara.
 * Auth: richiesta (qualsiasi utente loggato).
 *
 * @param {Object} payload - { race_id: string }
 * @param {Object} ctx - Auth context
 * @returns {Object} { ok, data: { stints: [...], count: N } }
 */
function handleEnduranceStintsList(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');

  const raceId = payload && payload.race_id;
  if (!raceId) return fail('race_id obbligatorio');

  const stints = _esLoadAll_(raceId);
  // Ordina per car_number poi per stint_order: con più equipaggi sulla
  // stessa gara mantiene ogni piano stint raggruppato e leggibile.
  const sorted = stints.sort((a, b) => {
    const ca = String(a.car_number || '');
    const cb = String(b.car_number || '');
    if (ca !== cb) return ca.localeCompare(cb);
    return Number(a.stint_order) - Number(b.stint_order);
  });

  return ok({ stints: sorted, count: sorted.length });
}

/**
 * endurance.stints.add — Crea un nuovo stint.
 * Auth: admin/staff only.
 *
 * Re-numbering automatico: se viene inserito a stint_order=N, tutti gli stint
 * con order >= N vengono shiftati +1.
 *
 * @param {Object} payload - dati stint (vedi _esValidateStint_)
 * @param {Object} ctx - Auth context (deve essere admin)
 */
function handleEnduranceStintsAdd(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');
  if (!_esIsStaff_(ctx)) return fail('Permessi insufficienti');

  const validation = _esValidateStint_(payload, { isCreate: true });
  if (!validation.ok) return fail(validation.error);

  const raceId      = payload.race_id;
  const carNumber   = String(payload.car_number).trim();
  const desiredOrder = Number(payload.stint_order) || 1;

  // Re-numbering: shift +1 di tutti gli stint della STESSA vettura con
  // order >= desiredOrder. Scopato per car_number: due equipaggi sulla
  // stessa gara hanno numerazioni stint indipendenti.
  _esShiftStintsOrder_(raceId, carNumber, desiredOrder, +1);

  // Crea nuovo record
  const stintId = _esGenerateStintId_();
  const now     = new Date().toISOString();

  const newRow = {
    stint_id:              stintId,
    race_id:               raceId,
    car_number:            carNumber,
    driver_id:             payload.driver_id,
    stint_order:           desiredOrder,
    planned_start_time:    payload.planned_start_time || '',
    planned_end_time:      payload.planned_end_time || '',
    planned_duration_min:  payload.planned_duration_min || '',
    actual_start_time:     '',
    actual_end_time:       '',
    actual_duration_min:   '',
    tire_compound:         payload.tire_compound || '',
    pit_stop_at_end:       (payload.pit_stop_at_end === true || payload.pit_stop_at_end === 'TRUE') ? 'TRUE' : 'FALSE',
    fuel_loaded_l:         payload.fuel_loaded_l || '',
    actual_laps:           '',
    best_lap_ms:           '',
    status:                payload.status || 'planned',
    notes:                 payload.notes || '',
    created_at:            now,
    created_by:            ctx.driver_id || '',
    updated_at:            now,
  };

  _esAppendRow_(newRow);
  _esInvalidateCache_(raceId);

  return ok({ stint: newRow });
}

/**
 * endurance.stints.update — Modifica uno stint esistente.
 * Auth: admin/staff only.
 *
 * Permessi: tutti i campi modificabili tranne stint_id, race_id, created_at, created_by.
 * Se viene modificato stint_order, scatta re-numbering automatico.
 *
 * @param {Object} payload - { stint_id: string, ...campi da aggiornare }
 */
function handleEnduranceStintsUpdate(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');
  if (!_esIsStaff_(ctx)) return fail('Permessi insufficienti');

  const stintId = payload && payload.stint_id;
  if (!stintId) return fail('stint_id obbligatorio');

  const existing = _esFindById_(stintId);
  if (!existing) return fail('Stint non trovato');

  const validation = _esValidateStint_(payload, { isCreate: false, existing });
  if (!validation.ok) return fail(validation.error);

  const raceId = existing.race_id;
  // Re-numbering scopato sulla vettura ATTUALE dello stint (pre-modifica).
  // Nota: cambiare contemporaneamente car_number e stint_order nello stesso
  // update non è un caso supportato — usa due chiamate separate.
  const carNumber = String(existing.car_number || '').trim();

  // Se cambia stint_order → re-numbering
  if (payload.stint_order != null && Number(payload.stint_order) !== Number(existing.stint_order)) {
    const oldOrder = Number(existing.stint_order);
    const newOrder = Number(payload.stint_order);

    _esShiftStintsOrder_(raceId, carNumber, oldOrder + 1, -1, stintId); // chiudi buco
    _esShiftStintsOrder_(raceId, carNumber, newOrder, +1, stintId);     // apri spazio
  }

  // Aggiorna campi consentiti
  const updates = {
    updated_at: new Date().toISOString(),
  };

  const allowedFields = [
    'driver_id', 'stint_order', 'car_number',
    'planned_start_time', 'planned_end_time', 'planned_duration_min',
    'actual_start_time', 'actual_end_time', 'actual_duration_min',
    'tire_compound', 'pit_stop_at_end', 'fuel_loaded_l',
    'actual_laps', 'best_lap_ms', 'status', 'notes',
  ];

  allowedFields.forEach(f => {
    if (payload[f] !== undefined) {
      if (f === 'pit_stop_at_end') {
        updates[f] = (payload[f] === true || payload[f] === 'TRUE') ? 'TRUE' : 'FALSE';
      } else {
        updates[f] = payload[f];
      }
    }
  });

  _esUpdateRowById_(stintId, updates);
  _esInvalidateCache_(raceId);

  const updated = _esFindById_(stintId);
  return ok({ stint: updated });
}

/**
 * endurance.stints.remove — Elimina uno stint.
 * Auth: admin/staff only.
 *
 * Re-numbering automatico: dopo eliminazione, tutti gli stint con order > rimosso
 * vengono shiftati -1.
 *
 * @param {Object} payload - { stint_id: string }
 */
function handleEnduranceStintsRemove(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');
  if (!_esIsStaff_(ctx)) return fail('Permessi insufficienti');

  const stintId = payload && payload.stint_id;
  if (!stintId) return fail('stint_id obbligatorio');

  const existing = _esFindById_(stintId);
  if (!existing) return fail('Stint non trovato');

  const raceId       = existing.race_id;
  const carNumber    = String(existing.car_number || '').trim();
  const removedOrder = Number(existing.stint_order);

  _esDeleteRowById_(stintId);
  _esShiftStintsOrder_(raceId, carNumber, removedOrder + 1, -1);
  _esInvalidateCache_(raceId);

  return ok({ removed: stintId });
}

// ═══════════════════════════════════════════════════════════
// HELPERS PRIVATI
// ═══════════════════════════════════════════════════════════

/**
 * Genera un nuovo stint_id univoco.
 * Formato: stint_<hash 8 char>
 */
function _esGenerateStintId_() {
  const hash = Utilities.computeDigest(
    Utilities.DigestAlgorithm.MD5,
    String(Date.now()) + Math.random()
  );
  const hex = hash.map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('');
  return 'stint_' + hex.substring(0, 8);
}

/**
 * Carica tutti gli stint di una race con cache.
 */
function _esLoadAll_(raceId) {
  const allRows = sheetToObjects(SHEETS.ENDURANCE_STINTS);
  return allRows.filter(r => r.race_id === raceId);
}

/**
 * Cerca uno stint per ID (su tutto il sheet, non solo per race).
 */
function _esFindById_(stintId) {
  const allRows = sheetToObjects(SHEETS.ENDURANCE_STINTS);
  return allRows.find(r => r.stint_id === stintId) || null;
}

/**
 * Verifica se ctx è admin/staff. ADATTARE al sistema di auth esistente.
 * Vedi README step 4.
 */
function _esIsStaff_(ctx) {
  return ctx && (ctx.role === 'admin' || ctx.tier === 'admin');
}

/**
 * Shift dello stint_order per gli stint di una race, scopato a una singola
 * vettura (car_number) — con più equipaggi sulla stessa gara, ogni piano
 * stint ha la propria numerazione indipendente. car_number confrontato come
 * stringa: '' (stint pre-migration, mai assegnati) è un gruppo valido come
 * un altro, così il re-numbering continua a funzionare sulle gare vecchie
 * a equipaggio singolo finché non vengono etichettate a mano.
 *
 * @param {string} raceId
 * @param {string} carNumber - vettura a cui scopare lo shift
 * @param {number} fromOrder - shift applicato a stint con order >= fromOrder
 * @param {number} delta - +1 (apri spazio) o -1 (chiudi buco)
 * @param {string} excludeStintId - opzionale, escludi questo stint_id dal shift (per update)
 */
function _esShiftStintsOrder_(raceId, carNumber, fromOrder, delta, excludeStintId) {
  const sheet = SpreadsheetApp.openById(ENDURANCE_SS_ID).getSheetByName(SHEETS.ENDURANCE_STINTS);
  if (!sheet) throw new Error('Sheet EnduranceStints non trovato');

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return; // solo header

  const headers = data[0];
  const idxStintId    = headers.indexOf('stint_id');
  const idxRaceId     = headers.indexOf('race_id');
  const idxCarNumber  = headers.indexOf('car_number');
  const idxStintOrder = headers.indexOf('stint_order');
  const idxUpdatedAt  = headers.indexOf('updated_at');

  if (idxStintId < 0 || idxRaceId < 0 || idxStintOrder < 0) {
    throw new Error('Schema EnduranceStints inconsistente: colonne mancanti');
  }

  const wantedCarNumber = String(carNumber || '').trim();
  const now = new Date().toISOString();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[idxRaceId] !== raceId) continue;
    // idxCarNumber < 0 = colonna non ancora migrata: tratta tutta la gara
    // come un unico gruppo (comportamento pre-multi-equipaggio).
    if (idxCarNumber >= 0 && String(row[idxCarNumber] || '').trim() !== wantedCarNumber) continue;
    if (excludeStintId && row[idxStintId] === excludeStintId) continue;

    const currentOrder = Number(row[idxStintOrder]);
    if (currentOrder >= fromOrder) {
      sheet.getRange(i + 1, idxStintOrder + 1).setValue(currentOrder + delta);
      if (idxUpdatedAt >= 0) sheet.getRange(i + 1, idxUpdatedAt + 1).setValue(now);
    }
  }
}

/**
 * Append di una riga al sheet.
 */
function _esAppendRow_(rowObj) {
  const sheet = SpreadsheetApp.openById(ENDURANCE_SS_ID).getSheetByName(SHEETS.ENDURANCE_STINTS);
  if (!sheet) throw new Error('Sheet EnduranceStints non trovato');

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const newRow  = headers.map(h => rowObj[h] !== undefined ? rowObj[h] : '');

  sheet.appendRow(newRow);
}

/**
 * Update di una riga per stint_id.
 */
function _esUpdateRowById_(stintId, updates) {
  const sheet = SpreadsheetApp.openById(ENDURANCE_SS_ID).getSheetByName(SHEETS.ENDURANCE_STINTS);
  if (!sheet) throw new Error('Sheet EnduranceStints non trovato');

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idxStintId = headers.indexOf('stint_id');

  for (let i = 1; i < data.length; i++) {
    if (data[i][idxStintId] === stintId) {
      Object.keys(updates).forEach(field => {
        const colIdx = headers.indexOf(field);
        if (colIdx >= 0) {
          sheet.getRange(i + 1, colIdx + 1).setValue(updates[field]);
        }
      });
      return true;
    }
  }
  return false;
}

/**
 * Elimina una riga per stint_id.
 */
function _esDeleteRowById_(stintId) {
  const sheet = SpreadsheetApp.openById(ENDURANCE_SS_ID).getSheetByName(SHEETS.ENDURANCE_STINTS);
  if (!sheet) throw new Error('Sheet EnduranceStints non trovato');

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idxStintId = headers.indexOf('stint_id');

  for (let i = 1; i < data.length; i++) {
    if (data[i][idxStintId] === stintId) {
      sheet.deleteRow(i + 1);
      return true;
    }
  }
  return false;
}

/**
 * Invalida la cache custom per una race.
 */
function _esInvalidateCache_(raceId) {
  const cache = CacheService.getScriptCache();
  cache.remove(`es_race_${raceId}`);
  // Invalida anche cache generica sheet
  if (typeof invalidateSheetCache_ === 'function') {
    invalidateSheetCache_(SHEETS.ENDURANCE_STINTS);
  }
}

/**
 * Validation del payload.
 *
 * @param {Object} payload
 * @param {Object} opts - { isCreate: boolean, existing: Object|null }
 * @returns {Object} { ok: boolean, error?: string }
 */
function _esValidateStint_(payload, opts) {
  opts = opts || {};

  if (opts.isCreate) {
    if (!payload.race_id) return { ok: false, error: 'race_id obbligatorio' };
    if (!payload.car_number || String(payload.car_number).trim() === '') {
      return { ok: false, error: 'car_number obbligatorio (numero di gara della vettura, es. "7")' };
    }
    if (!payload.driver_id) return { ok: false, error: 'driver_id obbligatorio' };
    if (payload.stint_order == null || Number(payload.stint_order) < 1) {
      return { ok: false, error: 'stint_order deve essere >= 1' };
    }
  }

  // Validation tire_compound
  if (payload.tire_compound && payload.tire_compound !== '' && ES_TIRE_COMPOUNDS.indexOf(payload.tire_compound) < 0) {
    return { ok: false, error: `tire_compound non valido. Valori ammessi: ${ES_TIRE_COMPOUNDS.join(', ')}` };
  }

  // Validation status
  if (payload.status && ES_STATUSES.indexOf(payload.status) < 0) {
    return { ok: false, error: `status non valido. Valori ammessi: ${ES_STATUSES.join(', ')}` };
  }

  // Validation coerenza date pianificate
  if (payload.planned_start_time && payload.planned_end_time) {
    const ps = new Date(payload.planned_start_time);
    const pe = new Date(payload.planned_end_time);
    if (!isNaN(ps.getTime()) && !isNaN(pe.getTime()) && ps >= pe) {
      return { ok: false, error: 'planned_start_time deve essere precedente a planned_end_time' };
    }
  }

  // Validation coerenza date effettive
  if (payload.actual_start_time && payload.actual_end_time) {
    const as = new Date(payload.actual_start_time);
    const ae = new Date(payload.actual_end_time);
    if (!isNaN(as.getTime()) && !isNaN(ae.getTime()) && as >= ae) {
      return { ok: false, error: 'actual_start_time deve essere precedente a actual_end_time' };
    }
  }

  return { ok: true };
}

/**
 * Formatta una data in stringa ISO 8601 "naive" (senza suffisso Z / timezone),
 * preservando i componenti di data/ora locali dello script.
 * Coerente col formato usato nel resto del sistema (es. "2026-10-24T15:00:00"),
 * evitando lo shift in UTC che .toISOString() introdurrebbe.
 *
 * @param {Date} d
 * @returns {string} es. "2026-10-24T15:00:00"
 */
function _esToNaiveIso_(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return d.getFullYear()
    + '-' + pad(d.getMonth() + 1)
    + '-' + pad(d.getDate())
    + 'T' + pad(d.getHours())
    + ':' + pad(d.getMinutes())
    + ':' + pad(d.getSeconds());
}

/**
 * Calcola e propone un piano di stint per un evento endurance.
 * Genera gli orari sequenziali e ruota i piloti in base all'ordine fornito.
 * Funzione pura: NON altera lo stato dello sheet.
 *
 * @param {Object} payload Dati della gara e parametri stint.
 * @param {Object} ctx Contesto della richiesta (auth).
 * @returns {Object} ok({ stints, count, total_duration_check }) oppure fail(messaggio).
 */
function handleEnduranceStintsGenerate(payload, ctx) {
  // 1. Auth e permessi
  if (!ctx) {
    return fail('Auth richiesto');
  }
  if (!_esIsStaff_(ctx)) {
    return fail('Permessi insufficienti');
  }

  // 2. Estrazione e validazione input
  const {
    race_id,
    car_number,
    race_start_time,
    total_duration_min,
    target_stint_min,
    driver_ids
  } = payload || {};

  if (!race_id || typeof race_id !== 'string' || race_id.trim() === '') {
    return fail('race_id non valido o mancante');
  }
  if (!car_number || String(car_number).trim() === '') {
    return fail('car_number obbligatorio (numero di gara della vettura, es. "7")');
  }
  const startDate = new Date(race_start_time);
  if (isNaN(startDate.getTime())) {
    return fail('race_start_time non parsabile come data valida');
  }
  if (typeof total_duration_min !== 'number' || total_duration_min <= 0) {
    return fail('total_duration_min deve essere un numero maggiore di 0');
  }
  if (typeof target_stint_min !== 'number' || target_stint_min <= 0 || target_stint_min > total_duration_min) {
    return fail('target_stint_min deve essere un numero > 0 e <= total_duration_min');
  }
  if (!Array.isArray(driver_ids) || driver_ids.length === 0) {
    return fail('driver_ids deve essere un array con almeno 1 elemento');
  }

  // 3. Generazione stint
  const numStints = Math.ceil(total_duration_min / target_stint_min);
  const stints = [];
  let total_duration_check = 0;

  // Avanzamento in millisecondi per non perdere precisione.
  let currentStartTimeMs = startDate.getTime();

  for (let i = 0; i < numStints; i++) {
    // Durata: target per tutti, residuo per l'ultimo (somma esatta = total_duration_min).
    let durationMin = target_stint_min;
    if (i === numStints - 1) {
      durationMin = total_duration_min - (target_stint_min * (numStints - 1));
    }

    const currentEndTimeMs = currentStartTimeMs + (durationMin * 60000);
    const assignedDriverId = driver_ids[i % driver_ids.length];

    stints.push({
      stint_order: i + 1,
      car_number: String(car_number).trim(),
      driver_id: assignedDriverId,
      planned_start_time: _esToNaiveIso_(new Date(currentStartTimeMs)),
      planned_end_time: _esToNaiveIso_(new Date(currentEndTimeMs)),
      planned_duration_min: durationMin
    });

    total_duration_check += durationMin;
    currentStartTimeMs = currentEndTimeMs;
  }

  // 4. Output
  return ok({
    stints: stints,
    count: stints.length,
    total_duration_check: total_duration_check
  });
}

/**
 * Valida la copertura del piano stint rispetto alla durata della gara,
 * rilevando gap, sovrapposizioni e discrepanze con inizio e fine evento.
 * Funzione di sola lettura: non scrive sullo sheet.
 *
 * Validazione basata sugli ORARI (planned_start_time/planned_end_time), non
 * sulle durate dichiarate: gli orari determinano l'effettiva copertura della
 * macchina. Come effetto collaterale intercetta anche discrepanze durata/orari
 * (es. bug DST), segnalando gap dove gli orari non coprono quanto la durata dice.
 *
 * @param {Object} payload { race_id, race_start_time (ISO naive), total_duration_min }.
 * @param {Object} ctx Contesto della richiesta (auth).
 * @returns {Object} ok({ valid, issues, stint_count }) oppure fail.
 */
function handleEnduranceStintsValidateCoverage(payload, ctx) {
  // 1. Auth e permessi
  if (!ctx) return fail('Auth richiesto');
  if (!_esIsStaff_(ctx)) return fail('Permessi insufficienti');

  // 2. Validazione input
  const { race_id, car_number, race_start_time, total_duration_min } = payload || {};

  if (!race_id || typeof race_id !== 'string' || race_id.trim() === '') {
    return fail('race_id mancante o non valido');
  }
  const raceStartMs = new Date(race_start_time).getTime();
  if (isNaN(raceStartMs)) {
    return fail('race_start_time non parsabile come data valida');
  }
  if (typeof total_duration_min !== 'number' || total_duration_min <= 0) {
    return fail('total_duration_min deve essere un numero > 0');
  }

  // 3. Caricamento stint — se car_number è passato, la copertura viene
  // valutata solo sul piano di QUELLA vettura (più equipaggi sulla stessa
  // gara hanno ciascuno la propria copertura indipendente da validare).
  // Senza car_number, comportamento pre-esistente: tutti gli stint della
  // gara (corretto per le gare a equipaggio singolo).
  let stints = _esLoadAll_(race_id);
  if (car_number != null && String(car_number).trim() !== '') {
    const wanted = String(car_number).trim();
    stints = stints.filter(s => String(s.car_number || '').trim() === wanted);
  }
  if (!stints || stints.length === 0) {
    return ok({
      valid: false,
      issues: [{ type: 'no_stints', message: 'Nessuno stint trovato per la gara specificata.' }],
      stint_count: 0
    });
  }

  stints.sort((a, b) => Number(a.stint_order) - Number(b.stint_order));

  // 4. Parsing orari (segnaposto null per stint con orari invalidi, mantiene indici)
  const raceEndMs = raceStartMs + (total_duration_min * 60000);
  const TOLERANCE_MS = 5000; // ~5s: assorbe rumore al secondo, non maschera buchi reali
  const issues = [];
  const parsed = [];

  for (let i = 0; i < stints.length; i++) {
    const s = stints[i];
    const startMs = new Date(s.planned_start_time).getTime();
    const endMs = new Date(s.planned_end_time).getTime();
    if (isNaN(startMs) || isNaN(endMs)) {
      issues.push({
        type: 'invalid_times',
        message: `Orari mancanti o non validi per lo stint ${s.stint_order}.`,
        stint_order: s.stint_order
      });
      parsed.push(null);
    } else {
      parsed.push({ startMs, endMs, stint_order: s.stint_order });
    }
  }

  // 5a. Start mismatch — sul PRIMO stint valido (non per forza l'indice 0)
  const firstValid = parsed.find(p => p !== null);
  if (firstValid) {
    const deltaStart = (firstValid.startMs - raceStartMs) / 60000;
    if (Math.abs(firstValid.startMs - raceStartMs) > TOLERANCE_MS) {
      issues.push({
        type: 'start_mismatch',
        message: `Il primo stint non coincide con la partenza della gara. Delta: ${Math.round(deltaStart)} min.`,
        stint_order: firstValid.stint_order,
        delta_min: deltaStart
      });
    }
  }

  // 5b. End mismatch — sull'ULTIMO stint valido
  let lastValid = null;
  for (let i = parsed.length - 1; i >= 0; i--) {
    if (parsed[i]) { lastValid = parsed[i]; break; }
  }
  if (lastValid) {
    const deltaEnd = (lastValid.endMs - raceEndMs) / 60000;
    if (Math.abs(lastValid.endMs - raceEndMs) > TOLERANCE_MS) {
      issues.push({
        type: 'end_mismatch',
        message: `L'ultimo stint non coincide con la fine prevista della gara. Delta: ${Math.round(deltaEnd)} min.`,
        stint_order: lastValid.stint_order,
        delta_min: deltaEnd
      });
    }
  }

  // 5c. Gap e overlap tra coppie consecutive valide
  for (let i = 0; i < parsed.length - 1; i++) {
    const current = parsed[i];
    const next = parsed[i + 1];
    if (!current || !next) continue;

    const diffMs = next.startMs - current.endMs;
    if (diffMs > TOLERANCE_MS) {
      const gap = diffMs / 60000;
      issues.push({
        type: 'gap',
        message: `Buco temporale di ${Math.round(gap)} min dopo lo stint ${current.stint_order}.`,
        stint_order: current.stint_order,
        delta_min: gap
      });
    } else if (diffMs < -TOLERANCE_MS) {
      const overlap = -diffMs / 60000;
      issues.push({
        type: 'overlap',
        message: `Sovrapposizione di ${Math.round(overlap)} min tra lo stint ${current.stint_order} e il successivo.`,
        stint_order: current.stint_order,
        delta_min: overlap
      });
    }
  }

  // 6. Fair-share: bilanciamento del carico di guida tra i piloti.
  // Speculare a validateFairShare() in src/utils/stintValidation.js — SOFT:
  // avvisa se qualcuno guida in modo molto sproporzionato rispetto alla
  // media del gruppo, ma non è un vincolo rigido (in endurance è normale
  // che un pilota copra più stint per scelta, es. notturni).
  const fairShareIssues = _esValidateFairShare_(stints);
  issues.push(...fairShareIssues);

  // 7. Output
  return ok({
    valid: issues.length === 0,
    issues: issues,
    stint_count: stints.length
  });
}

/**
 * Calcola il bilanciamento del carico di guida tra i piloti di un piano
 * stint GIÀ PERSISTITO. Vedi commento sopra handleEnduranceStintsValidateCoverage
 * e la versione client in src/utils/stintValidation.js (validateFairShare) —
 * stessa soglia di default (±25% dalla media), tenere in sync se cambia.
 *
 * @param {Array} stints - stint con { driver_id, planned_duration_min }.
 * @returns {Array} issue { type: 'unbalanced_share', driver_id, minutes, avg_minutes, deviation_pct, message }.
 */
function _esValidateFairShare_(stints) {
  const TOLERANCE_FRACTION = 0.25;
  const totalsByDriver = {};

  stints.forEach(s => {
    if (!s.driver_id) return;
    const dur = Number(s.planned_duration_min) || 0;
    totalsByDriver[s.driver_id] = (totalsByDriver[s.driver_id] || 0) + dur;
  });

  const driverIds = Object.keys(totalsByDriver);
  if (driverIds.length < 2) return []; // un solo pilota: bilanciamento non applicabile

  const totalMin = driverIds.reduce((sum, id) => sum + totalsByDriver[id], 0);
  if (totalMin <= 0) return [];

  const avgMin = totalMin / driverIds.length;
  const issues = [];

  driverIds.forEach(id => {
    const minutes = totalsByDriver[id];
    const deviation = (minutes - avgMin) / avgMin;
    if (Math.abs(deviation) > TOLERANCE_FRACTION) {
      const pct = Math.round(deviation * 100);
      issues.push({
        type: 'unbalanced_share',
        driver_id: id,
        minutes: Math.round(minutes),
        avg_minutes: Math.round(avgMin),
        deviation_pct: pct,
        message: `${id} guida ${Math.round(minutes)} min (${pct > 0 ? '+' : ''}${pct}% sulla media di ${Math.round(avgMin)} min): carico sbilanciato.`
      });
    }
  });

  return issues;
}

// ═══════════════════════════════════════════════════════════

/**
 * Persiste in batch un piano di stint generato.
 * Se richiesto, cancella gli stint precedentemente esistenti per la gara.
 *
 * @param {Object} payload Dati contenenti race_id, array di stint da scrivere e flag replace_existing.
 * @param {Object} ctx Contesto della richiesta (utilizzato per auth).
 * @returns {Object} Risultato ok con { written, replaced, race_id } o fail.
 */
function handleEnduranceStintsConfirmPlan(payload, ctx) {
  // 1. Controllo Autenticazione e Permessi
  if (!ctx) return fail('Auth richiesto');
  if (!_esIsStaff_(ctx)) return fail('Permessi insufficienti');

  // 2. Estrazione e Validazione Input Base
  const { race_id, car_number, stints, replace_existing } = payload;

  if (!race_id || typeof race_id !== 'string' || race_id.trim() === '') {
    return fail('race_id mancante o non valido');
  }
  if (!car_number || String(car_number).trim() === '') {
    return fail('car_number obbligatorio (numero di gara della vettura, es. "7")');
  }
  const carNumber = String(car_number).trim();

  if (!Array.isArray(stints) || stints.length === 0) {
    return fail('stints deve essere un array non vuoto');
  }

  if (typeof replace_existing !== 'boolean') {
    return fail('replace_existing deve essere un valore booleano');
  }

  for (let i = 0; i < stints.length; i++) {
    const s = stints[i];
    if (!s.driver_id || typeof s.stint_order !== 'number' || s.stint_order < 1) {
      return fail(`Stint all'indice ${i} non valido: driver_id mancante o stint_order < 1`);
    }
  }

  // 3. Gestione Stint Esistenti — SCOPATA alla vettura car_number: un piano
  // confermato per l'auto #8 non deve mai toccare gli stint dell'auto #7
  // sulla stessa gara.
  const existingStints = (_esLoadAll_(race_id) || [])
    .filter(s => String(s.car_number || '').trim() === carNumber);
  let replacedCount = 0;

  if (existingStints.length > 0) {
    if (replace_existing === false) {
      return fail(`La vettura #${carNumber} ha già ${existingStints.length} stint su questa gara. Imposta replace_existing per sostituirli.`);
    } else {
      // Sostituzione confermata: elimina solo i record esistenti di QUESTA vettura
      for (let i = 0; i < existingStints.length; i++) {
        _esDeleteRowById_(existingStints[i].stint_id);
      }
      replacedCount = existingStints.length;
    }
  }

  // 4. Scrittura Nuovi Stint in Batch
  const nowIso = new Date().toISOString();
  const createdBy = ctx.driver_id || '';
  let writtenCount = 0;

  for (let i = 0; i < stints.length; i++) {
    const s = stints[i];
    
    // Costruzione del record completo con i default previsti
    const record = {
      stint_id: _esGenerateStintId_(),
      race_id: race_id,
      car_number: carNumber,
      stint_order: s.stint_order,
      driver_id: s.driver_id,
      planned_start_time: s.planned_start_time || '',
      planned_end_time: s.planned_end_time || '',
      planned_duration_min: s.planned_duration_min !== undefined ? s.planned_duration_min : '',
      actual_start_time: '',
      actual_end_time: '',
      actual_duration_min: '',
      actual_laps: '',
      best_lap_ms: '',
      status: 'planned',
      tire_compound: s.tire_compound || '',
      fuel_loaded_l: s.fuel_loaded_l || '',
      pit_stop_at_end: 'FALSE', // Default booleano come stringa UPPERCASE
      notes: s.notes || '',
      created_by: createdBy,
      created_at: nowIso,
      updated_at: nowIso
    };

    _esAppendRow_(record);
    writtenCount++;
  }

  // 5. Invalidazione Cache
  // Fatta una sola volta alla fine per ottimizzare le performance e rinfrescare lo stato
  _esInvalidateCache_(race_id);

  // 6. Return Output
  return ok({
    written: writtenCount,
    replaced: replacedCount,
    race_id: race_id
  });
}