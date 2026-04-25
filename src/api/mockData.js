// ===========================================
// VSD PADDOCK — Mock Data
// Struttura speculare ai Google Sheets.
// Quando colleghiamo Apps Script (Tappa 4),
// i componenti non cambiano: cambia solo la fonte.
// ===========================================

import { SIMS, ROLES, DRIVER_STATUS } from '../utils/constants';

// ---------- DRIVERS ----------
export const DRIVERS = [
  {
    driver_id: 'VSD001',
    display_name: 'Marco "Bardo" Bardelli',
    real_name: 'Marco Bardelli',
    email: 'marco.bardelli@vsd.team',
    role: ROLES.ADMIN,
    status: DRIVER_STATUS.ACTIVE,
    join_date: '2023-04-12',
    nationality: 'IT',
    discord_id: 'bardo_vsd',
    iracing_id: '598211',
    lmu_id: 'bardo_lmu',
    ace_id: '',
    preferred_sims: 'LMU,IRC',
    specialties: 'GT3,LMP2,Endurance',
    avatar_url: '',
    bio: 'Team founder. Endurance specialist. 12h Le Mans 2024 winner (LMP2 class).',
  },
  {
    driver_id: 'VSD002',
    display_name: 'Lorenzo "LoreF1" Ferraro',
    real_name: 'Lorenzo Ferraro',
    email: 'l.ferraro@vsd.team',
    role: ROLES.STAFF,
    status: DRIVER_STATUS.ACTIVE,
    join_date: '2023-05-02',
    nationality: 'IT',
    discord_id: 'lorenzo_f1',
    iracing_id: '612045',
    lmu_id: '',
    ace_id: 'lore_ace',
    preferred_sims: 'IRC,ACE',
    specialties: 'F1,Formula,GT3',
    avatar_url: '',
    bio: 'Team manager + sporting director. Ex F4 Italia.',
  },
  {
    driver_id: 'VSD003',
    display_name: 'Giulia "Vega" Marchetti',
    real_name: 'Giulia Marchetti',
    email: 'g.marchetti@vsd.team',
    role: ROLES.DRIVER,
    status: DRIVER_STATUS.ACTIVE,
    join_date: '2024-01-15',
    nationality: 'IT',
    discord_id: 'vega_marchetti',
    iracing_id: '634892',
    lmu_id: 'vega_lmu',
    ace_id: '',
    preferred_sims: 'LMU,IRC',
    specialties: 'GT3,Hypercar',
    avatar_url: '',
    bio: 'GT specialist. Top-10 iRacing Special Events 2024.',
  },
  {
    driver_id: 'VSD004',
    display_name: 'Andrea "Drey" De Luca',
    real_name: 'Andrea De Luca',
    email: 'a.deluca@vsd.team',
    role: ROLES.DRIVER,
    status: DRIVER_STATUS.ACTIVE,
    join_date: '2024-02-20',
    nationality: 'IT',
    discord_id: 'drey_vsd',
    iracing_id: '',
    lmu_id: 'drey_lmu',
    ace_id: 'drey_ace',
    preferred_sims: 'LMU,ACE',
    specialties: 'LMP2,LMH,Endurance',
    avatar_url: '',
    bio: 'Stint master. Long-run pace consistency.',
  },
  {
    driver_id: 'VSD005',
    display_name: 'Tommaso "Tom-R" Russo',
    real_name: 'Tommaso Russo',
    email: 't.russo@vsd.team',
    role: ROLES.DRIVER,
    status: DRIVER_STATUS.ACTIVE,
    join_date: '2024-03-08',
    nationality: 'IT',
    discord_id: 'tomr_racing',
    iracing_id: '645210',
    lmu_id: '',
    ace_id: 'tomr_ace',
    preferred_sims: 'IRC,ACE',
    specialties: 'GT3,GT4',
    avatar_url: '',
    bio: 'Qualifying specialist. Quickest one-lap pace in roster.',
  },
  {
    driver_id: 'VSD006',
    display_name: 'Davide "DRP" Pellegrini',
    real_name: 'Davide Pellegrini',
    email: 'd.pellegrini@vsd.team',
    role: ROLES.DRIVER,
    status: DRIVER_STATUS.ACTIVE,
    join_date: '2024-06-11',
    nationality: 'IT',
    discord_id: 'drp_sim',
    iracing_id: '658113',
    lmu_id: 'drp_lmu',
    ace_id: '',
    preferred_sims: 'LMU,IRC',
    specialties: 'GT3,Hypercar',
    avatar_url: '',
    bio: 'Wet conditions specialist.',
  },
  {
    driver_id: 'VSD007',
    display_name: 'Federico "Fede" Conti',
    real_name: 'Federico Conti',
    email: 'f.conti@vsd.team',
    role: ROLES.DRIVER,
    status: DRIVER_STATUS.TRIAL,
    join_date: '2025-09-01',
    nationality: 'IT',
    discord_id: 'fede_conti',
    iracing_id: '671402',
    lmu_id: '',
    ace_id: 'fede_ace',
    preferred_sims: 'IRC,ACE',
    specialties: 'F1,Formula',
    avatar_url: '',
    bio: 'Trial period. Single-seater background.',
  },
  {
    driver_id: 'VSD008',
    display_name: 'Stefano "Steve" Romano',
    real_name: 'Stefano Romano',
    email: 's.romano@vsd.team',
    role: ROLES.DRIVER,
    status: DRIVER_STATUS.INACTIVE,
    join_date: '2023-08-15',
    nationality: 'IT',
    discord_id: 'steve_r',
    iracing_id: '601334',
    lmu_id: 'steve_lmu',
    ace_id: '',
    preferred_sims: 'LMU',
    specialties: 'GT3',
    avatar_url: '',
    bio: 'Inactive — career break.',
  },
];

