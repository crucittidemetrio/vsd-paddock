import { useState, useEffect } from 'react';
import { STORAGE, TIERS, TIER_ORDER } from '../utils/constants';
import { AuthContext } from './authContextObject';

export function AuthProvider({ children }) {
  const [driver, setDriver] = useState(null);
  const [token, setToken] = useState(null);
  const [tier, setTier] = useState(TIERS.ANONYMOUS);
  const [sims, setSims] = useState([]);
  // Wave 10.2.Y: Discord profile info (avatar URL + username) per UI display
  const [discordAvatarUrl, setDiscordAvatarUrl] = useState(null);
  const [discordUsername, setDiscordUsername] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore sessione da localStorage al boot
  useEffect(() => {
    try {
      const savedToken = localStorage.getItem(STORAGE.TOKEN);
      const savedDriver = localStorage.getItem(STORAGE.DRIVER);
      const savedTier = localStorage.getItem(STORAGE.TIER);
      const savedSims = localStorage.getItem(STORAGE.SIMS);
      // Wave 10.2.Y
      const savedDiscordAvatar = localStorage.getItem(STORAGE.DISCORD_AVATAR_URL);
      const savedDiscordUsername = localStorage.getItem(STORAGE.DISCORD_USERNAME);

      if (savedToken) {
        setToken(savedToken);
        // driver può essere null per tier=guest
        setDriver(savedDriver ? JSON.parse(savedDriver) : null);
        // Fallback tier=guest se manca (token legacy salvato pre-Wave 10)
        setTier(savedTier || TIERS.GUEST);
        setSims(savedSims ? JSON.parse(savedSims) : []);
        setDiscordAvatarUrl(savedDiscordAvatar || null);
        setDiscordUsername(savedDiscordUsername || null);
      }
    } catch (e) {
      console.warn('Auth restore failed', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Wave 10.X: funzione login() legacy (access_code) rimossa. L'unico
  // metodo di autenticazione è ora Discord OAuth via setDiscordSession.

  /**
   * Imposta sessione dopo Discord OAuth callback.
   * Chiamato da AuthCallback.jsx dopo POST auth.discordCallback.
   * @param {{ token: string, tier: string, sims: string[], driver_id: string|null, driver?: Object, discord_username?: string, discord_avatar_url?: string|null }} authData
   */
  function setDiscordSession(authData) {
    setToken(authData.token);
    setTier(authData.tier);
    setSims(authData.sims || []);
    // Wave 10.2.X: prefer full driver dal sheet, fallback al minimal {driver_id}
    const driverToSave = authData.driver
      || (authData.driver_id ? { driver_id: authData.driver_id } : null);
    setDriver(driverToSave);
    // Wave 10.2.Y: Discord profile info
    setDiscordAvatarUrl(authData.discord_avatar_url || null);
    setDiscordUsername(authData.discord_username || null);

    localStorage.setItem(STORAGE.TOKEN, authData.token);
    localStorage.setItem(STORAGE.TIER, authData.tier);
    localStorage.setItem(STORAGE.SIMS, JSON.stringify(authData.sims || []));
    if (driverToSave) {
      localStorage.setItem(STORAGE.DRIVER, JSON.stringify(driverToSave));
    } else {
      localStorage.removeItem(STORAGE.DRIVER);
    }
    if (authData.discord_avatar_url) {
      localStorage.setItem(STORAGE.DISCORD_AVATAR_URL, authData.discord_avatar_url);
    } else {
      localStorage.removeItem(STORAGE.DISCORD_AVATAR_URL);
    }
    if (authData.discord_username) {
      localStorage.setItem(STORAGE.DISCORD_USERNAME, authData.discord_username);
    } else {
      localStorage.removeItem(STORAGE.DISCORD_USERNAME);
    }
  }

  function logout() {
    setToken(null);
    setDriver(null);
    setTier(TIERS.ANONYMOUS);
    setSims([]);
    setDiscordAvatarUrl(null);
    setDiscordUsername(null);
    localStorage.removeItem(STORAGE.TOKEN);
    localStorage.removeItem(STORAGE.DRIVER);
    localStorage.removeItem(STORAGE.TIER);
    localStorage.removeItem(STORAGE.SIMS);
    localStorage.removeItem(STORAGE.DISCORD_AVATAR_URL);
    localStorage.removeItem(STORAGE.DISCORD_USERNAME);
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
    discordAvatarUrl,
    discordUsername,
    loading,
    isAuthenticated,
    isAnonymous,
    isGuest,
    isVsdPilot,
    isStaff,
    isAdmin,
    hasAtLeast,
    setDiscordSession,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
