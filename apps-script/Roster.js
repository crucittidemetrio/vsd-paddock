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
