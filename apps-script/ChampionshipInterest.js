// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Manifestazione di interesse: campionati esterni
// ═══════════════════════════════════════════════════════════
// Dominio generico per campionati che VSD NON organizza (ACI LMGT3
// Challenge, ERA Season 3, futuri) — l'iscrizione UFFICIALE resta
// sempre esterna (portale Apex per ACI, Google Form per ERA): qui
// raccogliamo solo un segnale interno, "chi del team ci sta
// provando/partecipando", utile allo staff per seguire l'andamento
// fin dal primo momento, SENZA sostituirsi al canale ufficiale.
//
// Diverso da ClashOfClasses.js (evento organizzato DA VSD, con griglia
// reale, classifiche e sanzioni proprie): qui non c'è cap massimo né
// classifica — è un semplice elenco "manifestazioni di interesse" per
// championship_key.
//
// Sheet usato (vedi SetupChampionshipInterest.js per la creazione):
//   ChampionshipInterest:
//     interest_id | championship_key | driver_id | display_name |
//     category | vehicle | discord_handle | note | registered_at |
//     status
//
// Action registrate in Codice.js:
//   'interest.list'      handleInterestList
//   'interest.register'  handleInterestRegister
//   'interest.update'    handleInterestUpdate   (self-service, richiede login)
//   'interest.remove'    handleInterestRemove    (staff)
//
// Nota migrazione: handleInterestRegister/handleInterestUpdate
// costruiscono la riga leggendo dinamicamente gli header della sheet
// (non un array posizionale fisso), così restano compatibili sia col
// vecchio schema (senza "category") sia col nuovo, indipendentemente
// da quando viene eseguita la migrazione — vedi
// migrateChampionshipInterestAddCategory() in SetupChampionshipInterest.js.
// ═══════════════════════════════════════════════════════════

function interestGenerateId_() {
  return 'int_' + Utilities.getUuid().replace(/-/g, '').substring(0, 10);
}

/**
 * interest.list — elenco di chi ha segnalato interesse per un
 * campionato esterno. Auth: nessuna richiesta (visibilità pubblica,
 * stessa scelta di trasparenza di clash.participants.list).
 * Campi privati (discord_handle, driver_id, note, registered_at)
 * esposti solo a staff.
 *
 * @param {Object} payload - { championship_key }
 */
function handleInterestList(payload, ctx) {
  payload = payload || {};
  const key = String(payload.championship_key || '').trim();
  if (!key) return fail('championship_key obbligatorio');

  const all = sheetToObjects(SHEETS.CHAMPIONSHIP_INTEREST)
    .filter(p => String(p.championship_key || '').trim() === key)
    .filter(p => String(p.status || '').trim() !== 'withdrawn');

  const isStaff = !!(ctx && ctx.isStaff);

  const data = all.map(p => {
    const base = {
      interest_id: p.interest_id,
      display_name: p.display_name,
      category: p.category || '',
      vehicle: p.vehicle || '',
    };
    if (isStaff) {
      base.driver_id = p.driver_id || '';
      base.discord_handle = p.discord_handle || '';
      base.note = p.note || '';
      base.registered_at = p.registered_at;
      base.status = p.status;
    }
    return base;
  });

  return ok({ interests: data, count: all.length });
}

/**
 * interest.register — segnala interesse/partecipazione a un
 * campionato esterno. Auth: opzionale, stesso schema di
 * clash.participants.register (se loggato, si lega al driver_id per
 * evitare impersonificazione; altrimenti solo display_name).
 * Nessun cap: non è una griglia gestita da VSD.
 *
 * @param {Object} payload - { championship_key, display_name,
 *   category?, vehicle?, discord_handle?, note? }
 */