// ---------- TRACKS ----------
export const TRACKS = [
  // LMU
  { track_id: 'spa-gp', sim: 'LMU', track_name: 'Spa-Francorchamps', variant: 'GP', length_km: 7.004, country: 'BE', active: true },
  { track_id: 'lemans-24h', sim: 'LMU', track_name: 'Circuit de la Sarthe', variant: '24h', length_km: 13.626, country: 'FR', active: true },
  { track_id: 'monza-gp', sim: 'LMU', track_name: 'Monza', variant: 'GP', length_km: 5.793, country: 'IT', active: true },
  { track_id: 'imola-gp', sim: 'LMU', track_name: 'Imola', variant: 'GP', length_km: 4.909, country: 'IT', active: true },
  { track_id: 'fuji-gp', sim: 'LMU', track_name: 'Fuji Speedway', variant: 'GP', length_km: 4.563, country: 'JP', active: true },
  // iRacing
  { track_id: 'spa-gp', sim: 'IRC', track_name: 'Spa-Francorchamps', variant: 'GP', length_km: 7.004, country: 'BE', active: true },
  { track_id: 'monza-gp', sim: 'IRC', track_name: 'Monza', variant: 'GP', length_km: 5.793, country: 'IT', active: true },
  { track_id: 'nurburgring-24h', sim: 'IRC', track_name: 'Nürburgring', variant: '24h Combined', length_km: 25.378, country: 'DE', active: true },
  { track_id: 'silverstone-gp', sim: 'IRC', track_name: 'Silverstone', variant: 'GP', length_km: 5.891, country: 'GB', active: true },
  { track_id: 'sebring-12h', sim: 'IRC', track_name: 'Sebring', variant: '12h', length_km: 6.019, country: 'US', active: true },
  // ACE
  { track_id: 'monza-gp', sim: 'ACE', track_name: 'Monza', variant: 'GP', length_km: 5.793, country: 'IT', active: true },
  { track_id: 'mugello-gp', sim: 'ACE', track_name: 'Mugello', variant: 'GP', length_km: 5.245, country: 'IT', active: true },
  { track_id: 'spa-gp', sim: 'ACE', track_name: 'Spa-Francorchamps', variant: 'GP', length_km: 7.004, country: 'BE', active: true },
];

