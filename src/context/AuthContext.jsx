import { createContext, useState, useEffect } from 'react';
import { STORAGE, ROLES } from '../utils/constants';
import { api } from '../api/client';
export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [driver, setDriver] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const savedToken = localStorage.getItem(STORAGE.TOKEN);
      const savedDriver = localStorage.getItem(STORAGE.DRIVER);
      if (savedToken && savedDriver) {
        setToken(savedToken);
        setDriver(JSON.parse(savedDriver));
      }
    } catch (e) {
      console.warn('Auth restore failed', e);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   /**
   * Login reale: chiama il backend Apps Script tramite api.auth.login.
   * Salva token HMAC e driver in localStorage per persistere la sessione.
   */
    async function login(code) {
  const trimmed = (code || '').trim();
  if (!trimmed) return { ok: false, error: 'Codice mancante' };

  try {
    const data = await api.auth.login(trimmed);
    // data = { token, driver }
    setToken(data.token);
    setDriver(data.driver);
    localStorage.setItem(STORAGE.TOKEN, data.token);
    localStorage.setItem(STORAGE.DRIVER, JSON.stringify(data.driver));
    return { ok: true };
  } catch (e) {
    console.error('[AuthContext] login failed', e);
    return { ok: false, error: e.message || 'Errore di login' };
  }
}
  

  function logout() {
    setToken(null);
    setDriver(null);
    localStorage.removeItem(STORAGE.TOKEN);
    localStorage.removeItem(STORAGE.DRIVER);
  }

  const isAuthenticated = !!token && !!driver;
  const isStaff = driver?.role === ROLES.STAFF || driver?.role === ROLES.ADMIN;
  const isAdmin = driver?.role === ROLES.ADMIN;

  const value = {
    driver,
    token,
    loading,
    isAuthenticated,
    isStaff,
    isAdmin,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
