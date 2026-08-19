// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — BestLaps Endpoints
// ═══════════════════════════════════════════════════════════
// Strategia: backend ritorna sempre l'intero set di laps,
// il frontend filtra in memoria. Coerente con roster.list.
// ═══════════════════════════════════════════════════════════

/**
 * laps.list — Tutti i lap times.
 * Auth: richiesta.
 * 
 * Filtri client-side: il backend NON applica filtri arbitrari.
 * L'unica responsabilità qui è ordinare per lap_time_ms ASC.
 *
 * @param {Object} payload - {} (ignorato)
 * @param {Object} ctx - Auth context (richiesto)
 * @returns {Object} { ok, data: { laps: [...], count } }
 */
function handleLapsList(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');

  const laps = sheetToObjects(SHEETS.BEST_LAPS);

  // Ordina per tempo crescente (più veloce prima)
  laps.sort((a, b) => Number(a.lap_time_ms) - Number(b.lap_time_ms));

  return ok({ laps, count: laps.length });
}

/**
 * laps.leaderboard — Best lap per pilota su un dato (sim, track, [car]).
 * Auth: richiesta.
 *
 * Logica: per ogni driver_id, prende il lap col lap_time_ms minore
 * (best assoluto, indipendente da date/conditions/session_type).
 * Coerente col mockApi.
 *
 * @param {Object} payload - { sim, track_id, car_id? }
 * @param {Object} ctx - Auth context (richiesto)
 * @returns {Object} { ok, data: { laps: [...], count } }
 */
function handleLapsLeaderboard(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');

  const sim = payload && payload.sim;
  const trackId = payload && payload.track_id;
  const carId = payload && payload.car_id;

  if (!sim) return fail('sim mancante');
  if (!trackId) return fail('track_id mancante');

  const allLaps = sheetToObjects(SHEETS.BEST_LAPS);

  // Filtra per sim, track, e (opzionalmente) car
  const filtered = allLaps.filter(l => {
    if (l.sim !== sim) return false;
    if (l.track_id !== trackId) return false;
    if (carId && l.car_id !== carId) return false;
    return true;
  });

  // Group by driver_id, mantieni il lap più veloce
  const byDriver = {};
  filtered.forEach(l => {
    const t = Number(l.lap_time_ms);
    if (!byDriver[l.driver_id] || Number(byDriver[l.driver_id].lap_time_ms) > t) {
      byDriver[l.driver_id] = l;
    }
  });

  // Estrai i best e ordina per tempo crescente
  const best = Object.values(byDriver).sort(
    (a, b) => Number(a.lap_time_ms) - Number(b.lap_time_ms)
  );

  return ok({ laps: best, count: best.length });
}

// ═══════════════════════════════════════════════════════════
// MANUAL CRUD — inserimento manuale best lap (staff only)
// ═══════════════════════════════════════════════════════════

/**
 * Parsa un tempo "M:SS.mmm" in millisecondi. Stessa regex/logica
 * dell'onEdit trigger in bestLapsAutoMs.js, replicata qui perché
 * quel trigger non è chiamabile programmaticamente.
 *
 * @param {string} display - es. "1:30.333"
 * @returns {number|null} ms oppure null se formato non valido
 */
function parseLapTimeToMs_(display) {
  const value = String(display || '').trim();
  const match = value.match(/^(\d+):(\d{1,2})\.(\d{1,3})$/);
  if (!match) return null;

  const minutes = parseInt(match[1], 10);
  const seconds = parseInt(match[2], 10);
  if (seconds >= 60) return null;

  const msPart = match[3].padEnd(3, '0').slice(0, 3);
  const ms = parseInt(msPart, 10);

  return minutes * 60000 + seconds * 1000 + ms;
}

/**
 * laps.add — Inserimento manuale di un best lap. Staff only.
 *
 * @param {Object} payload - { driver_id, sim, track_id, car_id, lap_time_display,
 *   set_date?, conditions?, session_type?, setup_shared?, setup_link?, replay_url?, notes? }
 * @param {Object} ctx - Auth context (richiesto, staff)
 * @returns {Object} ok({ lap_id, lap }) oppure fail
 */
