import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

/**
 * Campionati disputati da un pilota VSD.
 * Ritorna { participations: [...] } con posizione, punti e classe per ogni campionato.
 *
 * @param {string} driverId
 */
export function useChampionshipsByDriver(driverId) {
  return useQuery({
    queryKey: ['standings', 'byDriver', driverId],
    queryFn: () => api.standings.byDriver(driverId),
    enabled: Boolean(driverId),
    staleTime: 5 * 60_000,
  });
}
