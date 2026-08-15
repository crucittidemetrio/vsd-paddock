// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Consenso pubblicazione dati personali
// ═══════════════════════════════════════════════════════════
// Un tab nuovo (Consents) per registrare l'accettazione elettronica dei
// piloti alla pubblicazione dei propri dati su sito pubblico e social.
//
// NOTE IMPORTANTI (non aggirabili da qui, servono a chi implementa/usa):
// - Questo NON è un parere legale. Il testo mostrato ai piloti
//   (ConsentForm.jsx sul frontend) andrebbe fatto rivedere da chi si
//   occupa di privacy/GDPR prima di considerarlo definitivo.
// - "Dati di contatto interni" (email, Discord ID) sono trattati come
//   INFORMATIVA, non consenso: sono necessari per la partecipazione
//   all'attività del team (base giuridica: legittimo interesse/
//   esecuzione dell'attività associativa), quindi qui non c'è un
//   checkbox per quello — solo i due consensi veri (sito pubblico,
//   social) sono opt-in.
// - Per i minorenni: il form raccoglie una DICHIARAZIONE del genitore/
//   tutore inserita da chi è loggato con l'account del pilota. Non è
//   una firma verificata — è un checkbox + nome + email genitore. Se
//   serve un consenso genitoriale realmente verificato (raccomandato
//   se ci sono minorenni in squadra), va gestito fuori da questo flusso
//   (form cartaceo firmato, o email di conferma inviata all'indirizzo
//   del genitore con link dedicato — non implementato qui).
//
// Esecuzione one-time: editor Apps Script → dropdown funzioni →
//             setupConsentTab → ▶ Esegui.

const CONSENT_HEADERS = [
  'consent_id', 'driver_id', 'consent_version',
  'site_consent', 'social_consent',
  'birth_date', 'is_minor',
  'parent_name', 'parent_email', 'parent_declared',
  'accepted_at', 'updated_at',
];

// Versione corrente del documento di consenso. Se il testo mostrato ai
// piloti cambia in modo sostanziale, incrementa questa stringa: i
// piloti che avevano accettato una versione precedente torneranno ad
// essere "non conformi" finché non riaccettano la nuova.
const CONSENT_VERSION = 'v1-2026-08-08';

function setupConsentTab() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEETS.CONSENTS);

  if (sheet) {
    const lastCol = sheet.getLastColumn();
    const currentHeaders = lastCol > 0
      ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || ''))
      : [];
    const missing = CONSENT_HEADERS.filter(h => currentHeaders.indexOf(h) === -1);
    if (missing.length === 0) {
      Logger.log('⚠  Tab "Consents" già esistente e aggiornato — skip');
      return;
    }
    const startCol = currentHeaders.length + 1;
    sheet.getRange(1, startCol, 1, missing.length).setValues([missing]);
    Logger.log(`✓  Tab "Consents" aggiornato: colonne aggiunte [${missing.join(', ')}]`);
    return;
  }

  sheet = ss.insertSheet(SHEETS.CONSENTS);
  sheet.getRange(1, 1, 1, CONSENT_HEADERS.length).setValues([CONSENT_HEADERS]);
  const headerRange = sheet.getRange(1, 1, 1, CONSENT_HEADERS.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#1f2a44');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontSize(10);
  sheet.setFrozenRows(1);
  for (let i = 1; i <= CONSENT_HEADERS.length; i++) sheet.autoResizeColumn(i);
  Logger.log('✓  Tab "Consents" creato con ' + CONSENT_HEADERS.length + ' colonne');
}

