// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Clash of Classes: GTE vs GT3
// ═══════════════════════════════════════════════════════════
// Mini-campionato esibizione di 3 round (Silverstone, Imola,
// Spa-Francorchamps) su Le Mans Ultimate. Dominio custom (non il
// generico Championships/RaceResults): serve doppia classifica
// (classe + assoluta), bonus punti, Trofeo delle Classi e un form
// di segnalazione incidenti — logica non coperta dal motore
// standings generico (vedi Standings.js), quindi replicato sullo
// stile dei domini custom esistenti (Endurance*.js).
//
// Sheet usati (vedi SetupClashOfClasses.js per la creazione):
//   ClashParticipants:
//     participant_id | driver_id | display_name | class |
//     discord_handle | registered_at | status | vehicle
//   ClashResults (un rigo per pilota per round):
//     result_id | round | driver_id | display_name | class |
//     finish_position_class | finish_position_overall |
//     pole_class | fastest_lap_class | finisher | dnf |
//     entered_by | entered_at
//   ClashIncidentReports:
//     report_id | round | reporting_name | reported_name |
//     description | replay_url | submitted_at | status
//
// Regolamento di riferimento: docs/brand non pertinente — vedi
// VSD_ClashOfClasses_Regolamento.docx (Rev. 1.0, Agosto 2026).
//
// Action registrate in Codice.js:
//   'clash.participants.list'     handleClashParticipantsList
//   'clash.participants.register' handleClashParticipantsRegister
//   'clash.participants.add'      handleClashParticipantsAdd      (staff)
//   'clash.participants.update'   handleClashParticipantsUpdate   (staff)
//   'clash.participants.remove'   handleClashParticipantsRemove   (staff)
//   'clash.results.submitRound'   handleClashResultsSubmitRound   (staff)
//   'clash.standings'             handleClashStandings
//   'clash.incidents.report'      handleClashIncidentsReport
//   'clash.incidents.list'        handleClashIncidentsList        (staff)
// ═══════════════════════════════════════════════════════════

const CLASH_MAX_GRID = 22;
const CLASH_VALID_CLASSES = ['GTE', 'GT3'];
const CLASH_VALID_ROUNDS = [1, 2, 3];

// Vetture omologate per classe (cap. 3 regolamento, multi-car BoP via
// impostazioni server LMU) — elenco allineato al roster GTE/LMGT3
// disponibile in Le Mans Ultimate. Il campo vehicle è opzionale in
// iscrizione/modifica, ma se valorizzato deve appartenere alla lista
// della classe scelta.
const CLASH_VEHICLES_BY_CLASS = {
  GTE: [
    'Aston Martin Vantage GTE',
    'Chevrolet Corvette C8.R',
    'Ferrari 488 GTE Evo',
    'Porsche 911 RSR-19',
  ],
  GT3: [
    'Aston Martin Vantage AMR LMGT3 Evo',
    'BMW M4 LMGT3',
    'BMW M4 LMGT3 Evo',
    'Chevrolet Corvette Z06 LMGT3.R',
    'Ferrari 296 LMGT3',
    'Ferrari 296 LMGT3 Evo',
    'Ford Mustang LMGT3',
    'Ford Mustang LMGT3 Evo',
    'Lamborghini Huracán LMGT3 Evo 2',
    'Lexus RC F LMGT3',
    'Mercedes-AMG LMGT3',
    'McLaren 720S LMGT3 Evo',
    'Porsche 911 LMGT3 R (992)',
    'Porsche 911 LMGT3 R (992) 2026',
  ],
};

/**
 * Valida (opzionalmente) una vettura per una classe. Ritorna la stringa
 * validata, oppure null se non fornita. Lancia un errore leggibile
 * (tramite fail() nel chiamante) se fornita ma non ammessa per la classe.
 */
