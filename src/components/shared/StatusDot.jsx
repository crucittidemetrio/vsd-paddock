import './StatusDot.css';

/**
 * Pallino di stato pilota.
 * - status: 'active' | 'trial' | 'inactive'
 * - withLabel: se true mostra anche il testo accanto
 * - online: true/false se sappiamo se il pilota sta usando vsd-paddock
 *   ORA (vedi hooks/usePresence). undefined = dato non tracciato in
 *   questa vista → si mantiene il vecchio comportamento (verde fisso
 *   per chi è "attivo" in roster).
 */
const STATUS_META = {
  active:   { color: 'var(--color-success)', label: 'Attivo' },
  trial:    { color: 'var(--vsd-orange)',    label: 'In prova' },
  inactive: { color: 'var(--color-text-dim)', label: 'Inattivo' },
};

export default function StatusDot({ status = 'active', withLabel = false, online }) {
  const meta = STATUS_META[status] || STATUS_META.active;

  // Il verde "vivo" ora significa "sta usando vsd-paddock in questo
  // momento", non solo "è in roster attivo" — ma solo quando la vista
  // chiamante traccia davvero la presenza (online !== undefined).
  const tracksPresence = status === 'active' && online !== undefined;
  const isLiveNow = tracksPresence && online === true;
  const dotColor = tracksPresence && !isLiveNow ? 'var(--color-text-dim)' : meta.color;
  const glow = tracksPresence && !isLiveNow ? 'none' : `0 0 8px ${dotColor}`;

  return (
    <span className="status-pill">
      <span className="status-dot-inner" style={{ background: dotColor, boxShadow: glow }} />
      {withLabel && <span className="status-label" style={{ color: meta.color }}>{meta.label}</span>}
    </span>
  );
}