function consentNextId_(sheet) {
  const data = sheet.getDataRange().getValues();
  let max = 0;
  for (let i = 1; i < data.length; i++) {
    const m = String(data[i][0] || '').match(/CONS(\d+)/i);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return 'CONS' + String(max + 1).padStart(4, '0');
}

/**
 * consent.status — Stato del consenso del pilota loggato per la
 * versione corrente del documento.
 */
function handleConsentStatus(payload, ctx) {
  if (!ctx || !ctx.driver_id) return fail('Login richiesto');

  const rows = sheetToObjects(SHEETS.CONSENTS);
  const mine = rows.filter(r => r.driver_id === ctx.driver_id);
  const current = mine.find(r => r.consent_version === CONSENT_VERSION) || null;

  return ok({
    required_version: CONSENT_VERSION,
    has_current: !!current,
    record: current,
  });
}

/**
 * consent.accept — Registra/aggiorna l'accettazione per la versione
 * corrente. Upsert su (driver_id, consent_version): un pilota può
 * tornare a modificare le proprie scelte (es. revocare il consenso
 * social) risottomettendo il form, senza accumulare righe duplicate.
 * @param {Object} payload - {
 *   site_consent: bool, social_consent: bool, birth_date: 'YYYY-MM-DD',
 *   parent_name?: string, parent_email?: string, parent_declared?: bool
 * }
 */
function handleConsentAccept(payload, ctx) {
  if (!ctx || !ctx.driver_id) return fail('Login richiesto');
  if (!payload || !payload.birth_date) return fail('Data di nascita obbligatoria');

  const birthDate = new Date(payload.birth_date);
  if (isNaN(birthDate.getTime())) return fail('Data di nascita non valida');

  const isMinor = computeIsMinor_(birthDate);

  if (isMinor) {
    const parentOk = payload.parent_declared
      && String(payload.parent_name || '').trim()
      && String(payload.parent_email || '').trim();
    if (!parentOk) {
      return fail('Per i minorenni servono nome, email del genitore/tutore e la sua dichiarazione di consenso');
    }
  }

  const sheet = getSheet(SHEETS.CONSENTS);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const data = sheet.getDataRange().getValues();

  const driverIdCol = headers.indexOf('driver_id');
  const versionCol = headers.indexOf('consent_version');
  let existingRowIdx = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][driverIdCol] === ctx.driver_id && data[i][versionCol] === CONSENT_VERSION) {
      existingRowIdx = i;
      break;
    }
  }

  const now = new Date().toISOString();
  const record = {
    consent_id: existingRowIdx > -1 ? data[existingRowIdx][headers.indexOf('consent_id')] : consentNextId_(sheet),
    driver_id: ctx.driver_id,
    consent_version: CONSENT_VERSION,
    site_consent: !!payload.site_consent,
    social_consent: !!payload.social_consent,
    birth_date: payload.birth_date,
    is_minor: isMinor,
    parent_name: isMinor ? String(payload.parent_name || '').trim() : '',
    parent_email: isMinor ? String(payload.parent_email || '').trim() : '',
    parent_declared: isMinor ? true : '',
    accepted_at: existingRowIdx > -1 ? data[existingRowIdx][headers.indexOf('accepted_at')] : now,
    updated_at: now,
  };

  const row = headers.map(h => (record[h] !== undefined ? record[h] : ''));
  if (existingRowIdx > -1) {
    sheet.getRange(existingRowIdx + 1, 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }

  // birth_date come testo puro, stessa cautela già usata per
  // scheduled_date in SocialManager.js — evita la conversione
  // automatica in oggetto Data di Sheets che sfasa il giorno.
  const targetRowNum = existingRowIdx > -1 ? existingRowIdx + 1 : sheet.getLastRow();
  const birthDateCol = headers.indexOf('birth_date') + 1;
  const cell = sheet.getRange(targetRowNum, birthDateCol);
  cell.setNumberFormat('@');
  cell.setValue(record.birth_date);

  return ok({ record });
}

function computeIsMinor_(birthDate) {
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const m = now.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birthDate.getDate())) age--;
  return age < 18;
}

/**
 * consent.adminList — Solo admin: stato di tutti i piloti rispetto
 * alla versione corrente, per la pagina /admin/consents.
 */
function handleConsentAdminList(payload, ctx) {
  if (!ctx || !ctx.isAdmin) return fail('Accesso riservato ad admin/team principal');

  const drivers = sheetToObjects(SHEETS.DRIVERS)
    .filter(d => d.status === 'active' || d.status === 'trial');
  const consents = sheetToObjects(SHEETS.CONSENTS)
    .filter(c => c.consent_version === CONSENT_VERSION);
  const byDriver = {};
  consents.forEach(c => { byDriver[c.driver_id] = c; });

  const list = drivers.map(d => ({
    driver_id: d.driver_id,
    display_name: d.display_name,
    status: d.status,
    consent: byDriver[d.driver_id] || null,
  }));

  return ok({ required_version: CONSENT_VERSION, drivers: list });
}

/**
 * consent.socialFlags — SOLO il booleano social_consent per driver_id.
 * Deliberatamente pubblica, NESSUN auth richiesto (a differenza di
 * consent.adminList, che ha nomi/date/dati minorenni): il Roster è
 * visibile anche a visitatori anonimi non loggati, ed è esattamente
 * lì che serve sapere se mostrare la foto vera di un pilota — quindi
 * il flag deve essere leggibile pure da loro. Non è un problema di
 * privacy: dice solo "questa persona ha acconsentito alla pubblicazione
 * social", lo stesso fatto già implicito dal vedere o non vedere la
 * sua foto pubblicata.
 */
function handleConsentSocialFlags(payload, ctx) {
  const consents = sheetToObjects(SHEETS.CONSENTS)
    .filter(c => c.consent_version === CONSENT_VERSION);

  const flags = {};
  consents.forEach(c => { flags[c.driver_id] = !!c.social_consent; });

  return ok({ required_version: CONSENT_VERSION, flags });
}
