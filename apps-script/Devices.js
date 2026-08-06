// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Device Tokens (companion app fuel/energy)
// ═══════════════════════════════════════════════════════════
// Token long-lived per autenticare il companion app Python (legge la
// shared memory di Le Mans Ultimate e manda campioni a fuel.logSample).
// Non è un meccanismo nuovo: riusa lo stesso schema HMAC 5-parti dei
// token di sessione (generateTokenWithClassification_ / verifyToken in
// discordAuth.js / Codice.js), solo con scadenza molto più lunga —
// un pilota non può ri-loggare via Discord ogni 7 giorni da uno script
// che gira in background durante una gara.
//
// Nessuna tabella nuova: essendo stateless (firma HMAC, non lookup su
// sheet), verifyToken() esistente valida questi token senza modifiche.
// Il rischio di un token compromesso è lo stesso di un token di
// sessione normale (stessa identità/permessi), solo con una finestra
// di validità più lunga — accettabile, ma va comunicato al pilota.
//
// Registrate in Codice.js dispatcher come:
//   'devices.createToken': handleDevicesCreateToken
// ═══════════════════════════════════════════════════════════

const DEVICE_TOKEN_TTL_MS = 180 * 24 * 60 * 60 * 1000; // 180 giorni

/**
 * devices.createToken — Genera un token long-lived per il companion app.
 * Auth: richiesta (qualsiasi pilota loggato, genera solo il PROPRIO
 * token — non c'è modo di generarne uno per un altro driver_id).
 *
 * @param {Object} _payload - non usato
 * @param {Object} ctx - Auth context (richiesto, driver_id valorizzato)
 * @returns {Object} ok({ token, expires_at, note }) oppure fail
 */
function handleDevicesCreateToken(_payload, ctx) {
  if (!ctx || !ctx.driver_id) {
    return fail('Auth richiesto — solo piloti loggati possono generare un token companion');
  }

  const classification = {
    driver_id: ctx.driver_id,
    tier: ctx.tier,
    sims: ctx.sims || [],
  };
  const expiresAt = Date.now() + DEVICE_TOKEN_TTL_MS;
  const token = generateTokenWithTtl_(classification, DEVICE_TOKEN_TTL_MS);

  return ok({
    token,
    expires_at: new Date(expiresAt).toISOString(),
    note: 'Incolla questo token nel file di config del companion app fuel/energy. Valido 180 giorni — rigenerabile in qualsiasi momento dal tuo profilo. Non condividerlo: chi lo ha può scrivere campioni consumo a tuo nome.',
  });
}

/**
 * Variante di generateTokenWithClassification_ (discordAuth.js) con TTL
 * parametrico invece del TOKEN_TTL_MS fisso a 7 giorni. Stesso formato
 * 5-parti, stessa firma HMAC — verifyToken() esistente lo riconosce
 * senza bisogno di rami separati.
 *
 * @param {{tier: string, driver_id: string|null, sims: string[]}} classification
 * @param {number} ttlMs
 * @returns {string} token base64WebSafe
 */
function generateTokenWithTtl_(classification, ttlMs) {
  const expiresAt = Date.now() + ttlMs;
  const driverId = classification.driver_id || 'null';
  const tier = classification.tier;
  const simsCsv = (classification.sims || []).join(',');

  const payload = `${driverId}|${tier}|${simsCsv}|${expiresAt}`;
  const signature = signHmac(payload, getAuthSecret());
  return Utilities.base64EncodeWebSafe(`${payload}|${signature}`);
}
