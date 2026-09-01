import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

/**
 * usePitwallSessions — elenco sessioni registrate dal Pitwall Bridge
 * (best lap per pilota, snapshot automatico a fine sessione). Sola
 * lettura: la scrittura (pitwall.logSession) la fa solo il bridge C#
 * via HTTP diretto, mai il frontend.
 */
export function usePitwallSessions() {
  return useQuery({
    queryKey: ['pitwall', 'sessions'],
    queryFn: () => api.pitwall.sessions(),
    staleTime: 30_000,
  });
}

/**
 * usePitwallSession — dettaglio classifica finale (best lap) di una
 * sessione registrata.
 */
export function usePitwallSession(sessionId) {
  return useQuery({
    queryKey: ['pitwall', 'session', sessionId],
    queryFn: () => api.pitwall.session(sessionId),
    enabled: Boolean(sessionId),
  });
}
