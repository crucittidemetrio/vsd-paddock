import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

/**
 * useUpdateReport — #446: edit staff/admin dei campi Race Report
 * (strategy_notes/incident_notes/staff_rating/staff_notes). Invalida
 * tutte le query 'reports' al successo (list + recent, con qualsiasi
 * combinazione di filtri/limit in cache).
 */
export function useUpdateReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ report_id, ...fields }) => api.reports.update(report_id, fields),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reports'] });
    },
  });
}