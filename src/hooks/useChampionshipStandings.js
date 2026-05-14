import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

/**
 * Standings aggregati di un campionato (per classe, con tie-break).
 *
 * @param {string} championshipId
 * @param {Object} [options]
 * @param {boolean} [options.enabled=true]
 */
export function useChampionshipStandings(championshipId, options = {}) {
  return useQuery({
    queryKey: ['standings', 'byChampionship', championshipId],
    queryFn: () => api.standings.byChampionship(championshipId),
    enabled: Boolean(championshipId) && options.enabled !== false,
    staleTime: 60_000,
  });
}