function handleLapsAdd(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');
  if (!ctx.isStaff) return fail('Permessi insufficienti');

  const requiredFields = ['driver_id', 'sim', 'track_id', 'car_id', 'lap_time_display'];
  for (let i = 0; i < requiredFields.length; i++) {
    const field = requiredFields[i];
    if (payload[field] === undefined || payload[field] === null || String(payload[field]).trim() === '') {
      return fail(`Campo obbligatorio mancante o vuoto: ${field}`);
    }
  }

  const lapTimeMs = parseLapTimeToMs_(payload.lap_time_display);
  if (lapTimeMs === null) {
    return fail('lap_time_display non valido. Formato atteso: M:SS.mmm (es. 1:30.333)');
  }

  // Record di squadra precedente su questa (sim, track_id), PRIMA di
  // aggiungere il nuovo giro — stesso criterio del Muro dei Record
  // (Records.js): giro più veloce di un tesserato attivo, qualsiasi
  // session_type. Serve solo per decidere se notificare un nuovo
  // record su Discord (vedi in fondo alla funzione); un fallimento qui
  // non deve mai bloccare il salvataggio del giro.
  let previousBestMs = null;
  let previousBestDisplay = null;
  let isNewRecordCandidate = false;
  try {
    const existingLaps = sheetToObjects(SHEETS.BEST_LAPS);
    const drivers = getCachedSheetData_(SHEETS.DRIVERS, 600);
    const driverMap = {};
    drivers.forEach(d => { driverMap[d.driver_id] = d; });
    const isCurrentTesserato = (driverId) => {
      const d = driverMap[driverId];
      if (!d) return false;
      if (driverId === 'VSD001') return false;
      if (d.removed_at) return false;
      return d.status === 'active';
    };
    existingLaps.forEach(l => {
      if (l.sim !== payload.sim || l.track_id !== payload.track_id) return;
      const ms = Number(l.lap_time_ms);
      if (!ms || ms <= 0) return;
      if (!isCurrentTesserato(l.driver_id)) return;
      if (previousBestMs === null || ms < previousBestMs) {
        previousBestMs = ms;
        previousBestDisplay = l.lap_time_display || msToLapDisplay_(ms);
      }
    });
    isNewRecordCandidate = isCurrentTesserato(payload.driver_id)
      && (previousBestMs === null || lapTimeMs < previousBestMs);
  } catch (e) {
    Logger.log('⚠️ calcolo record precedente fallito: ' + e.message);
  }

  const sheet = getSheet(SHEETS.BEST_LAPS);
  if (!sheet) return fail('Foglio BestLaps non trovato');

  // Generazione lap_id: stesso pattern di garage61SyncLaps_ (max scan + 1)
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  let maxLapNum = 0;
  for (let i = 1; i < data.length; i++) {
    const id = data[i][0];
    const m = String(id || '').match(/LAP(\d+)/i);
    if (m) maxLapNum = Math.max(maxLapNum, parseInt(m[1], 10));
  }
  const newLapId = 'LAP' + String(maxLapNum + 1).padStart(3, '0');
  const now = new Date().toISOString();

  const newLap = {
    lap_id: newLapId,
    driver_id: payload.driver_id,
    sim: payload.sim,
    track_id: payload.track_id,
    car_id: payload.car_id,
    lap_time_ms: lapTimeMs,
    lap_time_display: msToLapDisplay_(lapTimeMs),
    set_date: payload.set_date || now.split('T')[0],
    conditions: payload.conditions || 'dry',
    air_temp_c: payload.air_temp_c !== undefined && payload.air_temp_c !== null ? payload.air_temp_c : '',
    track_temp_c: payload.track_temp_c !== undefined && payload.track_temp_c !== null ? payload.track_temp_c : '',
    session_type: payload.session_type || 'practice',
    setup_shared: payload.setup_shared || 'FALSE',
    setup_link: payload.setup_link || '',
    replay_url: payload.replay_url || '',
    verified_by: ctx.driver_id || 'staff',
    verified_at: now,
    notes: payload.notes || '',
    created_at: now,
    garage61_lap_id: '',
  };

  // Scrittura mappata per nome header (robusta a riordini colonne)
  const row = headers.map(h => (newLap[h] !== undefined ? newLap[h] : ''));
  sheet.appendRow(row);
  invalidateSheetCache_(SHEETS.BEST_LAPS);

  if (isNewRecordCandidate) {
    try {
      const drivers = getCachedSheetData_(SHEETS.DRIVERS, 600);
      const driverRow = drivers.find(d => d.driver_id === payload.driver_id);
      const driverName = (driverRow && driverRow.display_name) || payload.driver_id;

      const tracks = getCachedSheetData_(SHEETS.TRACKS, 21600);
      const trackRow = tracks.find(t => t.track_id === payload.track_id);
      const trackName = (trackRow && trackRow.track_name) || payload.track_id;

      notifyNewTeamRecord_({
        driver_name: driverName,
        driver_id: payload.driver_id,
        sim: payload.sim,
        track_name: trackName,
        lap_time_display: newLap.lap_time_display,
      }, previousBestDisplay);
    } catch (e) {
      Logger.log('⚠️ notifyNewTeamRecord_ error: ' + e.message);
    }
  }

  return ok({ lap_id: newLapId, lap: newLap });
}

