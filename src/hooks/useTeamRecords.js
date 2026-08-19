import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

/**
 * useTeamRecords — muro dei record: giro più veloce di sempre per
 * ogni pista, per sim. Solo tesserati attivi di default (vedi
 * apps-script/Records.js per lo scope esatto).
 *
 * @param {'LMU'|'IRC'|'ACE'} [sim] - se omesso, tutti i sim
 * @param {boolean} [includeExVsd] - include anche gli ex piloti come
 *   detentori. Onorato dal backend solo se l'utente è admin — passarlo
 *   per un utente non-admin è innocuo, il backend lo ignora comunque.
 */
export function useTeamRecords(sim, includeExVsd) {
  return useQuery({
    queryKey: ['records', 'team', sim || 'all', includeExVsd ? 'withEx' : 'activeOnly'],
    queryFn: () => api.records.team(sim, includeExVsd),
    staleTime: 60_000,
  });
}
