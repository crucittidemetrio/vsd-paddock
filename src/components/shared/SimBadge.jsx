import { SIMS } from '../../utils/constants';
import './SimBadge.css';

/**
 * Badge colorato per identificare il simulatore.
 * - sim: 'LMU' | 'IRC' | 'ACE'
 * - variant: 'solid' (pieno) | 'outline' (default)
 * - size: 'sm' | 'md'
 */
export default function SimBadge({ sim, variant = 'outline', size = 'md' }) {
  const meta = SIMS[sim];
  if (!meta) return null;
  return (
    <span
      className={`sim-badge sim-badge-${variant} sim-badge-${size} sim-${sim.toLowerCase()}`}
      title={meta.name}
    >
      {meta.short}
    </span>
  );
}