// ---------- CARS ----------
export const CARS = [
  // GT3 (cross-sim)
  { car_id: 'ferrari-296-gt3', sim: 'LMU', car_name: 'Ferrari 296 GT3', manufacturer: 'Ferrari', category: 'GT3', active: true },
  { car_id: 'bmw-m4-gt3', sim: 'LMU', car_name: 'BMW M4 GT3', manufacturer: 'BMW', category: 'GT3', active: true },
  { car_id: 'porsche-992-gt3-r', sim: 'LMU', car_name: 'Porsche 992 GT3 R', manufacturer: 'Porsche', category: 'GT3', active: true },
  { car_id: 'mclaren-720s-gt3', sim: 'IRC', car_name: 'McLaren 720S GT3 Evo', manufacturer: 'McLaren', category: 'GT3', active: true },
  { car_id: 'audi-r8-lms-gt3', sim: 'IRC', car_name: 'Audi R8 LMS GT3 Evo II', manufacturer: 'Audi', category: 'GT3', active: true },
  { car_id: 'ferrari-296-gt3-ace', sim: 'ACE', car_name: 'Ferrari 296 GT3', manufacturer: 'Ferrari', category: 'GT3', active: true },
  // LMP2 / Hypercar
  { car_id: 'oreca-07', sim: 'LMU', car_name: 'Oreca 07', manufacturer: 'Oreca', category: 'LMP2', active: true },
  { car_id: 'porsche-963', sim: 'LMU', car_name: 'Porsche 963', manufacturer: 'Porsche', category: 'LMH', active: true },
  { car_id: 'ferrari-499p', sim: 'LMU', car_name: 'Ferrari 499P', manufacturer: 'Ferrari', category: 'LMH', active: true },
  { car_id: 'cadillac-vseries-r', sim: 'LMU', car_name: 'Cadillac V-Series.R', manufacturer: 'Cadillac', category: 'LMH', active: true },
  // F1 / Formula
  { car_id: 'dallara-f312', sim: 'IRC', car_name: 'Dallara F3', manufacturer: 'Dallara', category: 'Formula', active: true },
  { car_id: 'mercedes-w13', sim: 'IRC', car_name: 'Mercedes W13', manufacturer: 'Mercedes', category: 'F1', active: true },
];

// ---------- BEST LAPS ----------
// Helper per generare lap_time_display da ms
function fmt(ms) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const mil = ms % 1000;
  return `${m}:${String(s).padStart(2, '0')}.${String(mil).padStart(3, '0')}`;
}

function lap(id, driver_id, sim, track_id, car_id, ms, opts = {}) {
  return {
    lap_id: `LAP_${String(id).padStart(6, '0')}`,
    driver_id,
    sim,
    track_id,
    car_id,
    lap_time_ms: ms,
    lap_time_display: fmt(ms),
    set_date: opts.date || '2025-10-15',
    conditions: opts.conditions || 'dry',
    session_type: opts.session || 'hotlap',
    setup_shared: !!opts.setup,
    setup_link: opts.setup_link || '',
    replay_url: opts.replay || '',
    verified_by: opts.verified ? 'VSD002' : '',
    verified_at: opts.verified ? '2025-10-16T18:00:00Z' : '',
    notes: opts.notes || '',
    created_at: opts.created || '2025-10-15T20:30:00Z',
  };
}

