import { useNow } from '../../hooks/useNow';
import './CountdownLive.css';

/**
 * Countdown live con tick al secondo.
 * Mostra giorni / ore / minuti / secondi. Se nel passato → "Conclusa".
 */
export default function CountdownLive({ targetIso, size = 'md' }) {
  const now = useNow(1000);
  if (!targetIso) return null;

  const target = new Date(targetIso).getTime();
  const diff = target - now;

  if (diff <= 0) {
    return <div className={`cd-live cd-${size} is-past`}>Conclusa</div>;
  }

  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);

  return (
    <div className={`cd-live cd-${size}`}>
      <CdUnit value={days} label="giorni" />
      <CdSep />
      <CdUnit value={hours} label="ore" />
      <CdSep />
      <CdUnit value={minutes} label="min" />
      <CdSep />
      <CdUnit value={seconds} label="sec" />
    </div>
  );
}

function CdUnit({ value, label }) {
  return (
    <div className="cd-unit">
      <div className="cd-num">{String(value).padStart(2, '0')}</div>
      <div className="cd-lbl">{label}</div>
    </div>
  );
}

function CdSep() {
  return <div className="cd-sep">:</div>;
}