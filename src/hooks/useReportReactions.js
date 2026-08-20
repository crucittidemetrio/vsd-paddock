import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

/**
 * useReportReactions — tutte le reazioni sui Race Report (dataset piccolo,
 * caricato intero e raggruppato client-side per report_id, stesso pattern
 * già usato per reports.list).
 */
export function useReportReactions() {
  return useQuery({
    queryKey: ['reportReactions'],
    queryFn: () => api.reportReactions.list(),
  });
}

/**
 * useToggleReportReaction — imposta/toglie/sostituisce la reazione del
 * pilota loggato su un report. Invalida la lista reazioni al successo.
 */
export function useToggleReportReaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ report_id, emoji }) => api.reportReactions.toggle(report_id, emoji),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reportReactions'] });
    },
  });
}
