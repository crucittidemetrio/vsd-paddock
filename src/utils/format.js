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

export function formatTrack(track_id, tracks) {
  if (!track_id) return '—';
  if (Array.isArray(tracks)) {
    const t = tracks.find(t => String(t.track_id).toLowerCase() === String(track_id).toLowerCase());
    if (t) return t.track_name || track_id;
  }
  return TRACK_NAMES[track_id] || track_id;
}

export function formatTrackInfo(track_id, tracks) {
  if (!track_id) return { name: '—', sim: null };
  if (Array.isArray(tracks)) {
    const t = tracks.find(t => String(t.track_id).toLowerCase() === String(track_id).toLowerCase());
    if (t) return { name: t.track_name || track_id, sim: t.sim || null };
  }
  const name = TRACK_NAMES[track_id] || track_id;
  const simMatch = String(track_id).match(/^(lmu|irc|ace)-/i);
  const sim = simMatch ? simMatch[1].toUpperCase() : null;
  return { name, sim };
}

export function formatCar(car_id, cars) {
  if (!car_id) return '—';
  if (Array.isArray(cars)) {
    const c = cars.find(c => String(c.car_id).toLowerCase() === String(car_id).toLowerCase());
    if (c) return c.car_name || car_id;
  }
  return CAR_NAMES[car_id] || car_id;
}

/**
 * Versione "ricca" di formatCar: restituisce nome + categoria + race_class.
 *
 * @param {string} car_id
 * @param {Array} [cars] - Lista live delle cars dal backend
 * @returns {{ name: string, category: string|null, race_class: string|null, sim: string|null }}
 */
export function formatCarInfo(car_id, cars) {
  if (!car_id) return { name: '—', category: null, race_class: null, sim: null };

  if (Array.isArray(cars)) {
    const c = cars.find(c => String(c.car_id).toLowerCase() === String(car_id).toLowerCase());
    if (c) {
      return {
        name: c.car_name || car_id,
        category: c.category || null,
        race_class: (c.race_class && String(c.race_class).trim()) || null,
        sim: c.sim || null,
      };
    }
  }

  const name = CAR_NAMES[car_id] || car_id;
  const simMatch = String(car_id).match(/^(lmu|irc|ace)-/i);
  return {
    name,
    category: null,
    race_class: null,
    sim: simMatch ? simMatch[1].toUpperCase() : null,
  };
}

// Stringhe "data pura" YYYY-MM-DD (senza ora/timezone, es. scheduled_date,
// set_date) — per spec ECMA-262 `new Date('2026-08-01')` le interpreta come
// UTC mezzanotte, e toLocaleDateString le riconverte al fuso del browser.
// Con un fuso negativo (o mal configurato) questo fa apparire il giorno
// PRIMA di quello reale — bug osservato il 1 ago 2026 (post programmato
// per il 1/8 mostrato come 31/7). Fix: se la stringa è data-pura, si
// parsano manualmente i componenti Y/M/D in un Date locale, saltando del
// tutto il giro UTC→locale. Le stringhe con ora/timezone (timestamp reali)
// non sono toccate: per quelle la conversione al fuso locale è corretta.
const DATE_ONLY_RE_ = /^\d{4}-\d{2}-\d{2}$/;

function parseDateSafe_(iso) {
  if (DATE_ONLY_RE_.test(iso)) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(iso);
}

export function formatDate(iso) {
  if (!iso) return '—';
  const d = parseDateSafe_(iso);
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: '2-digit' });
}

export function formatDateTime(iso) {
  if (!iso) return '—';
  const d = parseDateSafe_(iso);
  return d.toLocaleString('it-IT', {
    day: '2-digit', month: 'short', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Differenza tempo in ms vs reference.
 * 83456 vs 83000 → "+0.456"
 * 83000 vs 83456 → "-0.456"
 *
 * Wave Sprint 0 (7 giu 2026): guard rinforzato con Number.isFinite per
 * gestire NaN/Infinity/null/undefined uniformemente. Return '—' allineato
 * con altre funzioni format invece del precedente '' (empty string).
 */
export function formatLapDelta(ms, refMs) {
  if (!Number.isFinite(ms) || !Number.isFinite(refMs)) return '—';
  const delta = ms - refMs;
  if (delta === 0) return '—';
  const sec = (delta / 1000).toFixed(3);
  return delta > 0 ? `+${sec}` : sec;
}

/**
 * Gap tempo in ms + percentuale relativa al record.
 * 85394 vs 83000 → "+2.394s / +1.18%"
 * 83000 vs 83000 → "—" (record holder, gestire badge separato in UI)
 *
 * Numeri negativi (caso impossibile se chiamato correttamente: il mio tempo
 * non può essere migliore del record team) sono comunque gestiti.
 *
 * Wave Sprint 0 (7 giu 2026): null-check esplicito prima della coercion
 * Number() per evitare Number(null) === 0 false-positive. Return '—' per
 * tutti gli input invalid invece del precedente '' (uniformità UI).
 */
export function formatGapPercent(myMs, recordMs) {
  if (myMs == null || recordMs == null) return '—';
  const my = Number(myMs);
  const rec = Number(recordMs);
  if (!Number.isFinite(my) || !Number.isFinite(rec) || rec <= 0) return '—';
  const gapMs = my - rec;
  if (gapMs === 0) return '—';
  const gapS = (gapMs / 1000).toFixed(3);
  const gapPct = ((gapMs / rec) * 100).toFixed(2);
  const sign = gapMs > 0 ? '+' : '';
  return `${sign}${gapS}s / ${sign}${gapPct}%`;
}

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

export function formatCountdown(iso) {
  const c = countdown(iso);
  if (!c) return '—';
  if (c.isPast) return 'Conclusa';
  if (c.days > 0) return `${c.days}g ${c.hours}h`;
  if (c.hours > 0) return `${c.hours}h ${c.minutes}m`;
  return `${c.minutes}m`;
}

export function formatRaceDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const date = d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: '2-digit' });
  const time = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${time}`;
}

/**
 * Formatta una durata in minuti in stringa human-readable.
 * 30  → "30min"
 * 60  → "1h"
 * 90  → "1h 30min"
 * 120 → "2h"
 *
 * Wave Sprint 0 (7 giu 2026): guard rinforzato con Number.isFinite + check
 * negativi. Zero ora ritorna "0min" (valid valore = zero duration esplicita)
 * invece del precedente "—" (che confondeva missing data con zero).
 * Negativi e null/undefined/NaN ritornano "—".
 */
export function formatDuration(minutes) {
  if (!Number.isFinite(minutes) || minutes < 0) return '—';
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}