export const BEST_LAPS = [
  // Spa LMU - GT3
  lap(1, 'VSD001', 'LMU', 'spa-gp', 'ferrari-296-gt3', 137412, { verified: true, setup: true, date: '2025-10-12' }),
  lap(2, 'VSD003', 'LMU', 'spa-gp', 'ferrari-296-gt3', 137889, { verified: true, date: '2025-10-14' }),
  lap(3, 'VSD005', 'LMU', 'spa-gp', 'bmw-m4-gt3', 138103, { verified: true, setup: true, date: '2025-10-10' }),
  lap(4, 'VSD006', 'LMU', 'spa-gp', 'porsche-992-gt3-r', 138567, { date: '2025-10-15' }),
  lap(5, 'VSD004', 'LMU', 'spa-gp', 'ferrari-296-gt3', 138891, { verified: true, date: '2025-10-08' }),
  // Le Mans LMU - LMH
  lap(6, 'VSD001', 'LMU', 'lemans-24h', 'porsche-963', 207450, { verified: true, setup: true, date: '2025-09-28' }),
  lap(7, 'VSD004', 'LMU', 'lemans-24h', 'porsche-963', 207998, { verified: true, date: '2025-09-30' }),
  lap(8, 'VSD003', 'LMU', 'lemans-24h', 'ferrari-499p', 208442, { date: '2025-10-02' }),
  // Monza LMU - GT3
  lap(9, 'VSD005', 'LMU', 'monza-gp', 'ferrari-296-gt3', 105234, { verified: true, setup: true, date: '2025-10-18' }),
  lap(10, 'VSD003', 'LMU', 'monza-gp', 'bmw-m4-gt3', 105667, { verified: true, date: '2025-10-19' }),
  lap(11, 'VSD006', 'LMU', 'monza-gp', 'ferrari-296-gt3', 106012, { date: '2025-10-20' }),
  // Imola LMU
  lap(12, 'VSD001', 'LMU', 'imola-gp', 'porsche-992-gt3-r', 100887, { verified: true, date: '2025-10-05' }),
  lap(13, 'VSD003', 'LMU', 'imola-gp', 'ferrari-296-gt3', 101104, { verified: true, setup: true, date: '2025-10-06' }),
  // iRacing - Spa GT3
  lap(14, 'VSD002', 'IRC', 'spa-gp', 'mclaren-720s-gt3', 137298, { verified: true, setup: true, date: '2025-10-11' }),
  lap(15, 'VSD005', 'IRC', 'spa-gp', 'audi-r8-lms-gt3', 137899, { verified: true, date: '2025-10-13' }),
  lap(16, 'VSD003', 'IRC', 'spa-gp', 'mclaren-720s-gt3', 138245, { date: '2025-10-15' }),
  // iRacing - Monza
  lap(17, 'VSD002', 'IRC', 'monza-gp', 'mclaren-720s-gt3', 105119, { verified: true, setup: true, date: '2025-10-17' }),
  lap(18, 'VSD005', 'IRC', 'monza-gp', 'audi-r8-lms-gt3', 105556, { verified: true, date: '2025-10-18' }),
  // iRacing - Nürburgring
  lap(19, 'VSD006', 'IRC', 'nurburgring-24h', 'mclaren-720s-gt3', 470234, { verified: true, setup: true, date: '2025-09-22' }),
  lap(20, 'VSD002', 'IRC', 'nurburgring-24h', 'audi-r8-lms-gt3', 471889, { verified: true, date: '2025-09-23' }),
  // iRacing - Silverstone Formula
  lap(21, 'VSD007', 'IRC', 'silverstone-gp', 'dallara-f312', 95234, { verified: true, date: '2025-10-21' }),
  lap(22, 'VSD007', 'IRC', 'silverstone-gp', 'mercedes-w13', 78112, { date: '2025-10-22' }),
  // iRacing - Sebring
  lap(23, 'VSD004', 'IRC', 'sebring-12h', 'mclaren-720s-gt3', 121445, { verified: true, setup: true, date: '2025-10-09' }),
  lap(24, 'VSD001', 'IRC', 'sebring-12h', 'audi-r8-lms-gt3', 122089, { verified: true, date: '2025-10-10' }),
  // ACE - Monza
  lap(25, 'VSD002', 'ACE', 'monza-gp', 'ferrari-296-gt3-ace', 105667, { verified: true, date: '2025-10-19' }),
  lap(26, 'VSD007', 'ACE', 'monza-gp', 'ferrari-296-gt3-ace', 106223, { date: '2025-10-20' }),
  // ACE - Mugello
  lap(27, 'VSD005', 'ACE', 'mugello-gp', 'ferrari-296-gt3-ace', 102556, { verified: true, setup: true, date: '2025-10-16' }),
  lap(28, 'VSD002', 'ACE', 'mugello-gp', 'ferrari-296-gt3-ace', 102998, { verified: true, date: '2025-10-17' }),
  // ACE - Spa wet
  lap(29, 'VSD006', 'ACE', 'spa-gp', 'ferrari-296-gt3-ace', 145122, { conditions: 'wet', verified: true, date: '2025-10-23' }),
  lap(30, 'VSD004', 'ACE', 'spa-gp', 'ferrari-296-gt3-ace', 144889, { conditions: 'wet', date: '2025-10-23' }),
];