/**
 * laps.update — Modifica un lap manuale esistente. Staff only.
 * Non altera lap_id né created_at. Se lap_time_display cambia,
 * ricalcola lap_time_ms automaticamente.
 *
 * @param {Object} payload - { lap_id, ...campi da aggiornare }
 * @param {Object} ctx - Auth context (richiesto, staff)
 * @returns {Object} ok({ lap_id, updated[] }) oppure fail
 */
function handleLapsUpdate(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');
  if (!ctx.isStaff) return fail('Permessi insufficienti');

  const lap_id = payload && payload.lap_id;
  if (!lap_id) return fail('Campo lap_id obbligatorio per l\'aggiornamento');

  const sheet = getSheet(SHEETS.BEST_LAPS);
  if (!sheet) return fail('Foglio BestLaps non trovato');

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return fail('Lap non trovato: ' + lap_id);

  const headers = data[0];
  const rowIndex = data.findIndex(row => row[0] === lap_id);
  if (rowIndex === -1) return fail('Lap non trovato: ' + lap_id);

  const payloadToApply = { ...payload };
  if (payload.lap_time_display) {
    const lapTimeMs = parseLapTimeToMs_(payload.lap_time_display);
    if (lapTimeMs === null) {
      return fail('lap_time_display non valido. Formato atteso: M:SS.mmm (es. 1:30.333)');
    }
    payloadToApply.lap_time_ms = lapTimeMs;
    payloadToApply.lap_time_display = msToLapDisplay_(lapTimeMs);
  }

  // sim/track_id/driver_id della riga PRIMA della modifica — servono per
  // il controllo record anche quando non sono tra i campi aggiornati
  // (caso comune: si corregge solo lap_time_display).
  const headerIdx = {};
  headers.forEach((h, i) => { headerIdx[h] = i; });
  const currentRow = data[rowIndex];
  const sim = payloadToApply.sim || currentRow[headerIdx.sim];
  const trackId = payloadToApply.track_id || currentRow[headerIdx.track_id];
  const driverId = payloadToApply.driver_id || currentRow[headerIdx.driver_id];

  // Record di squadra precedente su (sim, trackId), PRIMA di applicare
  // la modifica — stesso criterio/pattern di handleLapsAdd. Controllato
  // solo se il tempo cambia davvero (altrimenti non può mai diventare
  // un nuovo record). Non serve escludere questa riga dal calcolo: se
  // era già lei il record, il valore letto qui è comunque il suo
  // valore PRE-modifica, cioè esattamente "il record prima di questo
  // cambio" — la semantica corretta per il messaggio di notifica.
  let previousBestMs = null;
  let previousBestDisplay = null;
  let isNewRecordCandidate = false;
  if (payloadToApply.lap_time_ms !== undefined) {
    try {
      const existingLaps = sheetToObjects(SHEETS.BEST_LAPS);
      const drivers = getCachedSheetData_(SHEETS.DRIVERS, 600);
      const driverMap = {};
      drivers.forEach(d => { driverMap[d.driver_id] = d; });
      const isCurrentTesserato = (id) => {
        const d = driverMap[id];
        if (!d) return false;
        if (id === 'VSD001') return false;
        if (d.removed_at) return false;
        return d.status === 'active';
      };
      existingLaps.forEach(l => {
        if (l.sim !== sim || l.track_id !== trackId) return;
        const ms = Number(l.lap_time_ms);
        if (!ms || ms <= 0) return;
        if (!isCurrentTesserato(l.driver_id)) return;
        if (previousBestMs === null || ms < previousBestMs) {
          previousBestMs = ms;
          previousBestDisplay = l.lap_time_display || msToLapDisplay_(ms);
        }
      });
      isNewRecordCandidate = isCurrentTesserato(driverId)
        && (previousBestMs === null || payloadToApply.lap_time_ms < previousBestMs);
    } catch (e) {
      Logger.log('⚠️ calcolo record precedente (update) fallito: ' + e.message);
    }
  }

  const rowToUpdate = rowIndex + 1; // base-1 per getRange
  const updatedFields = [];

  for (const key in payloadToApply) {
    if (key === 'lap_id' || key === 'created_at' || key === 'garage61_lap_id') continue;
    const colIndex = headers.indexOf(key);
    if (colIndex !== -1) {
      sheet.getRange(rowToUpdate, colIndex + 1).setValue(payloadToApply[key]);
      updatedFields.push(key);
    }
  }

  if (updatedFields.length > 0) {
    invalidateSheetCache_(SHEETS.BEST_LAPS);
  }

  if (isNewRecordCandidate) {
    try {
      const drivers = getCachedSheetData_(SHEETS.DRIVERS, 600);
      const driverRow = drivers.find(d => d.driver_id === driverId);
      const driverName = (driverRow && driverRow.display_name) || driverId;

      const tracks = getCachedSheetData_(SHEETS.TRACKS, 21600);
      const trackRow = tracks.find(t => t.track_id === trackId);
      const trackName = (trackRow && trackRow.track_name) || trackId;

      notifyNewTeamRecord_({
        driver_name: driverName,
        driver_id: driverId,
        sim: sim,
        track_name: trackName,
        lap_time_display: payloadToApply.lap_time_display,
      }, previousBestDisplay);
    } catch (e) {
      Logger.log('⚠️ notifyNewTeamRecord_ (update) error: ' + e.message);
    }
  }

  return ok({ lap_id: lap_id, updated: updatedFields });
}

