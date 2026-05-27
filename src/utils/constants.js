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

// Tier auth (Wave 10 — Discord OAuth + multi-tier)
export const TIERS = {
  ANONYMOUS: 'anonymous',
  GUEST: 'guest',
  PILOT_VSD: 'pilot_vsd',
  STAFF: 'staff',
  ADMIN: 'admin',
};

// Ordine gerarchico per helper hasAtLeast(tier)
export const TIER_ORDER = ['anonymous', 'guest', 'pilot_vsd', 'staff', 'admin'];

// Stati pilota
export const DRIVER_STATUS = {
  ACTIVE: 'active',
  TRIAL: 'trial',
  INACTIVE: 'inactive',
};

// Condizioni gara
export const CONDITIONS = ['dry', 'wet', 'mixed'];

// Tipo sessione


// Storage keys (localStorage)
export const STORAGE = {
  TOKEN: 'vsd_paddock_token',
  DRIVER: 'vsd_paddock_driver',
  TIER: 'vsd_paddock_tier',                       // Wave 10
  SIMS: 'vsd_paddock_sims',                       // Wave 10
  DISCORD_AVATAR_URL: 'vsd_paddock_discord_avatar_url',  // Wave 10.2.Y
  DISCORD_USERNAME: 'vsd_paddock_discord_username',      // Wave 10.2.Y
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
  // Auth Discord (Wave 10)
  auth_discord_button: 'Accedi con Discord',
  auth_discord_loading: 'Reindirizzamento a Discord...',
  auth_or_separator: 'oppure',
  auth_callback_processing: 'Completamento accesso...',
  auth_callback_error: 'Errore durante l\'autenticazione',
  auth_callback_retry: 'Torna al login',
};
// ===========================================
// SESSION TYPES (BestLaps)
// ===========================================
// Tipo di sessione in cui il lap è stato registrato.
// Valori validi: practice, qualifying, race.
// Convenzione: lowercase, snake_case (allineato a sim/conditions).
// ===========================================

export const SESSION_TYPES = {
  PRACTICE: 'practice',
  QUALIFYING: 'qualifying',
  RACE: 'race',
};

export const SESSION_TYPE_LIST = [
  { id: 'practice', label: 'Practice', short: 'P' },
  { id: 'qualifying', label: 'Qualifica', short: 'Q' },
  { id: 'race', label: 'Gara', short: 'R' },
];

export const SESSION_TYPE_LABELS = {
  qualifying: 'Qualifica',
  heat: 'Heat',
  race: 'Gara',
};
