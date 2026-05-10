import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

/**
 * Hook per leggere i risultati ufficiali di una gara dal tab RaceResults.
 *
 * @param {Object} opts
 * @param {string} opts.race_id       (richiesto) ID della gara
 * @param {string} [opts.session_type] 'qualifying' | 'race' (opzionale, filtra)
 * @returns React Query result con data = { results, count }
 */
export function useRaceResults({ race_id, session_type } = {}) {
  return useQuery({
    queryKey: ['raceResults', { race_id, session_type }],
    queryFn: () => api.raceResults.list({ race_id, session_type }),
    enabled: Boolean(race_id),
    staleTime: 60_000,
  });
}