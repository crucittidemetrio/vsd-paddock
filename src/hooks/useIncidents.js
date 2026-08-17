import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from './useAuth';

/**
 * useIncidents — registro incidenti/steward (staff only). Unisce le
 * segnalazioni del Modulo reclamo pubblico (sola lettura) con lo stato
 * formalizzato dallo staff.
 */
export function useIncidents(status) {
  const { isStaff } = useAuth();
  return useQuery({
    queryKey: ['incidents', 'list', status || 'all'],
    queryFn: () => api.incidents.list(status ? { status } : {}),
    select: (data) => data?.incidents || [],
    enabled: isStaff,
    staleTime: 30_000,
  });
}

export function useResolveIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.incidents.resolve(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incidents', 'list'] });
    },
  });
}
