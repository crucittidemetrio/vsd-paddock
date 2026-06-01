import { useAuth } from '../../hooks/useAuth';

/**
 * Wrapper che mostra i children solo se il tier corrente è ≥ minTier.
 * Altrimenti renderizza il fallback (default: null).
 *
 * Tier supportati (definiti in src/utils/constants.js):
 *   'anonymous' | 'guest' | 'pilot_vsd' | 'staff' | 'admin'
 *
 * Esempi:
 *   <RequireTier minTier="pilot_vsd">...</RequireTier>
 *   <RequireTier minTier="staff" fallback={<LoginPrompt />}>...</RequireTier>
 *
 * NB: questo è UI gating, non sicurezza vera. Ogni endpoint backend
 * sensibile deve validare il tier autonomamente (ctx.isStaff, etc).
 */
export default function RequireTier({ minTier, fallback = null, children }) {
  const { hasAtLeast, loading } = useAuth();
  if (loading) return null;
  return hasAtLeast(minTier) ? children : fallback;
}
