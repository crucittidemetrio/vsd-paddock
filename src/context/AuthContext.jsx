import { createContext, useContext, useState, useEffect } from 'react';
import { STORAGE, ROLES } from '../utils/constants';
import { DRIVERS } from '../api/mockData';

const AuthContext = createContext(null);

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
   * Mock login — autentica contro il roster reale.
   * Codice "STAFF*"/"ADMIN*" → primo staff/admin del roster
   * Codice numerico/altro → mappa al driver_id se esiste, altrimenti
   *   primo driver attivo del roster (per la demo)
   */
  async function login(code) {
    const trimmed = (code || '').trim().toUpperCase();
    if (!trimmed) return { ok: false, error: 'Codice mancante' };

    let target;
    if (trimmed.startsWith('STAFF')) {
      target = DRIVERS.find(d => d.role === ROLES.STAFF) ||
               DRIVERS.find(d => d.role === ROLES.ADMIN);
    } else if (trimmed.startsWith('ADMIN')) {
      target = DRIVERS.find(d => d.role === ROLES.ADMIN);
    } else if (trimmed.startsWith('VSD')) {
      // Codici tipo VSD003 → driver specifico
      target = DRIVERS.find(d => d.driver_id === trimmed);
    }

    // Fallback: primo driver attivo (per la demo "qualsiasi codice")
    if (!target) {
      target = DRIVERS.find(d => d.role === ROLES.DRIVER && d.status === 'active');
    }

    if (!target) return { ok: false, error: 'Codice non riconosciuto' };

    const mockToken = `mock.${target.driver_id}.${Date.now()}`;
    setToken(mockToken);
    setDriver(target);
    localStorage.setItem(STORAGE.TOKEN, mockToken);
    localStorage.setItem(STORAGE.DRIVER, JSON.stringify(target));
    return { ok: true };
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

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}