/**
 * laps.remove — Rimuove un lap manuale. Staff only.
 *
 * @param {Object} payload - { lap_id }
 * @param {Object} ctx - Auth context (richiesto, staff)
 * @returns {Object} ok({ lap_id, deleted }) oppure fail
 */
function handleLapsRemove(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');
  if (!ctx.isStaff) return fail('Permessi insufficienti');

  const lap_id = payload && payload.lap_id;
  if (!lap_id) return fail('Campo lap_id obbligatorio per la rimozione');

  const sheet = getSheet(SHEETS.BEST_LAPS);
  if (!sheet) return fail('Foglio BestLaps non trovato');

  const data = sheet.getDataRange().getValues();
  const rowIndex = data.findIndex(row => row[0] === lap_id);
  if (rowIndex === -1) return fail('Lap non trovato: ' + lap_id);

  sheet.deleteRow(rowIndex + 1); // base-1
  invalidateSheetCache_(SHEETS.BEST_LAPS);

  return ok({ lap_id: lap_id, deleted: true });
}

// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// RACE LAPS — laps derivati da RaceResults
// ═══════════════════════════════════════════════════════════

/**
 * laps.raceLaps — Best lap derivati da RaceResults (gare e qualifying).
 * Solo VSD drivers (is_vsd_driver='TRUE') con best_lap_ms valorizzato.
 *
 * Output schema compatibile con laps.list, più campi extra:
 *  - race_id, race_name: gara di origine
 *  - source: 'race' (per distinguere da manuali)
 *
 * @param {Object} payload - {} (ignorato)
 * @param {Object} ctx - Auth context (richiesto)
 * @returns {Object} { ok, data: { laps, count } }
 */
