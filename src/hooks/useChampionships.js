import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

/**
 * Hook per leggere i championships con filtri opzionali.
 *
 * @param {Object} opts
 * @param {string} [opts.sim]      'LMU' | 'IRC' | 'ACE'
 * @param {string} [opts.status]   'active' | 'upcoming' | 'completed' | 'draft'
 * @param {string} [opts.season]   '2026'
 * @param {boolean} [opts.enabled=true]
 */
export function useChampionships({ sim, status, season, enabled = true } = {}) {
  return useQuery({
    queryKey: ['championships', { sim, status, season }],
    queryFn: () => api.championships.list({ sim, status, season }),
    enabled: Boolean(enabled),
    staleTime: 5 * 60_000, // 5 min — campionati cambiano raramente
  });
}

/**
 * #387/#395: creazione campionato self-service (staff/admin). Genera
 * automaticamente lo slug id dal nome — vedi championships-add/index.ts.
 */
export function useAddChampionship() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.championships.add(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['championships'] });
    },
  });
}

/**
 * #387/#395: modifica campionato esistente (staff/admin). Whitelist di
 * campi editabili lato Edge Function — vedi championships-update/index.ts.
 */
export function useUpdateChampionship() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.championships.update(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['championships'] });
    },
  });
}