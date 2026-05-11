import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

/**
 * Hook per leggere i risultati ufficiali con filtri estesi.
 *
 * @param {Object} opts
 * @param {string} [opts.race_id]      filtra per gara specifica
 * @param {string} [opts.session_type] 'qualifying' | 'race'
 * @param {string} [opts.driver_id]    filtra per pilota
 * @param {number} [opts.limit]        max risultati
 * @param {string} [opts.sort]         'date_desc' | 'date_asc' | undefined
 * @param {boolean} [opts.enabled=true]
 */
export function useRaceResults({
  race_id,
  session_type,
  driver_id,
  limit,
  sort,
  enabled = true,
} = {}) {
  return useQuery({
    queryKey: ['raceResults', { race_id, session_type, driver_id, limit, sort }],
    queryFn: () => api.raceResults.list({ race_id, session_type, driver_id, limit, sort }),
    enabled: Boolean(enabled),
    staleTime: 60_000,
  });
}

/**
 * Helper: ultimi N risultati di gara del pilota loggato.
 */
export function useMyRecentRaceResults(driver_id, limit = 5) {
  return useRaceResults({
    driver_id,
    session_type: 'race',
    limit,
    sort: 'date_desc',
    enabled: Boolean(driver_id),
  });
}

/**
 * Helper: ultimi N risultati di gara del team (cross-pilota).
 */
export function useRecentTeamRaceResults(limit = 20) {
  return useRaceResults({
    session_type: 'race',
    limit,
    sort: 'date_desc',
  });
}