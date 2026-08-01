import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

/**
 * useTrainingInsights — riepilogo allenamento per pilota (giri 7g/30g,
 * gap dal record squadra per pista) + readiness pre-gara, calcolato da
 * BestLaps (vedi apps-script/TrainingInsights.js per lo scope esatto).
 *
 * @param {'LMU'|'IRC'|'ACE'} [sim] - default 'LMU' lato backend
 * @param {string} [trackId] - forza la readiness su questo tracciato
 *   invece che sulla pista della prossima gara (default lato backend)
 */
export function useTrainingInsights(sim, trackId) {
  return useQuery({
    queryKey: ['training', 'insights', sim || 'LMU', trackId || 'next-race'],
    queryFn: () => api.training.insights(sim, trackId),
    staleTime: 60_000,
  });
}