function clashValidateVehicle_(vehicle, cls) {
  const v = String(vehicle || '').trim();
  if (!v) return { ok: true, value: '' };
  const allowed = CLASH_VEHICLES_BY_CLASS[cls] || [];
  if (allowed.indexOf(v) === -1) {
    return { ok: false, error: `Vettura non ammessa per la classe ${cls}. Ammesse: ${allowed.join(', ')}` };
  }
  return { ok: true, value: v };
}

// Scala punti posizione (cap. 7.1 regolamento) — uguale per classifica
// di classe e classifica assoluta. Dall'11° in poi scende di 1 fino al
// 15°, poi fisso a 1.
const CLASH_POSITION_POINTS_TABLE = {
  1: 20, 2: 17, 3: 15, 4: 13, 5: 11,
  6: 10, 7: 9, 8: 8, 9: 7, 10: 6,
  11: 5, 12: 4, 13: 3, 14: 2,
};

function clashPositionPoints_(pos) {
  const p = Number(pos);
  if (!p || p < 1) return 0;
  return CLASH_POSITION_POINTS_TABLE[p] !== undefined ? CLASH_POSITION_POINTS_TABLE[p] : 1;
}

function clashIsTrue_(v) {
  return v === true || String(v).toUpperCase() === 'TRUE';
}

function clashGenerateId_(prefix) {
  return prefix + '_' + Utilities.getUuid().replace(/-/g, '').substring(0, 10);
}

// ═══════════════════════════════════════════════════════════
// PARTECIPANTI
// ═══════════════════════════════════════════════════════════

/**
 * clash.participants.list — elenco iscritti.
 * Auth: nessuna richiesta (evento aperto community). Campi privati
 * (discord_handle, driver_id, registered_at) esposti solo a staff.
 */
function handleClashParticipantsList(payload, ctx) {
  const all = sheetToObjects(SHEETS.CLASH_PARTICIPANTS)
    .filter(p => String(p.status || '').trim() !== 'withdrawn');

  const isStaff = !!(ctx && ctx.isStaff);

  const data = all.map(p => {
    const base = {
      participant_id: p.participant_id,
      display_name: p.display_name,
      class: p.class,
      vehicle: p.vehicle || '',
    };
    if (isStaff) {
      base.driver_id = p.driver_id || '';
      base.discord_handle = p.discord_handle || '';
      base.registered_at = p.registered_at;
      base.status = p.status;
    }
    return base;
  });

  const counts = { GTE: 0, GT3: 0 };
  all.forEach(p => { if (counts[p.class] !== undefined) counts[p.class]++; });

  return ok({ participants: data, count: all.length, counts, max_grid: CLASH_MAX_GRID });
}

/**
 * clash.participants.register — iscrizione.
 * Auth: opzionale. Se il chiamante è loggato (ctx.driver_id), l'iscrizione
 * si lega al suo driver_id — evita impersonificazione lato client.
 * Se non loggato, iscrizione "esterna" via solo display_name (community
 * non tesserata, ammessa da regolamento cap. 2.2).
 *
 * @param {Object} payload - { display_name, class: 'GTE'|'GT3', discord_handle?, vehicle? }
 */
