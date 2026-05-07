import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

// Re-export dei lookup hooks: single source of truth in useLookups.js.
// Mantiene retrocompatibilità con import esistenti da './useBestLaps'.
export { useTracks, useCars } from './useLookups';

export function useBestLaps(filters = {}, limit) {
  return useQuery({
    queryKey: ['laps', filters, limit],
    queryFn: () => api.laps.list(filters, limit),
  });
}

export function useLeaderboard(sim, trackId, carId) {
  return useQuery({
    queryKey: ['leaderboard', sim, trackId, carId],
    queryFn: () => api.laps.leaderboard(sim, trackId, carId),
    enabled: !!sim && !!trackId,
  });
}