import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

/**
 * useTeamRecords — muro dei record: giro più veloce di sempre per
 * ogni pista, per sim. Solo tesserati attivi (vedi
 * apps-script/Records.js per lo scope esatto).
 *
 * @param {'LMU'|'IRC'|'ACE'} [sim] - se omesso, tutti i sim
 */
export function useTeamRecords(sim) {
  return useQuery({
    queryKey: ['records', 'team', sim || 'all'],
    queryFn: () => api.records.team(sim),
    staleTime: 60_000,
  });
}
