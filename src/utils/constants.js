// ===========================================
// VSD PADDOCK — Costanti applicative
// ===========================================

// Simulatori supportati
export const SIMS = {
  LMU: { id: 'LMU', name: 'Le Mans Ultimate', short: 'LMU', color: 'var(--sim-lmu)' },
  IRC: { id: 'IRC', name: 'iRacing', short: 'iRC', color: 'var(--sim-irc)' },
  ACE: { id: 'ACE', name: 'Assetto Corsa Evo', short: 'ACE', color: 'var(--sim-ace)' },
};

export const SIM_LIST = Object.values(SIMS);

// Categorie auto
export const CAR_CATEGORIES = [
  'GT3', 'GT4', 'LMP2', 'LMH', 'Hypercar', 'Prototype', 'F1', 'Formula', 'TCR', 'Other',
];

// Ruoli utente
export const ROLES = {
  ADMIN: 'admin',
  STAFF: 'staff',
  DRIVER: 'driver',
};

// Stati pilota
export const DRIVER_STATUS = {
  ACTIVE: 'active',
  TRIAL: 'trial',
  INACTIVE: 'inactive',
};

// Condizioni gara
export const CONDITIONS = ['dry', 'wet', 'mixed'];

// Tipo sessione
export const SESSION_TYPES = ['practice', 'quali', 'race', 'hotlap'];

// Storage keys (localStorage)
export const STORAGE = {
  TOKEN: 'vsd_paddock_token',
  DRIVER: 'vsd_paddock_driver',
};

// Etichette UI italiane
export const LABELS = {
  // Navigazione
  nav_landing: 'Mission Control',
  nav_roster: 'Roster',
  nav_race: 'Race Hub',
  nav_reports: 'Race Report',
  nav_laps: 'Best Laps',
  nav_training: 'Training',
  nav_academy: 'Academy',
  nav_endurance: 'Endurance',
  nav_logout: 'Esci',

  // Auth
  auth_title: 'Accedi al Paddock',
  auth_subtitle: 'Inserisci il tuo codice pilota',
  auth_code_placeholder: 'CODICE-PILOTA',
  auth_submit: 'Entra',
  auth_error: 'Codice non riconosciuto',
};