function handleClashParticipantsRegister(payload, ctx) {
  payload = payload || {};

  const cls = String(payload.class || '').trim().toUpperCase();
  if (CLASH_VALID_CLASSES.indexOf(cls) === -1) {
    return fail('Classe non valida. Ammesse: ' + CLASH_VALID_CLASSES.join(', '));
  }

  const vehicleCheck = clashValidateVehicle_(payload.vehicle, cls);
  if (!vehicleCheck.ok) return fail(vehicleCheck.error);
  const vehicle = vehicleCheck.value;

  const driverId = (ctx && ctx.driver_id) || null;
  let displayName = String(payload.display_name || '').trim();

  // Se loggato come pilota VSD e non ha specificato un nome, usa il
  // display_name dal roster.
  if (!displayName && driverId) {
    const drivers = getCachedSheetData_(SHEETS.DRIVERS, 600);
    const driver = drivers.find(d => d.driver_id === driverId);
    if (driver) displayName = driver.display_name || '';
  }
  if (!displayName) return fail('Nome pilota mancante');

  const discordHandle = String(payload.discord_handle || '').trim();

  const existing = sheetToObjects(SHEETS.CLASH_PARTICIPANTS)
    .filter(p => String(p.status || '').trim() !== 'withdrawn');

  if (existing.length >= CLASH_MAX_GRID) {
    return fail(`Griglia al completo (${CLASH_MAX_GRID}/${CLASH_MAX_GRID})`);
  }

  const nameKey = displayName.toLowerCase();
  const dup = existing.find(p =>
    (driverId && p.driver_id === driverId) ||
    (String(p.display_name || '').trim().toLowerCase() === nameKey)
  );
  if (dup) return fail('Sei già iscritto a Clash of Classes (classe ' + dup.class + ')');

  const participantId = clashGenerateId_('coc');
  const now = new Date().toISOString();
  const sheet = getSheet(SHEETS.CLASH_PARTICIPANTS);
  sheet.appendRow([participantId, driverId || '', displayName, cls, discordHandle, now, 'registered', vehicle]);

  return ok({
    participant_id: participantId,
    driver_id: driverId || '',
    display_name: displayName,
    class: cls,
    vehicle: vehicle,
    registered_at: now,
    status: 'registered',
  });
}

/**
 * Trova la riga di un partecipante per participant_id. Ritorna l'oggetto
 * con tutti i campi più _rowIndex (1-based, comprensivo di header) per
 * poterla riscrivere sul posto, oppure null se non esiste.
 */
