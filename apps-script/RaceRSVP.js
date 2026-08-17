// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Conferma presenza gara (RSVP)
// ═══════════════════════════════════════════════════════════
// Prima di una gara (specie endurance) i piloti confermano se ci sono,
// alimentando lo Stint Planner e dando allo staff un quadro di chi
// manca senza doverlo scoprire all'ultimo momento su Discord.
//
// Setup: setupRaceRSVPsTab() — editor Apps Script → ▶ Esegui (una
// tantum, idempotente).
//
// Registrate in Codice.js dispatcher come:
//   'rsvp.list': handleRsvpList
//   'rsvp.set':  handleRsvpSet
// ═══════════════════════════════════════════════════════════

const RSVP_HEADERS = ['rsvp_id', 'race_id', 'driver_id', 'status', 'note', 'responded_at'];
const RSVP_STATUSES = ['confirmed', 'declined', 'tentative'];

function setupRaceRSVPsTab() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEETS.RACE_RSVPS);
  if (sheet) {
    Logger.log('✓ Tab "' + SHEETS.RACE_RSVPS + '" già esistente, nessuna modifica.');
    return;
  }
  sheet = ss.insertSheet(SHEETS.RACE_RSVPS);
  sheet.getRange(1, 1, 1, RSVP_HEADERS.length).setValues([RSVP_HEADERS]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, RSVP_HEADERS.length).setFontWeight('bold');
  Logger.log('✅ Tab "' + SHEETS.RACE_RSVPS + '" creata con ' + RSVP_HEADERS.length + ' colonne.');
}

/**
 * rsvp.list — Tutte le risposte per una gara (visibili a chiunque sia
 * loggato: serve al team, non solo allo staff, per sapere chi ci sarà).
 * Auth: richiesta.
 * @param {Object} payload - { race_id }
 */
function handleRsvpList(payload, ctx) {
  if (!ctx || !ctx.driver_id) return fail('Auth richiesto');

  payload = payload || {};
  const raceId = String(payload.race_id || '').trim();
  if (!raceId) return fail('race_id obbligatorio');

  const rows = sheetToObjects(SHEETS.RACE_RSVPS).filter(r => r.race_id === raceId);
  return ok({ rsvps: rows, count: rows.length });
}

/**
 * rsvp.set — Il pilota loggato imposta/aggiorna la PROPRIA risposta per
 * una gara. Upsert per (race_id, driver_id) — non è possibile impostare
 * la risposta di qualcun altro.
 * Auth: richiesta.
 * @param {Object} payload - { race_id, status: 'confirmed'|'declined'|'tentative', note? }
 */
function handleRsvpSet(payload, ctx) {
  if (!ctx || !ctx.driver_id) return fail('Auth richiesto');

  payload = payload || {};
  const raceId = String(payload.race_id || '').trim();
  const status = String(payload.status || '').trim();
  if (!raceId) return fail('race_id obbligatorio');
  if (RSVP_STATUSES.indexOf(status) === -1) {
    return fail('status non valido — atteso uno tra: ' + RSVP_STATUSES.join(', '));
  }

  const sheet = getSheet(SHEETS.RACE_RSVPS);
  if (!sheet) return fail('Tab RaceRSVPs non trovata — esegui setupRaceRSVPsTab() una volta');

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const raceIdx = headers.indexOf('race_id');
  const driverIdx = headers.indexOf('driver_id');

  const now = new Date().toISOString();
  const note = String(payload.note || '');

  for (let i = 1; i < data.length; i++) {
    if (data[i][raceIdx] === raceId && data[i][driverIdx] === ctx.driver_id) {
      const rowObj = {};
      headers.forEach((h, j) => { rowObj[h] = data[i][j]; });
      rowObj.status = status;
      rowObj.note = note;
      rowObj.responded_at = now;
      const newRow = headers.map(h => (rowObj[h] !== undefined ? rowObj[h] : ''));
      sheet.getRange(i + 1, 1, 1, newRow.length).setValues([newRow]);
      return ok(rowObj);
    }
  }

  const rsvpId = 'rsvp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const row = {
    rsvp_id: rsvpId, race_id: raceId, driver_id: ctx.driver_id,
    status, note, responded_at: now,
  };
  sheet.appendRow(RSVP_HEADERS.map(h => row[h]));
  return ok(row);
}