function handleLapsRaceLaps(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');

  const results = sheetToObjects(SHEETS.RACE_RESULTS);
  const races = getCachedSheetData_(SHEETS.RACES, 900);
  const carMatchMap = buildCarNameToIdMap_();

  // race_id -> race_name lookup
  const raceNameMap = {};
  races.forEach(r => { if (r.race_id) raceNameMap[r.race_id] = r.race_name; });

  const laps = results
    .filter(r => {
      if (String(r.is_vsd_driver).toUpperCase() !== 'TRUE') return false;
      const t = Number(r.best_lap_ms);
      return !isNaN(t) && t > 0;
    })
    .map(r => {
      const lapMs = Number(r.best_lap_ms);
      const carId = matchCarName_(r.car_external_name, carMatchMap) || '';
      return {
        lap_id: `RACELAP-${r.result_id}`,
        driver_id: r.driver_id,
        sim: r.sim,
        track_id: r.track_id,
        car_id: carId,
        car_external_name: r.car_external_name || '',
        lap_time_ms: lapMs,
        lap_time_display: msToLapDisplay_(lapMs),
        set_date: r.set_date,
        conditions: 'race',
        session_type: r.session_type || 'race',
        setup_shared: '',
        setup_link: '',
        replay_url: '',
        verified_by: 'auto',
        verified_at: r.imported_at || '',
        notes: '',
        // Extra fields specific to race-derived laps
        race_id: r.race_id,
        race_name: raceNameMap[r.race_id] || '',
        source: 'race',
      };
    })
    .sort((a, b) => a.lap_time_ms - b.lap_time_ms);

  return ok({ laps, count: laps.length });
}

/**
 * Helper: mappa { car_full_name_lowercase: car_id } dal tab Cars.
 * Tenta match tra car_external_name (LMU JSON) e Cars.full_name/name.
 * Difensivo: prova più nomi di campo per robustezza.
 */
function buildCarNameToIdMap_() {
  const cars = getCachedSheetData_(SHEETS.CARS, 21600);
  const map = {};
  cars.forEach(c => {
    if (!c.car_id) return;
    const candidates = [c.full_name, c.name, c.display_name, c.car_name];
    candidates.forEach(name => {
      if (name) {
        const key = String(name).toLowerCase().trim();
        if (!map[key]) map[key] = c.car_id;
      }
    });
  });
  return map;
}

function matchCarName_(externalName, matchMap) {
  if (!externalName) return null;
  const key = String(externalName).toLowerCase().trim();
  return matchMap[key] || null;
}

// ═══════════════════════════════════════════════════════════
// LAP SUBMISSIONS — invio autonomo piloti con foto di prova,
// validazione riservata agli admin (non staff generico).
// ═══════════════════════════════════════════════════════════
//
// Flusso: il pilota carica una foto del tempo su Vercel Blob (frontend,
// vedi api/media-upload.js), poi invia qui l'url insieme al tempo.
// La riga resta 'pending' in BestLapSubmissions finché un admin non la
// approva (→ copiata in BestLaps con la stessa logica di handleLapsAdd,
// notifica nuovo record inclusa) o rifiuta. In entrambi i casi il
// frontend cancella la foto da Blob subito dopo la decisione — qui
// restituiamo sempre evidence_url per permetterglielo.

/**
 * lapSubmissions.submit — Un pilota VSD invia un proprio tempo con foto
 * di prova, in attesa di validazione admin.
 *
 * @param {Object} payload - { sim, track_id, car_id, lap_time_display,
 *   evidence_url, set_date?, conditions?, session_type?, notes? }
 * @param {Object} ctx - Auth context (richiesto, driver_id valorizzato)
 * @returns {Object} ok({ submission_id }) oppure fail
 */
