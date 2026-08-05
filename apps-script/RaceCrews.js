// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Race Crews Endpoints
// ═══════════════════════════════════════════════════════════
// Roster equipaggi: chi guida quale vettura su una gara con più
// equipaggi VSD sullo stesso race_id (es. 8h di Daytona). Va compilato
// PRIMA di pianificare gli stint — AdminRaceStints.jsx e StintPlanner.jsx
// lo leggono per sapere quali car_number esistono su una gara e per
// filtrare i piloti selezionabili per vettura.
//
// Un pilota può stare su UNA sola vettura per gara (stesso evento reale,
// non ha senso guidare due auto contemporaneamente): l'add rifiuta un
// secondo assignment dello stesso driver_id sullo stesso race_id.
//
// Registrate in Codice.js dispatcher come:
//   'raceCrews.list':   handleRaceCrewsList
//   'raceCrews.add':    handleRaceCrewsAdd
//   'raceCrews.remove': handleRaceCrewsRemove
// ═══════════════════════════════════════════════════════════

/**
 * raceCrews.list — Roster equipaggi di una gara.
 * Auth: richiesta (qualsiasi utente loggato, stesso livello di stints.list).
 *
 * @param {Object} payload - { race_id }
 * @param {Object} ctx - Auth context (richiesto)
 * @returns {Object} ok({ crews: [...], count })
 */
function handleRaceCrewsList(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');

  const raceId = payload && payload.race_id;
  if (!raceId) return fail('race_id obbligatorio');

  const all = sheetToObjects(SHEETS.RACE_CREWS);
  const crews = all
    .filter(c => c.race_id === raceId)
    .sort((a, b) => {
      const ca = String(a.car_number || '');
      const cb = String(b.car_number || '');
      if (ca !== cb) return ca.localeCompare(cb, undefined, { numeric: true });
      return String(a.added_at || '').localeCompare(String(b.added_at || ''));
    });

  return ok({ crews, count: crews.length });
}

/**
 * raceCrews.add — Assegna un pilota a una vettura per una gara.
 * Auth: staff/admin (stesso livello di stints.add).
 *
 * @param {Object} payload - { race_id, car_number, driver_id, notes? }
 * @param {Object} ctx - Auth context (richiesto, staff)
 * @returns {Object} ok({ crew }) oppure fail
 */
function handleRaceCrewsAdd(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');
  if (!ctx.isStaff) return fail('Permessi insufficienti');

  payload = payload || {};
  const raceId = String(payload.race_id || '').trim();
  const carNumber = String(payload.car_number || '').trim();
  const driverId = String(payload.driver_id || '').trim();

  if (!raceId) return fail('race_id obbligatorio');
  if (!carNumber) return fail('car_number obbligatorio (numero di gara della vettura, es. "7")');
  if (!driverId) return fail('driver_id obbligatorio');

  const existing = sheetToObjects(SHEETS.RACE_CREWS).filter(c => c.race_id === raceId);

  const alreadyOnThisCar = existing.find(c => c.car_number === carNumber && c.driver_id === driverId);
  if (alreadyOnThisCar) return fail('Pilota già assegnato a questa vettura');

  const onAnotherCar = existing.find(c => c.driver_id === driverId && c.car_number !== carNumber);
  if (onAnotherCar) {
    return fail(`Pilota già assegnato alla vettura #${onAnotherCar.car_number} su questa gara — un pilota guida una sola vettura per evento`);
  }

  const sheet = getSheet(SHEETS.RACE_CREWS);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  let maxNum = 0;
  for (let i = 1; i < data.length; i++) {
    const id = data[i][0];
    const m = String(id || '').match(/CREW(\d+)/i);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
  }
  const crewId = 'CREW' + String(maxNum + 1).padStart(3, '0');
  const now = new Date().toISOString();

  const newCrew = {
    crew_id: crewId,
    race_id: raceId,
    car_number: carNumber,
    driver_id: driverId,
    notes: payload.notes || '',
    added_at: now,
    added_by: ctx.driver_id || '',
  };

  const row = headers.map(h => (newCrew[h] !== undefined ? newCrew[h] : ''));
  sheet.appendRow(row);
  invalidateSheetCache_(SHEETS.RACE_CREWS);

  return ok({ crew: newCrew });
}

/**
 * raceCrews.remove — Rimuove un pilota da un equipaggio.
 * Auth: staff/admin.
 *
 * @param {Object} payload - { crew_id }
 * @param {Object} ctx - Auth context (richiesto, staff)
 * @returns {Object} ok({ crew_id, deleted }) oppure fail
 */
function handleRaceCrewsRemove(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');
  if (!ctx.isStaff) return fail('Permessi insufficienti');

  const crewId = payload && payload.crew_id;
  if (!crewId) return fail('crew_id obbligatorio');

  const sheet = getSheet(SHEETS.RACE_CREWS);
  const data = sheet.getDataRange().getValues();
  const rowIndex = data.findIndex(row => row[0] === crewId);
  if (rowIndex === -1) return fail('Assegnazione non trovata: ' + crewId);

  sheet.deleteRow(rowIndex + 1);
  invalidateSheetCache_(SHEETS.RACE_CREWS);

  return ok({ crew_id: crewId, deleted: true });
}
