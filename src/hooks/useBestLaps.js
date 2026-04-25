import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

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

export function useTracks(sim) {
  return useQuery({
    queryKey: ['tracks', sim],
    queryFn: () => api.lookups.tracks(sim),
    staleTime: 5 * 60_000, // tracks cambiano raramente
  });
}

export function useCars(sim) {
  return useQuery({
    queryKey: ['cars', sim],
    queryFn: () => api.lookups.cars(sim),
    staleTime: 5 * 60_000,
  });
}