function clashFindParticipantRow_(participantId) {
  if (!participantId) return null;
  const sheet = getSheet(SHEETS.CLASH_PARTICIPANTS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const idCol = headers.indexOf('participant_id');
  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  for (let i = 0; i < values.length; i++) {
    if (values[i][idCol] === participantId) {
      const obj = {};
      headers.forEach((h, c) => { obj[h] = values[i][c]; });
      obj._rowIndex = i + 2;
      obj._headers = headers;
      return obj;
    }
  }
  return null;
}

/**
 * clash.participants.add — iscrizione manuale da parte dello staff.
 * Auth: staff richiesto. Pensato per riallineare i dati con SimGrid
 * (fonte "ufficiale" delle iscrizioni per questo evento): un iscritto
 * su SimGrid ma non ancora presente qui va aggiunto a mano con questa
 * action, senza dover passare dal form pubblico.
 *
 * Stessa validazione di clash.participants.register (classe valida,
 * griglia non piena, no doppioni), ma driver_id/display_name vengono
 * dal payload invece che da ctx, perché è lo staff a inserire per
 * conto di un altro pilota.
 *
 * @param {Object} payload - { display_name, class: 'GTE'|'GT3', discord_handle?, driver_id?, vehicle? }
 */
function handleClashParticipantsAdd(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');
  if (!ctx.isStaff) return fail('Operazione riservata a staff e admin');

  payload = payload || {};
  const cls = String(payload.class || '').trim().toUpperCase();
  if (CLASH_VALID_CLASSES.indexOf(cls) === -1) {
    return fail('Classe non valida. Ammesse: ' + CLASH_VALID_CLASSES.join(', '));
  }
  const vehicleCheck = clashValidateVehicle_(payload.vehicle, cls);
  if (!vehicleCheck.ok) return fail(vehicleCheck.error);
  const vehicle = vehicleCheck.value;

  const displayName = String(payload.display_name || '').trim();
  if (!displayName) return fail('Nome pilota mancante');

  const driverId = String(payload.driver_id || '').trim();
  const discordHandle = String(payload.discord_handle || '').trim();

  const existing = sheetToObjects(SHEETS.CLASH_PARTICIPANTS)
    .filter(p => String(p.status || '').trim() !== 'withdrawn');

  if (existing.length >= CLASH_MAX_GRID) {
    return fail(`Griglia al completo (${CLASH_MAX_GRID}/${CLASH_MAX_GRID})`);
  }

  const nameKey = displayName.toLowerCase();
  const dup = existing.find(p =>
    (driverId && p.driver_id === driverId) ||
    (String(p.display_name || '').trim().toLowerCase() === nameKey)
  );
  if (dup) return fail('Pilota già iscritto (classe ' + dup.class + ') — usa clash.participants.update per modificarlo');

  const participantId = clashGenerateId_('coc');
  const now = new Date().toISOString();
  const sheet = getSheet(SHEETS.CLASH_PARTICIPANTS);
  sheet.appendRow([participantId, driverId, displayName, cls, discordHandle, now, 'registered', vehicle]);

  return ok({
    participant_id: participantId,
    driver_id: driverId,
    display_name: displayName,
    class: cls,
    vehicle: vehicle,
    discord_handle: discordHandle,
    registered_at: now,
    status: 'registered',
  });
}

/**
 * clash.participants.update — modifica un iscritto esistente (classe,
 * nome, discord handle) — es. per correggere un errore di battitura o
 * allineare la classe a quanto risulta su SimGrid.
 * Auth: staff richiesto.
 *
 * @param {Object} payload - { participant_id, display_name?, class?, discord_handle?, vehicle? }
 */
function handleClashParticipantsUpdate(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');
  if (!ctx.isStaff) return fail('Operazione riservata a staff e admin');

  payload = payload || {};
  const participantId = String(payload.participant_id || '').trim();
  if (!participantId) return fail('participant_id obbligatorio');

  const row = clashFindParticipantRow_(participantId);
  if (!row) return fail('Iscritto non trovato: ' + participantId);

  if (payload.class !== undefined) {
    const cls = String(payload.class || '').trim().toUpperCase();
    if (CLASH_VALID_CLASSES.indexOf(cls) === -1) {
      return fail('Classe non valida. Ammesse: ' + CLASH_VALID_CLASSES.join(', '));
    }
    row.class = cls;
    // Cambio classe: la vettura eventualmente già impostata potrebbe non
    // essere più ammessa — se non viene ridichiarata nello stesso payload,
    // la azzeriamo invece di lasciare un dato incoerente.
    if (payload.vehicle === undefined && row.vehicle) {
      const stillValid = (CLASH_VEHICLES_BY_CLASS[cls] || []).indexOf(row.vehicle) !== -1;
      if (!stillValid) row.vehicle = '';
    }
  }
  if (payload.vehicle !== undefined) {
    const targetClass = row.class;
    const vehicleCheck = clashValidateVehicle_(payload.vehicle, targetClass);
    if (!vehicleCheck.ok) return fail(vehicleCheck.error);
    row.vehicle = vehicleCheck.value;
  }
  if (payload.display_name !== undefined) {
    const name = String(payload.display_name || '').trim();
    if (!name) return fail('display_name non può essere vuoto');
    row.display_name = name;
  }
  if (payload.discord_handle !== undefined) {
    row.discord_handle = String(payload.discord_handle || '').trim();
  }

  const headers = row._headers;
  const sheet = getSheet(SHEETS.CLASH_PARTICIPANTS);
  const newRow = headers.map(h => (row[h] !== undefined ? row[h] : ''));
  sheet.getRange(row._rowIndex, 1, 1, newRow.length).setValues([newRow]);

  return ok({
    participant_id: participantId,
    display_name: row.display_name,
    class: row.class,
    vehicle: row.vehicle || '',
    discord_handle: row.discord_handle,
    driver_id: row.driver_id || '',
    status: row.status,
  });
}

/**
 * clash.participants.remove — ritira un iscritto.
 * Auth: staff richiesto. Soft-delete (status → 'withdrawn'), coerente
 * col filtro già usato da clash.participants.list/register: la riga
 * resta nello sheet per storico/audit, ma sparisce dal conteggio
 * griglia e dalla lista pubblica.
 *
 * @param {Object} payload - { participant_id }
 */
function handleClashParticipantsRemove(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');
  if (!ctx.isStaff) return fail('Operazione riservata a staff e admin');

  payload = payload || {};
  const participantId = String(payload.participant_id || '').trim();
  if (!participantId) return fail('participant_id obbligatorio');

  const row = clashFindParticipantRow_(participantId);
  if (!row) return fail('Iscritto non trovato: ' + participantId);

  row.status = 'withdrawn';
  const headers = row._headers;
  const sheet = getSheet(SHEETS.CLASH_PARTICIPANTS);
  const newRow = headers.map(h => (row[h] !== undefined ? row[h] : ''));
  sheet.getRange(row._rowIndex, 1, 1, newRow.length).setValues([newRow]);

  return ok({ participant_id: participantId, status: 'withdrawn' });
}

// ═══════════════════════════════════════════════════════════
// RISULTATI
// ═══════════════════════════════════════════════════════════

/**
 * clash.results.submitRound — inserimento/sostituzione risultati di un round.
 * Auth: staff richiesto.
 *
 * Idempotente per round: cancella le righe esistenti per quel round prima
 * di scrivere quelle nuove, così un re-invio (correzione) sostituisce
 * invece di duplicare.
 *
 * @param {Object} payload - { round: 1|2|3, results: [{
 *   driver_id?, display_name, class: 'GTE'|'GT3',
 *   finish_position_class, finish_position_overall,
 *   pole_class?, fastest_lap_class?, finisher?, dnf?
 * }, ...] }
 */
function handleClashResultsSubmitRound(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');
  if (!ctx.isStaff) return fail('Operazione riservata a staff e admin');

  payload = payload || {};
  const round = Number(payload.round);
  if (CLASH_VALID_ROUNDS.indexOf(round) === -1) {
    return fail('round non valido. Ammessi: ' + CLASH_VALID_ROUNDS.join(', '));
  }

  const results = Array.isArray(payload.results) ? payload.results : [];
  if (results.length === 0) return fail('Nessun risultato da inserire');

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const cls = String((r && r.class) || '').trim().toUpperCase();
    if (CLASH_VALID_CLASSES.indexOf(cls) === -1) {
      return fail(`Riga ${i + 1}: classe non valida ("${r && r.class}")`);
    }
    if (!r.display_name && !r.driver_id) {
      return fail(`Riga ${i + 1}: driver_id o display_name mancante`);
    }
  }

  const sheet = getSheet(SHEETS.CLASH_RESULTS);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const lastRow = sheet.getLastRow();

  // Rimuove le righe esistenti per questo round (dal basso verso l'alto
  // per non sfasare gli indici durante la cancellazione).
  if (lastRow > 1) {
    const allData = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    const roundIdx = headers.indexOf('round');
    for (let i = allData.length - 1; i >= 0; i--) {
      if (Number(allData[i][roundIdx]) === round) {
        sheet.deleteRow(i + 2);
      }
    }
  }

  const now = new Date().toISOString();
  const enteredBy = ctx.driver_id || 'staff';

  const rows = results.map(r => {
    const cls = String(r.class).trim().toUpperCase();
    const obj = {
      result_id: clashGenerateId_('cocres'),
      round: round,
      driver_id: r.driver_id || '',
      display_name: r.display_name || '',
      class: cls,
      finish_position_class: r.finish_position_class != null ? Number(r.finish_position_class) : '',
      finish_position_overall: r.finish_position_overall != null ? Number(r.finish_position_overall) : '',
      pole_class: r.pole_class === true ? 'TRUE' : 'FALSE',
      fastest_lap_class: r.fastest_lap_class === true ? 'TRUE' : 'FALSE',
      finisher: r.finisher === true ? 'TRUE' : 'FALSE',
      dnf: r.dnf === true ? 'TRUE' : 'FALSE',
      entered_by: enteredBy,
      entered_at: now,
    };
    return headers.map(h => (obj[h] !== undefined ? obj[h] : ''));
  });

  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);

  return ok({ round: round, inserted: rows.length });
}

