// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Sponsors (CRM sponsor)
// ═══════════════════════════════════════════════════════════
// Strumento INTERNO solo staff per tracciare i contatti sponsor: a che
// punto è la trattativa, chi ricontattare e quando, note. Nasce come
// naturale prosecuzione della pagina pubblica /media-kit — quella resta
// la vetrina pubblica, questa è l'agenda privata dello staff.
//
// Nessun collegamento a sistemi esterni: lo staff aggiunge a mano ogni
// contatto (stesso pattern di Candidates.js).
//
// Setup: setupSponsorsTab() — editor Apps Script → dropdown funzioni →
// ▶ Esegui (una volta sola, idempotente).
//
// Registrate in Codice.js dispatcher come:
//   'sponsors.list':   handleSponsorsList
//   'sponsors.add':    handleSponsorsAdd
//   'sponsors.update': handleSponsorsUpdate
//   'sponsors.remove': handleSponsorsRemove
// ═══════════════════════════════════════════════════════════

const SPONSOR_HEADERS = [
  'sponsor_id', 'company_name', 'contact_name', 'contact_email', 'contact_phone',
  'status', 'value_estimate', 'next_follow_up', 'notes',
  'created_at', 'updated_at', 'updated_by',
];

const SPONSOR_STATUSES = ['lead', 'contacted', 'negotiating', 'active', 'declined', 'lapsed'];
const SPONSOR_EDITABLE_FIELDS = [
  'company_name', 'contact_name', 'contact_email', 'contact_phone',
  'status', 'value_estimate', 'next_follow_up', 'notes',
];

function setupSponsorsTab() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEETS.SPONSORS);
  if (sheet) {
    Logger.log('✓ Tab "' + SHEETS.SPONSORS + '" già esistente, nessuna modifica.');
    return;
  }
  sheet = ss.insertSheet(SHEETS.SPONSORS);
  sheet.getRange(1, 1, 1, SPONSOR_HEADERS.length).setValues([SPONSOR_HEADERS]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, SPONSOR_HEADERS.length).setFontWeight('bold');
  Logger.log('✅ Tab "' + SHEETS.SPONSORS + '" creata con ' + SPONSOR_HEADERS.length + ' colonne.');
}

/**
 * sponsors.list — Tutti gli sponsor, filtro opzionale per stato.
 * Auth: staff.
 */
function handleSponsorsList(payload, ctx) {
  if (!ctx || !ctx.isStaff) return fail('Accesso riservato allo staff');

  let sponsors = sheetToObjects(SHEETS.SPONSORS);
  const statusFilter = payload && payload.status;
  if (statusFilter) sponsors = sponsors.filter(s => s.status === statusFilter);

  // Chi ha un follow-up scaduto/vicino va in cima — è il motivo pratico
  // per cui esiste questo strumento (non dimenticare di ricontattare).
  sponsors.sort((a, b) => {
    const fa = a.next_follow_up || '9999-12-31';
    const fb = b.next_follow_up || '9999-12-31';
    return String(fa).localeCompare(String(fb));
  });

  return ok({ sponsors, count: sponsors.length });
}

/**
 * sponsors.add — Nuovo sponsor, stato iniziale sempre 'lead'.
 * Auth: staff.
 * @param {Object} payload - { company_name, contact_name?, contact_email?,
 *   contact_phone?, value_estimate?, next_follow_up?, notes? }
 */
function handleSponsorsAdd(payload, ctx) {
  if (!ctx || !ctx.isStaff) return fail('Accesso riservato allo staff');

  payload = payload || {};
  const companyName = String(payload.company_name || '').trim();
  if (!companyName) return fail('company_name obbligatorio');

  const sheet = getSheet(SHEETS.SPONSORS);
  if (!sheet) return fail('Tab Sponsors non trovata — esegui setupSponsorsTab() una volta');

  const sponsorId = 'spon_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const now = new Date().toISOString();
  const row = {
    sponsor_id: sponsorId,
    company_name: companyName,
    contact_name: String(payload.contact_name || ''),
    contact_email: String(payload.contact_email || ''),
    contact_phone: String(payload.contact_phone || ''),
    status: 'lead',
    value_estimate: String(payload.value_estimate || ''),
    next_follow_up: String(payload.next_follow_up || ''),
    notes: String(payload.notes || ''),
    created_at: now,
    updated_at: now,
    updated_by: ctx.driver_id || '',
  };
  sheet.appendRow(SPONSOR_HEADERS.map(h => row[h]));

  logAudit_(ctx, 'sponsors.add', sponsorId, 'Nuovo sponsor: ' + companyName, null);

  notifyNewSponsorLead_(row);

  return ok(row);
}

/**
 * sponsors.update — Aggiorna uno o più campi (inclusi status/notes).
 * Auth: staff.
 * @param {Object} payload - { sponsor_id, ...campi da SPONSOR_EDITABLE_FIELDS }
 */
