import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from './useAuth';

/**
 * Registro di controllo azioni admin (AuditLog). Solo admin/Team Principal
 * — stesso gate del backend (ctx.isStaff), ma qui usiamo isAdmin per
 * restringere ulteriormente lato UI, coerente col resto di ADMIN_ONLY_ITEMS.
 *
 * @param {Object} params - { action, driver_id, q, limit, offset }
 */
export function useAuditLog(params = {}) {
  const { isAdmin } = useAuth();
  return useQuery({
    queryKey: ['auditLog', 'list', params],
    queryFn: () => api.auditLog.list(params),
    enabled: isAdmin,
    staleTime: 15_000,
  });
}