function handleLapSubmissionsSubmit(payload, ctx) {
  if (!ctx || !ctx.driver_id) return fail('Devi essere loggato come pilota VSD');

  const requiredFields = ['sim', 'track_id', 'car_id', 'lap_time_display', 'evidence_url'];
  for (let i = 0; i < requiredFields.length; i++) {
    const field = requiredFields[i];
    if (payload[field] === undefined || payload[field] === null || String(payload[field]).trim() === '') {
      return fail(`Campo obbligatorio mancante o vuoto: ${field}`);
    }
  }

  const lapTimeMs = parseLapTimeToMs_(payload.lap_time_display);
  if (lapTimeMs === null) {
    return fail('lap_time_display non valido. Formato atteso: M:SS.mmm (es. 1:30.333)');
  }

  const sheet = getSheet(SHEETS.BEST_LAP_SUBMISSIONS);
  if (!sheet) return fail('Foglio BestLapSubmissions non trovato');

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  let maxNum = 0;
  for (let i = 1; i < data.length; i++) {
    const id = data[i][0];
    const m = String(id || '').match(/SUB(\d+)/i);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
  }
  const submissionId = 'SUB' + String(maxNum + 1).padStart(3, '0');
  const now = new Date().toISOString();

  const newSubmission = {
    submission_id: submissionId,
    driver_id: ctx.driver_id,
    sim: payload.sim,
    track_id: payload.track_id,
    car_id: payload.car_id,
    lap_time_display: msToLapDisplay_(lapTimeMs),
    lap_time_ms: lapTimeMs,
    set_date: payload.set_date || now.split('T')[0],
    conditions: payload.conditions || 'dry',
    air_temp_c: payload.air_temp_c !== undefined && payload.air_temp_c !== null ? payload.air_temp_c : '',
    track_temp_c: payload.track_temp_c !== undefined && payload.track_temp_c !== null ? payload.track_temp_c : '',
    session_type: payload.session_type || 'practice',
    notes: payload.notes || '',
    evidence_url: payload.evidence_url,
    status: 'pending',
    submitted_at: now,
    reviewed_by: '',
    reviewed_at: '',
    review_note: '',
  };

  const row = headers.map(h => (newSubmission[h] !== undefined ? newSubmission[h] : ''));
  sheet.appendRow(row);
  invalidateSheetCache_(SHEETS.BEST_LAP_SUBMISSIONS);

  try {
    const driverName = (ctx.driver && ctx.driver.display_name) || ctx.driver_id;
    notifyNewLapSubmission_({
      driver_name: driverName,
      sim: newSubmission.sim,
      track_id: newSubmission.track_id,
      lap_time_display: newSubmission.lap_time_display,
      submission_id: submissionId,
    });
  } catch (e) {
    Logger.log('⚠️ notifyNewLapSubmission_ error: ' + e.message);
  }

  return ok({ submission_id: submissionId, submission: newSubmission });
}

/**
 * lapSubmissions.listMine — Le richieste inviate dal pilota loggato
 * (tutti gli stati, per mostrare lo storico "in attesa/approvato/rifiutato").
 *
 * @param {Object} payload - {} (ignorato)
 * @param {Object} ctx - Auth context (richiesto, driver_id valorizzato)
 * @returns {Object} ok({ submissions: [...] })
 */
function handleLapSubmissionsListMine(payload, ctx) {
  if (!ctx || !ctx.driver_id) return fail('Devi essere loggato come pilota VSD');

  const all = sheetToObjects(SHEETS.BEST_LAP_SUBMISSIONS);
  const mine = all
    .filter(s => s.driver_id === ctx.driver_id)
    .sort((a, b) => String(b.submitted_at).localeCompare(String(a.submitted_at)));

  return ok({ submissions: mine });
}

/**
 * lapSubmissions.listPending — Coda di revisione. SOLO admin (non staff
 * generico): questa validazione richiede prova video/foto e resta
 * volutamente riservata a te + gli altri admin.
 *
 * @param {Object} payload - {} (ignorato)
 * @param {Object} ctx - Auth context (richiesto, isAdmin)
 * @returns {Object} ok({ submissions: [...] })
 */
function handleLapSubmissionsListPending(payload, ctx) {
  if (!ctx || !ctx.isAdmin) return fail('Riservato agli admin');

  const all = sheetToObjects(SHEETS.BEST_LAP_SUBMISSIONS);
  const pending = all
    .filter(s => s.status === 'pending')
    .sort((a, b) => String(a.submitted_at).localeCompare(String(b.submitted_at)));

  return ok({ submissions: pending });
}

function findSubmissionRow_(sheet, submissionId) {
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rowIndex = data.findIndex(row => row[0] === submissionId);
  return { data, headers, rowIndex };
}

/**
 * lapSubmissions.approve — SOLO admin. Copia la richiesta in BestLaps
 * riusando handleLapsAdd (stessa validazione, stesso controllo nuovo
 * record di squadra, stessa notifica Discord), poi marca la richiesta
 * come 'approved'. Restituisce evidence_url perché il frontend cancelli
 * subito la foto da Blob — non serve conservarla dopo la validazione.
 *
 * @param {Object} payload - { submission_id }
 * @param {Object} ctx - Auth context (richiesto, isAdmin)
 * @returns {Object} ok({ submission_id, lap_id, evidence_url }) oppure fail
 */
