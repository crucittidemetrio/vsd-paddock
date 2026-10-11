// Token legacy (Apps Script, login Discord): base64url di
// "driver_id|tier|sims_csv|expiresAt|signature", TTL 7 giorni
// (TOKEN_TTL_MS in apps-script/Codice.js). La firma si verifica solo
// lato server; qui leggiamo solo la scadenza per non continuare a usare
// un token morto (→ "Auth richiesto" su ogni pagina, 11/10/2026).

export const SESSION_EXPIRED_EVENT = 'vsd:session-expired';

export function getLegacyTokenExpiry(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const b64 = token.replace(/-/g, '+').replace(/_/g, '/');
    const parts = atob(b64 + '==='.slice((b64.length + 3) % 4)).split('|');
    if (parts.length !== 5) return null;
    const exp = parseInt(parts[3], 10);
    return Number.isFinite(exp) ? exp : null;
  } catch {
    return null;
  }
}

/** true solo se la scadenza è leggibile e già passata (margine 30 s). */
export function isLegacyTokenExpired(token, skewMs = 30_000) {
  const exp = getLegacyTokenExpiry(token);
  return exp !== null && Date.now() + skewMs >= exp;
}

export function notifySessionExpired() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}
