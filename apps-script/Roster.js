// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Roster Endpoints
// ═══════════════════════════════════════════════════════════
// Espone la directory piloti del team.
// Privacy: campi privati visibili solo a staff/admin/self.
// ═══════════════════════════════════════════════════════════

/**
 * roster.list — Lista di tutti i piloti.
 * Auth: richiesta (qualsiasi membro autenticato).
 * Privacy: sempre campi public, anche per staff/admin.
 *   Razionale: la lista è una directory leggera. Se serve dettaglio,
 *   si chiama roster.get sul singolo driver_id.
 *
 * @param {Object} payload - { includeInactive?: boolean, includeRemoved?: boolean }
 * @param {Object} ctx - Auth context (richiesto)
 * @returns {Object} { ok, data: { drivers: [...] } }
 */
function handleRosterList(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');

  const includeInactive = payload && (payload.includeInactive === true || payload.includeInactive === 'true');
  const includeRemoved  = payload && (payload.includeRemoved  === true || payload.includeRemoved  === 'true');

  const drivers = getCachedSheetData_(SHEETS.DRIVERS, 600);

  const filtered = drivers.filter(d => {
    if (d.driver_id === 'VSD001') return false; // account di sistema, mai nel roster pubblico
    if (d.removed_at) return includeRemoved;    // rimossi: visibili solo se esplicitamente richiesti
    if (includeInactive || includeRemoved) return true;
    return d.status === 'active';
  });

  const sanitized = filtered.map(d => {
    const base = sanitizeDriver(d, 'public');
    if (d.removed_at) {
      base.is_ex_vsd = true;
      base.removed_at = d.removed_at;
    }
    return base;
  });

  // Ordina per display_name (case-insensitive)
  sanitized.sort((a, b) => {
    const na = String(a.display_name || '').toLowerCase();
    const nb = String(b.display_name || '').toLowerCase();
    return na.localeCompare(nb);
  });

  return ok({ drivers: sanitized, count: sanitized.length });
}

/**
 * roster.get — Dettaglio di un singolo pilota.
 * Auth: richiesta.
 * Privacy:
 *   - viewer è staff/admin → livello 'private'
 *   - viewer è il driver stesso (self) → livello 'private'
 *   - altrimenti → livello 'public'
 *
 * @param {Object} payload - { driver_id: string }
 * @param {Object} ctx - Auth context (richiesto)
 * @returns {Object} { ok, data: { driver: {...} } }
 */
function handleRosterGet(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');

  const driverId = payload && payload.driver_id;
  if (!driverId) return fail('driver_id mancante');

  const drivers = getCachedSheetData_(SHEETS.DRIVERS, 600);
  const driver = drivers.find(d => d.driver_id === driverId);

  if (!driver) return fail('Pilota non trovato: ' + driverId);

  // Determina livello visibilità
  const isSelf = ctx.driver_id === driverId;
  const level = (ctx.isStaff || isSelf) ? 'private' : 'public';

  const sanitized = sanitizeDriver(driver, level);
  if (driver.removed_at) {
    sanitized.is_ex_vsd = true;
    sanitized.removed_at = driver.removed_at;
  }

  return ok({ driver: sanitized });
}

// ═══════════════════════════════════════════════════════════
// SELF-EDIT — un pilota aggiorna il PROPRIO profilo (bio/social)
// ═══════════════════════════════════════════════════════════
// Deliberatamente SENZA avatar qui: la foto profilo resta gestita
// manualmente (vedi media/drivers/, driverPhotos.js) — decisione
// esplicita per non aprire un canale di upload libero sul roster.

const ROSTER_SELF_EDITABLE_FIELDS = ['bio', 'instagram', 'facebook'];
const DRIVER_SOCIAL_COLUMNS = ['instagram', 'facebook'];

/**
 * setupDriverSocialColumns — aggiunge le colonne "instagram"/"facebook"
 * alla tab Drivers se non esistono già. One-time, idempotente (editor
 * Apps Script → ▶ Esegui). Rilanciabile in sicurezza: salta le colonne
 * già presenti.
 */
function setupDriverSocialColumns() {
  const sheet = getSheet(SHEETS.DRIVERS);
  if (!sheet) { Logger.log('⚠️  Tab Drivers non trovata.'); return; }
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  DRIVER_SOCIAL_COLUMNS.forEach(col => {
    if (headers.indexOf(col) !== -1) {
      Logger.log('✓ Colonna "' + col + '" già esistente, nessuna modifica.');
      return;
    }
    const nextCol = sheet.getLastColumn() + 1;
    sheet.getRange(1, nextCol).setValue(col).setFontWeight('bold');
    Logger.log('✅ Colonna "' + col + '" aggiunta in posizione ' + nextCol + '.');
  });
}

/**
 * roster.updateSelf — un pilota loggato aggiorna bio/instagram/facebook
 * del PROPRIO profilo. driver_id preso SEMPRE da ctx, mai dal payload —
 * un token compromesso non deve poter scrivere a nome di un altro
 * pilota (stesso principio già usato per fuel.logSample/handleFuelLogSample).
 *
 * @param {Object} payload - { bio?, instagram?, facebook? }
 * @param {Object} ctx - Auth context (richiesto, driver_id valorizzato)
 * @returns {Object} ok({ driver_id, updated: [...] }) oppure fail
 */
function handleRosterUpdateSelf(payload, ctx) {
  if (!ctx || !ctx.driver_id) return fail('Devi essere loggato');

  payload = payload || {};
  const updates = {};
  ROSTER_SELF_EDITABLE_FIELDS.forEach(f => {
    if (payload[f] !== undefined) updates[f] = String(payload[f]).slice(0, 500);
  });
  if (Object.keys(updates).length === 0) return fail('Nessun campo da aggiornare');

  const sheet = getSheet(SHEETS.DRIVERS);
  if (!sheet) return fail('Foglio Drivers non trovato');

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idIdx = headers.indexOf('driver_id');
  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][idIdx] === ctx.driver_id) { rowIndex = i; break; }
  }
  if (rowIndex === -1) return fail('Pilota non trovato');

  const rowToUpdate = rowIndex + 1; // base-1 per getRange
  const updatedFields = [];
  for (const key in updates) {
    const colIndex = headers.indexOf(key);
    if (colIndex === -1) continue; // campo non ancora in sheet (es. instagram prima del setup) — ignorato, non un errore bloccante
    sheet.getRange(rowToUpdate, colIndex + 1).setValue(updates[key]);
    updatedFields.push(key);
  }

  if (updatedFields.length === 0) {
    return fail('Colonne non trovate in Drivers — esegui setupDriverSocialColumns() se stai aggiornando instagram/facebook per la prima volta');
  }

  invalidateSheetCache_(SHEETS.DRIVERS);
  logAudit_(ctx, 'roster.updateSelf', ctx.driver_id, 'Profilo aggiornato: ' + updatedFields.join(', '), null);

  return ok({ driver_id: ctx.driver_id, updated: updatedFields });
}
