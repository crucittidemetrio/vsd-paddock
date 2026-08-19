import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

/**
 * useAcademyRanking — classifica VR (Punti Merito) per un simulatore.
 *
 * Fase 1: solo Punti Merito da RaceResults, nessuna penalità, nessun
 * badge, nessuno scoping stagionale. Vedi apps-script/Academy.js per
 * lo scope esatto — questa è una classifica di anteprima, non il VR
 * definitivo della spec VPR.
 *
 * @param {'LMU'|'IRC'|'ACE'} sim
 */
export function useAcademyRanking(sim) {
  return useQuery({
    queryKey: ['academy', 'ranking', sim],
    queryFn: () => api.academy.ranking(sim),
    enabled: Boolean(sim),
    staleTime: 60_000,
  });
}
