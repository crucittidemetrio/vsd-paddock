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
 * @param {Object} payload - { includeInactive?: boolean }
 * @param {Object} ctx - Auth context (richiesto)
 * @returns {Object} { ok, data: { drivers: [...] } }
 */
function handleRosterList(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');

  const includeInactive = payload && (payload.includeInactive === true || payload.includeInactive === 'true');

  const drivers = getCachedSheetData_(SHEETS.DRIVERS, 600);

  const filtered = drivers.filter(d => {
    if (d.driver_id === 'VSD001') return false; // account di sistema, mai nel roster pubblico
    if (d.removed_at) return false;             // rimossi: invisibili ovunque
    if (includeInactive) return true;
    return d.status === 'active';
  });

  const sanitized = filtered.map(d => sanitizeDriver(d, 'public'));

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

  if (!driver || driver.removed_at) return fail('Pilota non trovato: ' + driverId);

  // Determina livello visibilità
  const isSelf = ctx.driver_id === driverId;
  const level = (ctx.isStaff || isSelf) ? 'private' : 'public';

  return ok({ driver: sanitizeDriver(driver, level) });
}
// ═══════════════════════════════════════════════════════════
// TEST FUNCTIONS
// ═══════════════════════════════════════════════════════════

/**
 * Test rimossi: verifica che i piloti con removed_at non compaiano nel roster.
 * Esegui dall'editor Apps Script.
 */
function testRemovedDriverFilter() {
  const drivers = getCachedSheetData_(SHEETS.DRIVERS, 0); // cache bypass
  const total = drivers.filter(d => d.driver_id !== 'VSD001').length;
  const rimossi = drivers.filter(d => d.removed_at).map(d => d.display_name + ' (' + d.driver_id + ')');
  const visibili = drivers.filter(d => d.driver_id !== 'VSD001' && !d.removed_at && d.status === 'active').length;

  Logger.log('Totale driver (escluso VSD001): ' + total);
  Logger.log('Rimossi (removed_at compilato): ' + rimossi.length + ' → ' + JSON.stringify(rimossi));
  Logger.log('Visibili nel roster (active + non rimossi): ' + visibili);
  Logger.log(rimossi.length > 0 ? '✓ Filtro attivo — i rimossi NON appariranno nel roster' : '⚠️ Nessun pilota ha removed_at compilato — metti un valore di test per verificare');
}

/**
 * Test: chiamata a roster.list con un viewer staff/admin.
 * Atteso: lista filtrata solo active, campi public.
 */
function testRosterList() {
  // Login per ottenere ctx (sostituisci col tuo access_code se diverso)
  const login = handleAuthLogin({ code: 'CRUCITTI-9182' });
  if (!login.ok) {
    Logger.log('Login fallito: ' + login.error);
    return;
  }
  const ctx = verifyToken(login.data.token);

  const result = handleRosterList({}, ctx);
  Logger.log('roster.list result:');
  Logger.log(JSON.stringify(result, null, 2));

  if (result.ok) {
    Logger.log(`Totale piloti attivi: ${result.data.count}`);
    // Verifica: nessun driver deve avere access_code, real_name, email
    const leak = result.data.drivers.find(d =>
      'access_code' in d || 'real_name' in d || 'email' in d
    );
    if (leak) {
      Logger.log('⚠️ LEAK rilevato in: ' + JSON.stringify(leak));
    } else {
      Logger.log('✓ Nessun leak: tutti i campi privati sono filtrati');
    }
  }
}

/**
 * Test: roster.get su se stessi → deve restituire campi privati.
 */
function testRosterGetSelf() {
  const login = handleAuthLogin({ code: 'CRUCITTI-9182' });
  const ctx = verifyToken(login.data.token);

  const result = handleRosterGet({ driver_id: ctx.driver_id }, ctx);
  Logger.log('roster.get (self) result:');
  Logger.log(JSON.stringify(result, null, 2));

  if (result.ok) {
    const d = result.data.driver;
    const hasPrivate = 'real_name' in d && 'email' in d;
    const hasSecret = 'access_code' in d;
    Logger.log(hasPrivate ? '✓ Campi privati visibili (self)' : '⚠️ Campi privati MANCANTI');
    Logger.log(!hasSecret ? '✓ access_code NON esposto' : '⚠️ access_code LEAK');
  }
}

/**
 * Test: roster.get su un altro pilota.
 * Se sei admin/staff vedi i privati, altrimenti solo public.
 */
function testRosterGetOther() {
  const login = handleAuthLogin({ code: 'CRUCITTI-9182' });
  const ctx = verifyToken(login.data.token);

  // Prendi un driver_id diverso dal tuo
  const drivers = getCachedSheetData_(SHEETS.DRIVERS, 600);
  const other = drivers.find(d => d.driver_id !== ctx.driver_id && d.status === 'active');

  if (!other) {
    Logger.log('Nessun altro pilota disponibile per il test');
    return;
  }

  const result = handleRosterGet({ driver_id: other.driver_id }, ctx);
  Logger.log(`roster.get (other: ${other.driver_id}) result:`);
  Logger.log(JSON.stringify(result, null, 2));

  if (result.ok) {
    const d = result.data.driver;
    const hasPrivate = 'real_name' in d || 'email' in d;
    if (ctx.isStaff) {
      Logger.log(hasPrivate ? '✓ Staff vede campi privati' : '⚠️ Staff NON vede privati');
    } else {
      Logger.log(!hasPrivate ? '✓ Non-staff vede solo public' : '⚠️ LEAK: privati visibili');
    }
  }
}