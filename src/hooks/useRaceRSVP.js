import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

const QK = {
  list: (raceId) => ['rsvp', 'list', raceId || 'none'],
};

/**
 * useRaceRSVP — chi ha confermato/declinato/è incerto per una gara.
 * Visibile a chiunque sia loggato (non solo staff): serve al team per
 * sapere chi ci sarà, non solo a chi organizza.
 *
 * @param {string} raceId - race_id obbligatorio. Se omesso, query disabilitata.
 */
export function useRaceRSVP(raceId) {
  return useQuery({
    queryKey: QK.list(raceId),
    queryFn: () => api.rsvp.list(raceId),
    select: (data) => data?.rsvps || [],
    staleTime: 30 * 1000,
    enabled: !!raceId,
  });
}

/**
 * useSetRSVP — il pilota loggato imposta/aggiorna la propria risposta.
 * Payload: { race_id, status: 'confirmed'|'declined'|'tentative', note? }
 */
export function useSetRSVP() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.rsvp.set(payload),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: QK.list(variables?.race_id) });
    },
  });
}
