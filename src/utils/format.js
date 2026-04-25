// ===========================================
// VSD PADDOCK — Helper di formattazione
// ===========================================

const TRACK_NAMES = {
  'spa-gp': 'Spa-Francorchamps',
  'lemans-24h': 'Le Mans 24h',
  'monza-gp': 'Monza',
  'imola-gp': 'Imola',
  'fuji-gp': 'Fuji',
  'nurburgring-24h': 'Nürburgring',
  'silverstone-gp': 'Silverstone',
  'sebring-12h': 'Sebring',
  'mugello-gp': 'Mugello',
};

const CAR_NAMES = {
  'ferrari-296-gt3': 'Ferrari 296 GT3',
  'ferrari-296-gt3-ace': 'Ferrari 296 GT3',
  'bmw-m4-gt3': 'BMW M4 GT3',
  'porsche-992-gt3-r': 'Porsche 992 GT3 R',
  'mclaren-720s-gt3': 'McLaren 720S GT3',
  'audi-r8-lms-gt3': 'Audi R8 LMS',
  'oreca-07': 'Oreca 07',
  'porsche-963': 'Porsche 963',
  'ferrari-499p': 'Ferrari 499P',
  'cadillac-vseries-r': 'Cadillac V-R',
  'dallara-f312': 'Dallara F3',
  'mercedes-w13': 'Mercedes W13',
};

export function formatTrack(track_id) {
  return TRACK_NAMES[track_id] || track_id || '—';
}

export function formatCar(car_id) {
  return CAR_NAMES[car_id] || car_id || '—';
}

export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: '2-digit' });
}

export function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('it-IT', {
    day: '2-digit', month: 'short', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Differenza tempo in ms vs reference.
 * 83456 vs 83000 → "+0.456"
 * 83000 vs 83456 → "-0.456"
 */
export function formatLapDelta(ms, refMs) {
  if (typeof ms !== 'number' || typeof refMs !== 'number') return '';
  const delta = ms - refMs;
  if (delta === 0) return '—';
  const sec = (delta / 1000).toFixed(3);
  return delta > 0 ? `+${sec}` : sec;
}
/**
 * Countdown da una data ISO. Restituisce { days, hours, minutes, isPast }
 * Se la data è passata, isPast=true e i valori sono assoluti.
 */
export function countdown(iso) {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  const now = Date.now();
  const diff = target - now;
  const abs = Math.abs(diff);
  const days = Math.floor(abs / 86400000);
  const hours = Math.floor((abs % 86400000) / 3600000);
  const minutes = Math.floor((abs % 3600000) / 60000);
  return { days, hours, minutes, isPast: diff < 0 };
}

/**
 * Formato breve countdown: "14g 3h" / "3h 22m" / "22m"
 */
export function formatCountdown(iso) {
  const c = countdown(iso);
  if (!c) return '—';
  if (c.isPast) return 'Conclusa';
  if (c.days > 0) return `${c.days}g ${c.hours}h`;
  if (c.hours > 0) return `${c.hours}h ${c.minutes}m`;
  return `${c.minutes}m`;
}

/**
 * Data + ora con timezone locale: "8 nov 25 · 19:00"
 */
export function formatRaceDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const date = d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: '2-digit' });
  const time = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${time}`;
}

/**
 * Durata in minuti → "6h" / "4h 30min" / "60min"
 */
export function formatDuration(minutes) {
  if (!minutes) return '—';
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}