function handleInterestRegister(payload, ctx) {
  payload = payload || {};

  const key = String(payload.championship_key || '').trim();
  if (!key) return fail('championship_key obbligatorio');

  const driverId = (ctx && ctx.driver_id) || null;
  let displayName = String(payload.display_name || '').trim();

  if (!displayName && driverId) {
    const drivers = getCachedSheetData_(SHEETS.DRIVERS, 600);
    const driver = drivers.find(d => d.driver_id === driverId);
    if (driver) displayName = driver.display_name || '';
  }
  if (!displayName) return fail('Nome pilota mancante');

  const category = String(payload.category || '').trim();
  const vehicle = String(payload.vehicle || '').trim();
  const discordHandle = String(payload.discord_handle || '').trim();
  const note = String(payload.note || '').trim().slice(0, 300);

  const existing = sheetToObjects(SHEETS.CHAMPIONSHIP_INTEREST)
    .filter(p => String(p.championship_key || '').trim() === key)
    .filter(p => String(p.status || '').trim() !== 'withdrawn');

  const nameKey = displayName.toLowerCase();
  const dup = existing.find(p =>
    (driverId && p.driver_id === driverId) ||
    (String(p.display_name || '').trim().toLowerCase() === nameKey)
  );
  if (dup) return fail('Ti sei già segnalato per questo campionato');

  const interestId = interestGenerateId_();
  const now = new Date().toISOString();
  const sheet = getSheet(SHEETS.CHAMPIONSHIP_INTEREST);

  // Riga costruita dinamicamente sugli header effettivi della sheet (non
  // un array posizionale fisso): resta corretta sia che la migrazione
  // della colonna "category" sia già stata eseguita sia che non lo sia
  // ancora — vedi nota in testa al file.
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const record = {
    interest_id: interestId,
    championship_key: key,
    driver_id: driverId || '',
    display_name: displayName,
    category: category,
    vehicle: vehicle,
    discord_handle: discordHandle,
    note: note,
    registered_at: now,
    status: 'registered',
  };
  sheet.appendRow(headers.map(h => (record[h] !== undefined ? record[h] : '')));

  return ok({
    interest_id: interestId,
    driver_id: driverId || '',
    display_name: displayName,
    category: category,
    vehicle: vehicle,
    registered_at: now,
    status: 'registered',
  });
}

/**
 * interest.update — aggiorna la propria segnalazione già esistente
 * (tipicamente per aggiungere/correggere categoria e modello vettura
 * "in seguito", dopo essersi già segnalati la prima volta). Auth:
 * richiede login VSD (ctx.driver_id) — l'aggiornamento è consentito
 * solo sulla riga associata al proprio driver_id. Chi si è segnalato
 * da anonimo (senza login) non può usare questa action: il frontend
 * la propone solo ai piloti VSD loggati.
 *
 * @param {Object} payload - { championship_key, category?, vehicle?,
 *   discord_handle?, note? } — vengono aggiornati solo i campi presenti
 */
function handleInterestUpdate(payload, ctx) {
  const driverId = (ctx && ctx.driver_id) || null;
  if (!driverId) return fail('Serve essere loggati per modificare la propria segnalazione');

  payload = payload || {};
  const key = String(payload.championship_key || '').trim();
  if (!key) return fail('championship_key obbligatorio');

  const sheet = getSheet(SHEETS.CHAMPIONSHIP_INTEREST);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return fail('Nessuna segnalazione trovata da aggiornare');

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const col = {};
  headers.forEach((h, i) => { col[h] = i; });
  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    if (String(row[col.championship_key] || '').trim() !== key) continue;
    if (row[col.driver_id] !== driverId) continue;
    if (String(row[col.status] || '').trim() === 'withdrawn') continue;

    const sheetRow = i + 2;
    if (payload.category !== undefined && col.category !== undefined) {
      sheet.getRange(sheetRow, col.category + 1).setValue(String(payload.category || '').trim());
    }
    if (payload.vehicle !== undefined && col.vehicle !== undefined) {
      sheet.getRange(sheetRow, col.vehicle + 1).setValue(String(payload.vehicle || '').trim());
    }
    if (payload.discord_handle !== undefined && col.discord_handle !== undefined) {
      sheet.getRange(sheetRow, col.discord_handle + 1).setValue(String(payload.discord_handle || '').trim());
    }
    if (payload.note !== undefined && col.note !== undefined) {
      sheet.getRange(sheetRow, col.note + 1).setValue(String(payload.note || '').trim().slice(0, 300));
    }

    return ok({
      interest_id: row[col.interest_id],
      category: payload.category !== undefined ? String(payload.category || '').trim() : (col.category !== undefined ? row[col.category] : ''),
      vehicle: payload.vehicle !== undefined ? String(payload.vehicle || '').trim() : (row[col.vehicle] || ''),
    });
  }

  return fail('Nessuna segnalazione trovata da aggiornare — registrati prima');
}

/**
 * interest.remove — rimuove una segnalazione (soft-delete, status →
 * 'withdrawn'). Auth: staff richiesto.
 *
 * @param {Object} payload - { interest_id }
 */
function handleInterestRemove(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');
  if (!ctx.isStaff) return fail('Operazione riservata a staff e admin');

  payload = payload || {};
  const interestId = String(payload.interest_id || '').trim();
  if (!interestId) return fail('interest_id obbligatorio');

  const sheet = getSheet(SHEETS.CHAMPIONSHIP_INTEREST);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return fail('Segnalazione non trovata: ' + interestId);

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const idCol = headers.indexOf('interest_id');
  const statusCol = headers.indexOf('status');
  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();

  for (let i = 0; i < values.length; i++) {
    if (values[i][idCol] === interestId) {
      sheet.getRange(i + 2, statusCol + 1).setValue('withdrawn');
      return ok({ interest_id: interestId, status: 'withdrawn' });
    }
  }
  return fail('Segnalazione non trovata: ' + interestId);
}
