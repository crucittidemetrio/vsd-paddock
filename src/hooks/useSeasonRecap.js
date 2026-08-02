import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

/**
 * useSeasonRecap — riepilogo stagionale personale (solo il proprio,
 * Fase 1 — vedi apps-script/SeasonRecap.js per lo scope esatto).
 */
export function useSeasonRecap() {
  return useQuery({
    queryKey: ['recap', 'mine'],
    queryFn: () => api.recap.mine(),
    staleTime: 60_000,
  });
}