function handleLapSubmissionsApprove(payload, ctx) {
  if (!ctx || !ctx.isAdmin) return fail('Riservato agli admin');

  const submissionId = payload && payload.submission_id;
  if (!submissionId) return fail('Campo submission_id obbligatorio');

  const sheet = getSheet(SHEETS.BEST_LAP_SUBMISSIONS);
  if (!sheet) return fail('Foglio BestLapSubmissions non trovato');

  const { data, headers, rowIndex } = findSubmissionRow_(sheet, submissionId);
  if (rowIndex === -1) return fail('Richiesta non trovata: ' + submissionId);

  const headerIdx = {};
  headers.forEach((h, i) => { headerIdx[h] = i; });
  const row = data[rowIndex];
  if (row[headerIdx.status] !== 'pending') {
    return fail('Richiesta già revisionata (stato: ' + row[headerIdx.status] + ')');
  }

  const addResult = handleLapsAdd({
    driver_id: row[headerIdx.driver_id],
    sim: row[headerIdx.sim],
    track_id: row[headerIdx.track_id],
    car_id: row[headerIdx.car_id],
    lap_time_display: row[headerIdx.lap_time_display],
    set_date: row[headerIdx.set_date],
    conditions: row[headerIdx.conditions],
    air_temp_c: headerIdx.air_temp_c !== undefined ? row[headerIdx.air_temp_c] : '',
    track_temp_c: headerIdx.track_temp_c !== undefined ? row[headerIdx.track_temp_c] : '',
    session_type: row[headerIdx.session_type],
    notes: row[headerIdx.notes],
  }, ctx);

  if (!addResult.ok) return addResult;

  const now = new Date().toISOString();
  const rowToUpdate = rowIndex + 1;
  sheet.getRange(rowToUpdate, headerIdx.status + 1).setValue('approved');
  sheet.getRange(rowToUpdate, headerIdx.reviewed_by + 1).setValue(ctx.driver_id || 'admin');
  sheet.getRange(rowToUpdate, headerIdx.reviewed_at + 1).setValue(now);
  invalidateSheetCache_(SHEETS.BEST_LAP_SUBMISSIONS);

  logAudit_(
    ctx,
    'lapSubmissions.approve',
    submissionId,
    'Approvato best lap di ' + row[headerIdx.driver_id] + ' — ' + row[headerIdx.lap_time_display] + ' (' + row[headerIdx.track_id] + ')',
    { submission_id: submissionId, lap_id: addResult.data.lap_id }
  );

  // Push PERSONALE al pilota che ha inviato il tempo — è la risposta a
  // un'azione sua, non un annuncio di squadra: merita di saperlo subito.
  sendPushNotification_([row[headerIdx.driver_id]], {
    title: '✅ Best Lap approvato!',
    body: row[headerIdx.lap_time_display] + ' — ' + row[headerIdx.track_id],
    url: PADDOCK_URL + '/laps',
  });

  return ok({
    submission_id: submissionId,
    lap_id: addResult.data.lap_id,
    evidence_url: row[headerIdx.evidence_url],
  });
}

/**
 * lapSubmissions.reject — SOLO admin. Marca la richiesta come 'rejected'
 * con un motivo opzionale. Restituisce evidence_url perché il frontend
 * cancelli comunque la foto da Blob — non serve conservarla nemmeno per
 * le richieste rifiutate.
 *
 * @param {Object} payload - { submission_id, review_note? }
 * @param {Object} ctx - Auth context (richiesto, isAdmin)
 * @returns {Object} ok({ submission_id, evidence_url }) oppure fail
 */
