import './StatusDot.css';

/**
 * Pallino di stato pilota.
 * - status: 'active' | 'trial' | 'inactive'
 * - withLabel: se true mostra anche il testo accanto
 */
const STATUS_META = {
  active:   { color: 'var(--color-success)', label: 'Attivo' },
  trial:    { color: 'var(--vsd-orange)',    label: 'In prova' },
  inactive: { color: 'var(--color-text-dim)', label: 'Inattivo' },
};

export default function StatusDot({ status = 'active', withLabel = false }) {
  const meta = STATUS_META[status] || STATUS_META.active;
  return (
    <span className="status-pill">
      <span className="status-dot-inner" style={{ background: meta.color, boxShadow: `0 0 8px ${meta.color}` }} />
      {withLabel && <span className="status-label" style={{ color: meta.color }}>{meta.label}</span>}
    </span>
  );
}