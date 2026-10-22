import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

export function useRaces(status) {
  return useQuery({
    queryKey: ['races', status],
    queryFn: () => api.races.list(status),
  });
}

// `enabled: false` usato dalla sidebar per gli ospiti: races.upcoming
// richiede l'accesso (per un ospite risponde lista vuota e sovrascriveva
// in cache i dati buoni già messi da landing.data). Con enabled=false la
// query legge solo la cache popolata da useLandingData.
export function useUpcomingRaces({ enabled = true } = {}) {
  return useQuery({
    queryKey: ['races', 'upcoming'],
    queryFn: () => api.races.upcoming(),
    enabled,
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
/**
 * useSubmitOwnReport — 22/10/2026: il pilota compila il PROPRIO report
 * (racconto, momento chiave, foto, ok social). Al primo invio il backend
 * notifica #team-principal. Invalida tutte le query 'reports'.
 */
export function useSubmitOwnReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fields) => api.reports.submitOwn(fields),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reports'] });
    },
  });
}

export function useUpdateReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ report_id, ...fields }) => api.reports.update(report_id, fields),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reports'] });
    },
  });
}