// ═══════════════════════════════════════════════════════════
// CLASSIFICHE — calcolo cap. 7 e cap. 8 del regolamento
// ═══════════════════════════════════════════════════════════

/**
 * clash.standings — le 4 classifiche pubbliche.
 * Auth: nessuna richiesta.
 *
 * @returns {Object} { ok, data: { gte, gt3, overall, trophy } }
 */
function handleClashStandings(payload, ctx) {
  const results = sheetToObjects(SHEETS.CLASH_RESULTS);

  const classAgg = { GTE: {}, GT3: {} };   // driverKey -> accumulator
  const overallAgg = {};                    // driverKey -> accumulator
  const roundTotals = {};                   // round -> { GTE: pts, GT3: pts }
  const classWins = { GTE: 0, GT3: 0 };
  const classPoles = { GTE: 0, GT3: 0 };

  results.forEach(r => {
    const cls = String(r.class || '').trim().toUpperCase();
    if (CLASH_VALID_CLASSES.indexOf(cls) === -1) return;

    const driverId = r.driver_id || '';
    const displayName = r.display_name || '';
    const driverKey = driverId || displayName.toLowerCase().trim();
    if (!driverKey) return;

    const posClass = Number(r.finish_position_class) || null;
    const posOverall = Number(r.finish_position_overall) || null;
    const isPole = clashIsTrue_(r.pole_class);
    const isFastestLap = clashIsTrue_(r.fastest_lap_class) && posClass != null && posClass <= 10;
    const isFinisher = clashIsTrue_(r.finisher);

    const classPts = clashPositionPoints_(posClass)
      + (isPole ? 1 : 0)
      + (isFastestLap ? 1 : 0)
      + (isFinisher ? 1 : 0);
    const overallPts = clashPositionPoints_(posOverall);

    // ── Classifica di classe (GTE o GT3) ──
    const bucket = classAgg[cls];
    if (!bucket[driverKey]) {
      bucket[driverKey] = {
        driver_id: driverId, display_name: displayName, class: cls,
        total_points: 0, races_count: 0, wins: 0, podiums: 0, best_finish: null, poles: 0,
      };
    }
    const ce = bucket[driverKey];
    ce.total_points += classPts;
    ce.races_count += 1;
    if (posClass === 1) ce.wins += 1;
    if (posClass != null && posClass <= 3) ce.podiums += 1;
    if (posClass != null && (ce.best_finish === null || posClass < ce.best_finish)) ce.best_finish = posClass;
    if (isPole) ce.poles += 1;

    // ── Classifica Assoluta ──
    if (!overallAgg[driverKey]) {
      overallAgg[driverKey] = {
        driver_id: driverId, display_name: displayName, class: cls,
        total_points: 0, races_count: 0, wins: 0, podiums: 0, best_finish: null,
      };
    }
    const oe = overallAgg[driverKey];
    oe.total_points += overallPts;
    oe.races_count += 1;
    if (posOverall === 1) oe.wins += 1;
    if (posOverall != null && posOverall <= 3) oe.podiums += 1;
    if (posOverall != null && (oe.best_finish === null || posOverall < oe.best_finish)) oe.best_finish = posOverall;

    // ── Trofeo delle Classi (cap. 8): TUTTI i punti di classe, per round ──
    const round = Number(r.round);
    if (!roundTotals[round]) roundTotals[round] = { GTE: 0, GT3: 0 };
    roundTotals[round][cls] += classPts;
    if (posClass === 1) classWins[cls] += 1;
    if (isPole) classPoles[cls] += 1;
  });

  const sortStandings = list => list.sort((a, b) => {
    if (b.total_points !== a.total_points) return b.total_points - a.total_points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.podiums !== a.podiums) return b.podiums - a.podiums;
    const aBest = a.best_finish == null ? 999 : a.best_finish;
    const bBest = b.best_finish == null ? 999 : b.best_finish;
    return aBest - bBest;
  }).map((r, i) => Object.assign({ position: i + 1 }, r));

  const gte = sortStandings(Object.values(classAgg.GTE));
  const gt3 = sortStandings(Object.values(classAgg.GT3));
  const overall = sortStandings(Object.values(overallAgg));

  const byRound = CLASH_VALID_ROUNDS
    .filter(rd => roundTotals[rd])
    .map(rd => ({ round: rd, GTE: roundTotals[rd].GTE, GT3: roundTotals[rd].GT3 }));

  const gteTotal = byRound.reduce((s, r) => s + r.GTE, 0);
  const gt3Total = byRound.reduce((s, r) => s + r.GT3, 0);

  let leadingClass = null;
  if (gteTotal !== gt3Total) {
    leadingClass = gteTotal > gt3Total ? 'GTE' : 'GT3';
  } else if (gteTotal > 0 || gt3Total > 0) {
    // Parità punti (cap. 8.2): prevale più vittorie di classe, poi più pole.
    if (classWins.GTE !== classWins.GT3) {
      leadingClass = classWins.GTE > classWins.GT3 ? 'GTE' : 'GT3';
    } else if (classPoles.GTE !== classPoles.GT3) {
      leadingClass = classPoles.GTE > classPoles.GT3 ? 'GTE' : 'GT3';
    }
    // altrimenti resta null: parità totale, nessun vincitore ancora determinabile
  }

  const trophy = {
    gte_total: gteTotal,
    gt3_total: gt3Total,
    by_round: byRound,
    class_wins: classWins,
    class_poles: classPoles,
    leading_class: leadingClass,
    decided: byRound.length >= CLASH_VALID_ROUNDS.length, // ufficiale solo a Spa (round 3) completato
  };

  return ok({ gte, gt3, overall, trophy });
}