// ═══════════════════════════════════════════════════════════
// REMINDER RSVP — piloti attivi che non hanno ancora risposto
// ═══════════════════════════════════════════════════════════
// Trigger time-driven da configurare a mano (editor Apps Script →
// icona orologio → Aggiungi trigger → runRsvpReminderCheck → time-driven
// → "day timer", una volta al giorno, fascia oraria a scelta — es.
// 18:00-19:00, quando è più probabile che i piloti vedano la notifica).
//
// Finestra: gare scheduled tra 1 e 3 giorni da adesso. Notifica SOLO i
// piloti attivi senza ancora una riga in RaceRSVPs per quella gara —
// mai un broadcast a tutti (a differenza del reminder "gara tra
// un'ora"), per non disturbare chi ha già risposto.
//
// Dedup: PropertiesService, non CacheService — la finestra di più
// giorni supera il tetto di 6h di CacheService (vedi Push.js). Le
// chiavi restano in Script Properties anche dopo che la gara è
// passata (nessuna pulizia automatica): rumore di fondo trascurabile,
// non un problema pratico alla scala di un team VSD, ma da tenere a
// mente se in futuro Script Properties dovesse avvicinarsi al limite
// di quota di Apps Script.
function checkAndNotifyRsvpReminders_() {
  try {
    const now = new Date();
    const windowStart = new Date(now.getTime() + 1 * 24 * 60 * 60000);
    const windowEnd = new Date(now.getTime() + 3 * 24 * 60 * 60000);

    const races = getCachedSheetData_(SHEETS.RACES, 21600);
    const upcoming = races.filter(r => {
      if (String(r.status).toLowerCase() !== 'scheduled') return false;
      const d = parseRaceDate(r.date);
      return d && d >= windowStart && d <= windowEnd;
    });
    if (upcoming.length === 0) return;

    const drivers = getCachedSheetData_(SHEETS.DRIVERS, 600);
    const activeDrivers = drivers.filter(d => d.status === 'active' && !d.removed_at);
    if (activeDrivers.length === 0) return;

    const allRsvps = sheetToObjects(SHEETS.RACE_RSVPS);
    const props = PropertiesService.getScriptProperties();

    upcoming.forEach(race => {
      const respondedIds = new Set(
        allRsvps.filter(r => r.race_id === race.race_id).map(r => r.driver_id)
      );

      const missing = activeDrivers.filter(d => !respondedIds.has(d.driver_id));
      if (missing.length === 0) return;

      const toNotify = missing.filter(d => {
        const key = 'rsvp_reminder_' + race.race_id + '_' + d.driver_id;
        return !props.getProperty(key);
      });
      if (toNotify.length === 0) return;

      sendPushNotification_(toNotify.map(d => d.driver_id), {
        title: '🏁 Conferma presenza: ' + (race.race_name || race.race_id),
        body: 'Non hai ancora risposto — facci sapere se ci sarai.',
        url: PADDOCK_URL + '/race/' + race.race_id,
      });

      toNotify.forEach(d => {
        props.setProperty('rsvp_reminder_' + race.race_id + '_' + d.driver_id, '1');
      });
    });
  } catch (e) {
    Logger.log('⚠️  checkAndNotifyRsvpReminders_ error (non-blocking): ' + e.message);
  }
}

/**
 * Wrapper pubblico (senza underscore) — il menu Trigger di Apps Script
 * nasconde le funzioni con underscore finale. Stesso pattern già usato
 * per runUpcomingRacePushCheck() in Push.js.
 */
function runRsvpReminderCheck() {
  checkAndNotifyRsvpReminders_();
}
