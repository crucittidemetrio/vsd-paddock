import './LapTime.css';

/**
 * Formattatore tempo sul giro.
 * Accetta ms (numero) o stringa già formattata.
 * - ms: 83456 → "1:23.456"
 * - emphasis: 'best' | 'normal' | 'dim'
 * - size: 'sm' | 'md' | 'lg'
 */
export function formatMs(ms) {
  if (typeof ms !== 'number' || isNaN(ms)) return '—';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const mil = ms % 1000;
  return `${m}:${String(s).padStart(2, '0')}.${String(mil).padStart(3, '0')}`;
}

export default function LapTime({ ms, display, emphasis = 'normal', size = 'md' }) {
  const text = display || formatMs(ms);
  return (
    <span className={`lap-time lap-time-${size} lap-time-${emphasis}`}>
      {text}
    </span>
  );
}