// ═══════════════════════════════════════════════════════════
// SEGNALAZIONE INCIDENTI (cap. 9 del regolamento)
// ═══════════════════════════════════════════════════════════

/**
 * clash.incidents.report — form di segnalazione.
 * Auth: nessuna richiesta (community-wide, come le iscrizioni).
 * Le sanzioni restano a discrezione della Direzione Generale VSD,
 * comunicate su Discord — questo endpoint raccoglie solo la
 * segnalazione grezza per lo staff (nessun workflow di decisione qui).
 *
 * @param {Object} payload - { round, reporting_name, reported_name, description, replay_url? }
 */
function handleClashIncidentsReport(payload, ctx) {
  payload = payload || {};

  const round = Number(payload.round);
  if (CLASH_VALID_ROUNDS.indexOf(round) === -1) {
    return fail('round non valido. Ammessi: ' + CLASH_VALID_ROUNDS.join(', '));
  }
  const reportingName = String(payload.reporting_name || '').trim();
  const reportedName = String(payload.reported_name || '').trim();
  const description = String(payload.description || '').trim();

  if (!reportingName) return fail('Nome del segnalante mancante');
  if (!reportedName) return fail('Nome del pilota segnalato mancante');
  if (!description) return fail('Descrizione mancante');
  if (description.length > 2000) return fail('Descrizione troppo lunga (max 2000 caratteri)');

  const replayUrl = String(payload.replay_url || '').trim();
  const reportId = clashGenerateId_('cocinc');
  const now = new Date().toISOString();

  const sheet = getSheet(SHEETS.CLASH_INCIDENT_REPORTS);
  sheet.appendRow([reportId, round, reportingName, reportedName, description, replayUrl, now, 'pending']);

  return ok({ report_id: reportId, submitted_at: now, status: 'pending' });
}

/**
 * clash.incidents.list — elenco segnalazioni per lo staff.
 * Auth: staff richiesto (contengono dati potenzialmente sensibili/dispute).
 */
function handleClashIncidentsList(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');
  if (!ctx.isStaff) return fail('Operazione riservata a staff e admin');

  const reports = sheetToObjects(SHEETS.CLASH_INCIDENT_REPORTS)
    .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));

  return ok({ reports: reports, count: reports.length });
}
