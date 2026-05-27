import { createContext, useState, useEffect } from 'react';
import { STORAGE, ROLES, TIERS, TIER_ORDER } from '../utils/constants';
import { api } from '../api/client';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [driver, setDriver] = useState(null);
  const [token, setToken] = useState(null);
  const [tier, setTier] = useState(TIERS.ANONYMOUS);
  const [sims, setSims] = useState([]);
  const [loading, setLoading] = useState(true);

  // Restore sessione da localStorage al boot
  useEffect(() => {
    try {
      const savedToken = localStorage.getItem(STORAGE.TOKEN);
      const savedDriver = localStorage.getItem(STORAGE.DRIVER);
      const savedTier = localStorage.getItem(STORAGE.TIER);
      const savedSims = localStorage.getItem(STORAGE.SIMS);

      if (savedToken) {
        setToken(savedToken);
        // driver può essere null per tier=guest
        setDriver(savedDriver ? JSON.parse(savedDriver) : null);
        // Fallback tier=guest se manca (token legacy salvato pre-Wave 10)
        setTier(savedTier || TIERS.PILOT_VSD);
        setSims(savedSims ? JSON.parse(savedSims) : []);
      }
    } catch (e) {
      console.warn('Auth restore failed', e);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Login legacy via access_code admin.
   * Token ritornato è formato 3-parti (no tier nel payload); deriviamo tier
   * dal driver.role.
   */
  async function login(code) {
    const trimmed = (code || '').trim();
    if (!trimmed) return { ok: false, error: 'Codice mancante' };
    try {
      const data = await api.auth.login(trimmed);
      const derivedTier = driverRoleToTier_(data.driver.role);

      setToken(data.token);
      setDriver(data.driver);
      setTier(derivedTier);
      setSims([]);

      localStorage.setItem(STORAGE.TOKEN, data.token);
      localStorage.setItem(STORAGE.DRIVER, JSON.stringify(data.driver));
      localStorage.setItem(STORAGE.TIER, derivedTier);
      localStorage.setItem(STORAGE.SIMS, JSON.stringify([]));

      return { ok: true };
    } catch (e) {
      console.error('[AuthContext] login failed', e);
      return { ok: false, error: e.message || 'Errore di login' };
    }
  }

  /**
   * Imposta sessione dopo Discord OAuth callback.
   * Chiamato da AuthCallback.jsx dopo POST auth.discordCallback.
   * @param {{ token: string, tier: string, sims: string[], driver_id: string|null }} authData
   */
  function setDiscordSession(authData) {
    setToken(authData.token);
    setTier(authData.tier);
    setSims(authData.sims || []);
    // Per pilot_vsd/staff/admin salviamo {driver_id} minimale;
    // i dettagli completi sono in sheet, recuperabili via useRoster.get()
    const minimalDriver = authData.driver_id ? { driver_id: authData.driver_id } : null;
    setDriver(minimalDriver);

    localStorage.setItem(STORAGE.TOKEN, authData.token);
    localStorage.setItem(STORAGE.TIER, authData.tier);
    localStorage.setItem(STORAGE.SIMS, JSON.stringify(authData.sims || []));
    if (minimalDriver) {
      localStorage.setItem(STORAGE.DRIVER, JSON.stringify(minimalDriver));
    } else {
      localStorage.removeItem(STORAGE.DRIVER);
    }
  }

  function logout() {
    setToken(null);
    setDriver(null);
    setTier(TIERS.ANONYMOUS);
    setSims([]);
    localStorage.removeItem(STORAGE.TOKEN);
    localStorage.removeItem(STORAGE.DRIVER);
    localStorage.removeItem(STORAGE.TIER);
    localStorage.removeItem(STORAGE.SIMS);
  }

  // ─── Helpers derivati ───
  // Wave 10 fix: prima era !!token && !!driver (rompeva guest che ha driver=null)
  const isAuthenticated = !!token;
  const isAnonymous = !token;
  const isGuest = tier === TIERS.GUEST;
  const isVsdPilot = tier === TIERS.PILOT_VSD || tier === TIERS.STAFF || tier === TIERS.ADMIN;
  const isStaff = tier === TIERS.STAFF || tier === TIERS.ADMIN;
  const isAdmin = tier === TIERS.ADMIN;

  function hasAtLeast(minTier) {
    const currentIdx = TIER_ORDER.indexOf(tier);
    const minIdx = TIER_ORDER.indexOf(minTier);
    if (currentIdx === -1 || minIdx === -1) return false;
    return currentIdx >= minIdx;
  }

  const value = {
    driver,
    token,
    tier,
    sims,
    loading,
    isAuthenticated,
    isAnonymous,
    isGuest,
    isVsdPilot,
    isStaff,
    isAdmin,
    hasAtLeast,
    login,
    setDiscordSession,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Mappa driver.role (legacy access_code login) a tier (Wave 10).
 */
function driverRoleToTier_(role) {
  if (role === ROLES.ADMIN) return TIERS.ADMIN;
  if (role === ROLES.STAFF) return TIERS.STAFF;
  return TIERS.PILOT_VSD;
}