import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

export function useRaces(status) {
  return useQuery({
    queryKey: ['races', status],
    queryFn: () => api.races.list(status),
  });
}

export function useUpcomingRaces() {
  return useQuery({
    queryKey: ['races', 'upcoming'],
    queryFn: () => api.races.upcoming(),
  });
}

export function useRace(raceId) {
  return useQuery({
    queryKey: ['race', raceId],
    queryFn: () => api.races.get(raceId),
    enabled: !!raceId,
  });
}

export function useReports(filters = {}) {
  return useQuery({
    queryKey: ['reports', filters],
    queryFn: () => api.reports.list(filters),
  });
}

export function useRecentReports(limit = 5) {
  return useQuery({
    queryKey: ['reports', 'recent', limit],
    queryFn: () => api.reports.recent(limit),
  });
}