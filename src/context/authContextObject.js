import { createContext } from 'react';

// Oggetto Context isolato in un file a sé: AuthContext.jsx esporta solo il
// componente AuthProvider (fast refresh richiede che un file esporti SOLO
// componenti per funzionare correttamente in dev — non un problema
// funzionale, solo hot-reload più affidabile durante lo sviluppo).
export const AuthContext = createContext(null);
