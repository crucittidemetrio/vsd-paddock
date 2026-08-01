import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

/**
 * useTrainingInsights — riepilogo allenamento per pilota (giri 7g/30g,
 * gap dal record squadra per pista) + readiness pre-gara, calcolato da
 * BestLaps (vedi apps-script/TrainingInsights.js per lo scope esatto).
 *
 * @param {'LMU'|'IRC'|'ACE'} [sim] - default 'LMU' lato backend
 */
export function useTrainingInsights(sim) {
  return useQuery({
    queryKey: ['training', 'insights', sim || 'LMU'],
    queryFn: () => api.training.insights(sim),
    staleTime: 60_000,
  });
}
