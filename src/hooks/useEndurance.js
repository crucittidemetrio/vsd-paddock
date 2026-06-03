import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

// ═══════════════════════════════════════════════════════════
// READ HOOKS
// ═══════════════════════════════════════════════════════════

/**
 * Lista audition con filtri opzionali.
 * Anonymous vede solo audition pubblicate (status != draft).
 * Staff vede tutto.
 *
 * @param {Object} filters - { status?: string, sim?: string }
 */
export function useAuditions(filters = {}) {
  return useQuery({
    queryKey: ['endurance', 'auditions', filters],
    queryFn: () => api.endurance.auditions.list(filters),
    staleTime: 60 * 1000, // 1 min cache lato client
  });
}

/**
 * Dettaglio singola audition.
 *
 * @param {string} auditionId
 */
export function useAudition(auditionId) {
  return useQuery({
    queryKey: ['endurance', 'audition', auditionId],
    queryFn: () => api.endurance.auditions.get(auditionId),
    enabled: !!auditionId,
    staleTime: 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════
// MUTATIONS (admin/staff only)
// ═══════════════════════════════════════════════════════════

/**
 * Crea audition (staff only).
 * Invalida cache auditions on success.
 */
export function useCreateAudition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.endurance.auditions.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['endurance', 'auditions'] });
    },
  });
}

/**
 * Aggiorna audition esistente (staff only).
 * Invalida cache auditions + dettaglio singola.
 */
export function useUpdateAudition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.endurance.auditions.update(payload),
    onSuccess: (data, variables) => {
      qc.invalidateQueries({ queryKey: ['endurance', 'auditions'] });
      if (variables?.audition_id) {
        qc.invalidateQueries({ queryKey: ['endurance', 'audition', variables.audition_id] });
      }
    },
  });
}