// ---------- RACES ----------
// Date dinamiche calcolate al boot dell'app, così il countdown è sempre
// realistico in vetrina. Quando passeremo ad Apps Script, le date saranno
// reali del calendario team.
function fromNow(daysAhead, hour = 19, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

export const RACES = [
  {
    race_id: 'RACE_001',
    sim: 'LMU',
    series: 'VSD Endurance Cup',
    round: 5,
    title: 'Round 5 — 6h Spa-Francorchamps',
    track_id: 'spa-gp',
    date: fromNow(14, 19, 0), // tra 14 giorni alle 19
    duration_min: 360,
    car_categories: 'LMP2,LMH,GT3',
    weather: 'Mixed',
    status: 'scheduled',
    entries: ['VSD001', 'VSD003', 'VSD004', 'VSD006'],
    notes: 'Official championship round. Mandatory driver change every 2h.',
  },
  {
    race_id: 'RACE_002',
    sim: 'IRC',
    series: 'iRacing Special Event',
    round: 0,
    title: 'Bathurst 12h Special Event',
    track_id: 'silverstone-gp',
    date: fromNow(28, 4, 0), // tra 28 giorni, gara mattutina
    duration_min: 720,
    car_categories: 'GT3',
    weather: 'Clear',
    status: 'scheduled',
    entries: ['VSD002', 'VSD003', 'VSD005', 'VSD006'],
    notes: '12h endurance — 4 driver lineup.',
  },
  {
    race_id: 'RACE_003',
    sim: 'ACE',
    series: 'ACE Italian Series',
    round: 3,
    title: 'Round 3 — Mugello Sprint',
    track_id: 'mugello-gp',
    date: fromNow(7, 21, 0), // tra 7 giorni alle 21
    duration_min: 60,
    car_categories: 'GT3',
    weather: 'Clear',
    status: 'scheduled',
    entries: ['VSD002', 'VSD005', 'VSD007'],
    notes: 'Sprint race, 1h, no pit stop required.',
  },
  {
    race_id: 'RACE_004',
    sim: 'LMU',
    series: 'VSD Endurance Cup',
    round: 4,
    title: 'Round 4 — 4h Imola',
    track_id: 'imola-gp',
    date: fromNow(-30, 19, 0), // 30 giorni fa
    duration_min: 240,
    car_categories: 'GT3',
    weather: 'Clear',
    status: 'completed',
    entries: ['VSD001', 'VSD003', 'VSD006'],
    notes: 'Completed. Results in reports.',
  },
];

// ---------- RACE REPORTS ----------
export const RACE_REPORTS = [
  {
    report_id: 'RPT_001',
    race_id: 'RACE_004',
    driver_id: 'VSD001',
    grid_position: 3,
    finish_position: 2,
    best_lap_ms: 100887,
    incidents: 0,
    incident_notes: '',
    damage_report: 'No damage.',
    strategy_notes: '2-stop strategy, undercut on lap 38 worked.',
    staff_rating: 5,
    staff_notes: 'Solid race, perfect tire management.',
    created_at: '2025-10-25T23:30:00Z',
  },
  {
    report_id: 'RPT_002',
    race_id: 'RACE_004',
    driver_id: 'VSD003',
    grid_position: 5,
    finish_position: 4,
    best_lap_ms: 101104,
    incidents: 1,
    incident_notes: 'Light contact in T2 lap 12, no damage.',
    damage_report: 'Minor scuff, no penalty.',
    strategy_notes: 'Defensive race after contact.',
    staff_rating: 4,
    staff_notes: 'Recovered well from incident.',
    created_at: '2025-10-25T23:45:00Z',
  },
  {
    report_id: 'RPT_003',
    race_id: 'RACE_004',
    driver_id: 'VSD006',
    grid_position: 8,
    finish_position: 6,
    best_lap_ms: 101502,
    incidents: 0,
    incident_notes: '',
    damage_report: 'No damage.',
    strategy_notes: 'Long first stint, gained 2 positions in pit cycle.',
    staff_rating: 4,
    staff_notes: 'Consistent pace, smart strategy.',
    created_at: '2025-10-26T00:10:00Z',
  },
];