function handleLapSubmissionsReject(payload, ctx) {
  if (!ctx || !ctx.isAdmin) return fail('Riservato agli admin');

  const submissionId = payload && payload.submission_id;
  if (!submissionId) return fail('Campo submission_id obbligatorio');

  const sheet = getSheet(SHEETS.BEST_LAP_SUBMISSIONS);
  if (!sheet) return fail('Foglio BestLapSubmissions non trovato');

  const { data, headers, rowIndex } = findSubmissionRow_(sheet, submissionId);
  if (rowIndex === -1) return fail('Richiesta non trovata: ' + submissionId);

  const headerIdx = {};
  headers.forEach((h, i) => { headerIdx[h] = i; });
  const row = data[rowIndex];
  if (row[headerIdx.status] !== 'pending') {
    return fail('Richiesta già revisionata (stato: ' + row[headerIdx.status] + ')');
  }

  const now = new Date().toISOString();
  const rowToUpdate = rowIndex + 1;
  sheet.getRange(rowToUpdate, headerIdx.status + 1).setValue('rejected');
  sheet.getRange(rowToUpdate, headerIdx.reviewed_by + 1).setValue(ctx.driver_id || 'admin');
  sheet.getRange(rowToUpdate, headerIdx.reviewed_at + 1).setValue(now);
  sheet.getRange(rowToUpdate, headerIdx.review_note + 1).setValue(payload.review_note || '');
  invalidateSheetCache_(SHEETS.BEST_LAP_SUBMISSIONS);

  logAudit_(
    ctx,
    'lapSubmissions.reject',
    submissionId,
    'Rifiutato best lap di ' + row[headerIdx.driver_id] + ' — ' + row[headerIdx.lap_time_display] + ' (' + row[headerIdx.track_id] + ')' +
      (payload.review_note ? ': ' + payload.review_note : ''),
    { submission_id: submissionId, review_note: payload.review_note || '' }
  );

  // Push PERSONALE — stesso principio dell'approvazione: è una risposta
  // diretta a un'azione del pilota, non un annuncio pubblico.
  sendPushNotification_([row[headerIdx.driver_id]], {
    title: '❌ Best Lap non approvato',
    body: row[headerIdx.lap_time_display] + ' — ' + row[headerIdx.track_id] +
      (payload.review_note ? ': ' + payload.review_note : ''),
    url: PADDOCK_URL + '/laps',
  });

  return ok({ submission_id: submissionId, evidence_url: row[headerIdx.evidence_url] });
}

/**
 * lapSubmissions.remove — Cancella una riga dallo storico richieste
 * ("Le tue richieste" in Best Laps). Puramente un log/audit trail: una
 * richiesta approvata ha già copiato il tempo in BestLaps via
 * handleLapsAdd (riga separata) — cancellare qui NON tocca il lap reale,
 * serve solo a ripulire lo storico (es. test, doppioni).
 *
 * Auth: SOLO admin — lo storico (incluse le richieste rifiutate) resta
 * un riferimento utile, un pilota non deve poter far sparire le proprie
 * richieste da solo.
 *
 * @param {Object} payload - { submission_id }
 */
function handleLapSubmissionsRemove(payload, ctx) {
  if (!ctx || !ctx.isAdmin) return fail('Riservato agli admin');

  const submissionId = payload && payload.submission_id;
  if (!submissionId) return fail('Campo submission_id obbligatorio');

  const sheet = getSheet(SHEETS.BEST_LAP_SUBMISSIONS);
  if (!sheet) return fail('Foglio BestLapSubmissions non trovato');

  const { data, headers, rowIndex } = findSubmissionRow_(sheet, submissionId);
  if (rowIndex === -1) return fail('Richiesta non trovata: ' + submissionId);

  const headerIdx = {};
  headers.forEach((h, i) => { headerIdx[h] = i; });
  const row = data[rowIndex];
  const ownerDriverId = row[headerIdx.driver_id];

  sheet.deleteRow(rowIndex + 1);
  invalidateSheetCache_(SHEETS.BEST_LAP_SUBMISSIONS);

  logAudit_(ctx, 'lapSubmissions.remove', submissionId,
    'Richiesta rimossa dallo storico (' + ownerDriverId + ')', null);

  return ok({ removed: submissionId });
}

// Test
function testLapsRaceLaps() {
  const login = handleAuthLogin({ code: 'DEMETRIO-6899' });
  if (!login.ok) { Logger.log('❌ Login: ' + login.error); return; }
  const ctx = verifyToken(login.data.token);

  const result = handleLapsRaceLaps({}, ctx);
  Logger.log(`Race laps: ${result.data.count}`);
  result.data.laps.slice(0, 5).forEach(l => {
    Logger.log(`  ${l.lap_id} | ${l.driver_id} | ${l.lap_time_display} | ${l.track_id} | car_id=${l.car_id || 'NO_MATCH'} (${l.car_external_name})`);
  });
}