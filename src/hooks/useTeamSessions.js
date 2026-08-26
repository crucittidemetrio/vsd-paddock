import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

const QK = ['teamSessions', 'list'];

/**
 * Lista sessioni team (allenamenti, qualifiche, riunioni). Auth
 * richiesta lato backend (visibile a chiunque sia loggato, non solo
 * staff) — ADR-Team-Scheduler Fase 1.
 */
export function useTeamSessions(options = {}) {
  return useQuery({
    queryKey: QK,
    queryFn: () => api.teamSessions.list(),
    staleTime: 30 * 1000,
    enabled: options.enabled !== undefined ? options.enabled : true,
  });
}

/**
 * Crea una sessione team (staff/admin only lato backend).
 * Payload: { type, title, datetime_start, duration_min?, championship_id?,
 *            event_id?, track_id?, sim?, discord_channel?, notes? }
 */
export function useCreateTeamSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.teamSessions.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
    },
  });
}

/**
 * Aggiorna una sessione team esistente (staff/admin only).
 * Payload: { session_id, ...campi da aggiornare }
 */
export function useUpdateTeamSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.teamSessions.update(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
    },
  });
}

/**
 * Elimina una sessione team (staff/admin only, hard delete).
 */
export function useRemoveTeamSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (session_id) => api.teamSessions.remove(session_id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
    },
  });
}
