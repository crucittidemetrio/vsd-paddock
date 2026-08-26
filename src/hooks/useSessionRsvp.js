import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

const QK = {
  list: (sessionId) => ['sessionRsvp', 'list', sessionId || 'none'],
};

/**
 * useSessionRsvp — chi ha confermato/declinato/è incerto per una
 * sessione team (ADR-Team-Scheduler Fase 2). Gemello di useRaceRSVP,
 * stesso comportamento su session_id invece di race_id.
 *
 * @param {string} sessionId - obbligatorio. Se omesso, query disabilitata.
 */
export function useSessionRsvp(sessionId) {
  return useQuery({
    queryKey: QK.list(sessionId),
    queryFn: () => api.sessionRsvp.list(sessionId),
    select: (data) => data?.rsvps || [],
    staleTime: 30 * 1000,
    enabled: !!sessionId,
  });
}

/**
 * useSetSessionRsvp — il pilota loggato imposta/aggiorna la propria
 * risposta per una sessione. Payload: { session_id, status, note? }
 */
export function useSetSessionRsvp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.sessionRsvp.set(payload),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: QK.list(variables?.session_id) });
    },
  });
}