function handleSponsorsUpdate(payload, ctx) {
  if (!ctx || !ctx.isStaff) return fail('Accesso riservato allo staff');

  payload = payload || {};
  const sponsorId = String(payload.sponsor_id || '').trim();
  if (!sponsorId) return fail('sponsor_id obbligatorio');

  if (payload.status !== undefined && SPONSOR_STATUSES.indexOf(payload.status) === -1) {
    return fail('status non valido — atteso uno tra: ' + SPONSOR_STATUSES.join(', '));
  }

  const sheet = getSheet(SHEETS.SPONSORS);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idIdx = headers.indexOf('sponsor_id');
  if (idIdx < 0) return fail('Colonna sponsor_id mancante in Sponsors');

  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][idIdx] === sponsorId) { rowIndex = i; break; }
  }
  if (rowIndex < 0) return fail('Sponsor non trovato: ' + sponsorId);

  const rowObj = {};
  headers.forEach((h, i) => { rowObj[h] = data[rowIndex][i]; });
  const prevStatus = rowObj.status;

  SPONSOR_EDITABLE_FIELDS.forEach(field => {
    if (payload[field] !== undefined) rowObj[field] = String(payload[field]);
  });
  rowObj.updated_at = new Date().toISOString();
  rowObj.updated_by = ctx.driver_id || '';

  const newRow = headers.map(h => (rowObj[h] !== undefined ? rowObj[h] : ''));
  sheet.getRange(rowIndex + 1, 1, 1, newRow.length).setValues([newRow]);

  if (payload.status !== undefined && payload.status !== prevStatus) {
    logAudit_(ctx, 'sponsors.update', sponsorId,
      'Sponsor ' + rowObj.company_name + ': stato ' + prevStatus + ' → ' + rowObj.status, null);

    if (rowObj.status === 'active') {
      notifySponsorActivated_(rowObj);
    }
  }

  return ok(rowObj);
}

/**
 * sponsors.remove — Cancella uno sponsor (es. contatto errato/duplicato).
 * Auth: staff.
 */
function handleSponsorsRemove(payload, ctx) {
  if (!ctx || !ctx.isStaff) return fail('Accesso riservato allo staff');

  payload = payload || {};
  const sponsorId = String(payload.sponsor_id || '').trim();
  if (!sponsorId) return fail('sponsor_id obbligatorio');

  const sheet = getSheet(SHEETS.SPONSORS);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idIdx = headers.indexOf('sponsor_id');

  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][idIdx] === sponsorId) { rowIndex = i; break; }
  }
  if (rowIndex < 0) return fail('Sponsor non trovato: ' + sponsorId);

  sheet.deleteRow(rowIndex + 1);
  return ok({ deleted: true, sponsor_id: sponsorId });
}

// ═══════════════════════════════════════════════════════════
// DIGEST FOLLOW-UP SPONSOR — promemoria settimanale su Discord
// ═══════════════════════════════════════════════════════════
// Colma lo stesso tipo di buco già chiuso per il piano editoriale social
// (SocialManager.js, runSocialPlanDigest): i follow-up scaduti oggi si
// vedono SOLO aprendo Admin Home (AdminHome.jsx) — se quella tab non si
// apre per qualche settimana, uno sponsor "da richiamare" può restare
// silenzioso per mesi senza che nessuno se ne accorga. Stesso canale
// admin usato da notifyNewSponsorLead_/notifySponsorActivated_ (dato
// commerciale, non da esporre ai piloti in generale).
//
// Registrazione trigger: setupTriggers() in Triggers.js (lunedì 8:30 —
// mezz'ora dopo il digest social, per non sovrapporre le due chiamate).

/**
 * Promemoria settimanale dei follow-up sponsor scaduti o in scadenza
 * questa settimana. Fault-tolerant: try/catch, non lancia mai.
 * Esclude 'declined'/'lapsed' (trattativa chiusa, nessun follow-up ha
 * senso) — stesso filtro già usato in AdminHome.jsx.
 * Dropdown function → runSponsorFollowUpDigest → ▶ Esegui (test manuale),
 * oppure lasciare al trigger settimanale (Triggers.js).
 */
function runSponsorFollowUpDigest() {
  try {
    const sponsors = sheetToObjects(SHEETS.SPONSORS)
      .filter(s => s.status !== 'declined' && s.status !== 'lapsed');

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const dow = now.getDay();
    const daysToSunday = (7 - dow) % 7;
    const endOfThisWeek = addDaysSocialDigest_(now, daysToSunday);
    endOfThisWeek.setHours(23, 59, 59, 999);

    const late = [];
    const thisWeek = [];

    sponsors.forEach(s => {
      if (!s.next_follow_up) return;
      const d = new Date(s.next_follow_up);
      if (isNaN(d.getTime())) return;
      const label = s.company_name + (s.status ? ` (${s.status})` : '');
      if (d < now) late.push(label);
      else if (d <= endOfThisWeek) thisWeek.push(label);
    });

    if (late.length === 0 && thisWeek.length === 0) {
      Logger.log('Digest follow-up sponsor: nulla da segnalare questa settimana.');
      return { ok: true, skipped: true };
    }

    const fields = [];
    if (late.length > 0) fields.push({ name: '🔴 Follow-up scaduti (' + late.length + ')', value: late.join('\n').slice(0, 1024) });
    if (thisWeek.length > 0) fields.push({ name: '📅 Da fare questa settimana (' + thisWeek.length + ')', value: thisWeek.join('\n').slice(0, 1024) });

    const payload = {
      embeds: [{
        author: { name: 'VSD Paddock — Partnership' },
        title: '🤝 Follow-up sponsor — promemoria settimanale',
        color: VSD_COLORS.orange,
        fields: fields,
        timestamp: new Date().toISOString(),
        footer: { text: 'CRM Sponsor · Admin' },
        url: PADDOCK_URL + '/admin/sponsors',
      }],
    };

    return postToDiscordAdmin_(payload);
  } catch (e) {
    Logger.log('⚠️  runSponsorFollowUpDigest error: ' + e.message);
    return { ok: false, error: e.message };
  }
}
