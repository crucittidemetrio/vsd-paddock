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

/**
 * Formatta un track_id in display name.
 * 
 * @param {string} track_id - Slug del tracciato (es. 'lmu-monza-gp')
 * @param {Array} [tracks] - Lista live dei tracks dal backend (opzionale)
 * @returns {string} Display name (legacy single-string mode)
 * 
 * Se vuoi anche il sim (per badge separato), usa formatTrackInfo() invece.
 */
export function formatTrack(track_id, tracks) {
  if (!track_id) return '—';
  
  // Modo data-driven: cerca il record live dal sheet
  if (Array.isArray(tracks)) {
    const t = tracks.find(t => String(t.track_id).toLowerCase() === String(track_id).toLowerCase());
    if (t) return t.track_name || track_id;
  }
  
  // Fallback legacy: mappa hardcoded
  return TRACK_NAMES[track_id] || track_id;
}

/**
 * Versione "ricca" di formatTrack: restituisce nome + sim per badge separati.
 * 
 * @param {string} track_id
 * @param {Array} [tracks] - Lista live dei tracks dal backend
 * @returns {{ name: string, sim: string|null }}
 * 
 * Esempio:
 *   const { name, sim } = formatTrackInfo('lmu-monza-gp', tracks);
 *   // → { name: 'Monza', sim: 'LMU' }
 */
export function formatTrackInfo(track_id, tracks) {
  if (!track_id) return { name: '—', sim: null };
  
  if (Array.isArray(tracks)) {
    const t = tracks.find(t => String(t.track_id).toLowerCase() === String(track_id).toLowerCase());
    if (t) return { name: t.track_name || track_id, sim: t.sim || null };
  }
  
  // Fallback: cerca nel hardcoded e prova a estrarre il sim dallo slug
  const name = TRACK_NAMES[track_id] || track_id;
  const simMatch = String(track_id).match(/^(lmu|irc|ace)-/i);
  const sim = simMatch ? simMatch[1].toUpperCase() : null;
  return { name, sim };
}

/**
 * Formatta un car_id in display name.
 * 
 * @param {string} car_id - Slug auto (es. 'lmu-ferrari-296-gt3')
 * @param {Array} [cars] - Lista live delle cars dal backend (opzionale)
 * @returns {string} Display name (legacy single-string mode)
 */
export function formatCar(car_id, cars) {
  if (!car_id) return '—';
  
  if (Array.isArray(cars)) {
    const c = cars.find(c => String(c.car_id).toLowerCase() === String(car_id).toLowerCase());
    if (c) return c.car_name || car_id;
  }
  
  return CAR_NAMES[car_id] || car_id;
}

/**
 * Versione "ricca" di formatCar: restituisce nome + categoria.
 * 
 * @param {string} car_id
 * @param {Array} [cars] - Lista live delle cars dal backend
 * @returns {{ name: string, category: string|null, sim: string|null }}
 */
export function formatCarInfo(car_id, cars) {
  if (!car_id) return { name: '—', category: null, sim: null };
  
  if (Array.isArray(cars)) {
    const c = cars.find(c => String(c.car_id).toLowerCase() === String(car_id).toLowerCase());
    if (c) {
      return {
        name: c.car_name || car_id,
        category: c.category || null,
        sim: c.sim || null,
      };
    }
  }
  
  const name = CAR_NAMES[car_id] || car_id;
  const simMatch = String(car_id).match(/^(lmu|irc|ace)-/i);
  return {
    name,
    category: null,
    sim: simMatch ? simMatch[1].toUpperCase() : null,
  };
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