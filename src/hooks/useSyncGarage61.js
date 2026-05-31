import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

/**
 * Mutation hook per l'action admin laps.syncFromGarage61.
 * Su success invalida tutte le query (necessario perché il sync impatta
 * BestLaps che alimenta più viste: Leaderboard, Race Laps, I miei tempi,
 * stats nei profili pilota).
 */
export function useSyncGarage61() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.laps.syncFromGarage61(),
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });
}
