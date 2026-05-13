import { useQuery } from '@tanstack/react-query';
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