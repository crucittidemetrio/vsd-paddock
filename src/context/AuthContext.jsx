import { useState } from 'react';
import { STORAGE, TIERS, TIER_ORDER } from '../utils/constants';
import { AuthContext } from './authContextObject';

/**
 * Legge la sessione salvata in localStorage. Pura, nessun side-effect.
 * Chiamata dagli initializer "lazy" di useState qui sotto (useState(() =>
 * ...)), non da un useEffect: React la esegue una volta sola, al primo
 * render di ogni istanza, senza il giro extra "render vuoto poi pieno"
 * (react-hooks/set-state-in-effect) e senza il flash di stato anonimo
 * prima del ripristino. NOTA: viene invocata una volta per ciascun campo
 * (driver/token/tier/...) — ridondante ma innocuo, sono letture
 * localStorage sincrone ed economiche, e comunque solo al mount.
 */
function restoreAuthFromStorage_() {
  try {
    const savedToken = localStorage.getItem(STORAGE.TOKEN);
    if (!savedToken) return null;
    const savedDriver = localStorage.getItem(STORAGE.DRIVER);
    const savedTier = localStorage.getItem(STORAGE.TIER);
    const savedSims = localStorage.getItem(STORAGE.SIMS);
    // Wave 10.2.Y
    const savedDiscordAvatar = localStorage.getItem(STORAGE.DISCORD_AVATAR_URL);
    const savedDiscordUsername = localStorage.getItem(STORAGE.DISCORD_USERNAME);

    return {
      token: savedToken,
      // driver può essere null per tier=guest
      driver: savedDriver ? JSON.parse(savedDriver) : null,
      // Fallback tier=guest se manca (token legacy salvato pre-Wave 10)
      tier: savedTier || TIERS.GUEST,
      sims: savedSims ? JSON.parse(savedSims) : [],
      discordAvatarUrl: savedDiscordAvatar || null,
      discordUsername: savedDiscordUsername || null,
    };
  } catch (e) {
    console.warn('Auth restore failed', e);
    return null;
  }
}

export function AuthProvider({ children }) {
  const [driver, setDriver] = useState(() => restoreAuthFromStorage_()?.driver ?? null);
  const [token, setToken] = useState(() => restoreAuthFromStorage_()?.token ?? null);
  const [tier, setTier] = useState(() => restoreAuthFromStorage_()?.tier ?? TIERS.ANONYMOUS);
  const [sims, setSims] = useState(() => restoreAuthFromStorage_()?.sims ?? []);
  // Wave 10.2.Y: Discord profile info (avatar URL + username) per UI display
  const [discordAvatarUrl, setDiscordAvatarUrl] = useState(() => restoreAuthFromStorage_()?.discordAvatarUrl ?? null);
  const [discordUsername, setDiscordUsername] = useState(() => restoreAuthFromStorage_()?.discordUsername ?? null);
  // Il ripristino da localStorage è ora sincrono (vedi restoredRef sopra):
  // non c'è più un giro di caricamento post-mount, quindi loading è sempre
  // false. Costante (non useState) perché non cambia mai più — nessun
  // setter da tenere in giro.
  const loading = false;

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
  // Permesso granulare Messenger (Task #102): non passa da role/tier —
  // un pilota può avere can_message=true nel sheet Drivers senza essere
  // 'staff', così vede solo /admin/messenger e non tutta l'area admin.
  const canMessage = isStaff || driver?.can_message === true;

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
    canMessage,
    hasAtLeast,
    setDiscordSession,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
