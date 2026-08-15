import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

/**
 * Standings aggregati di un campionato (per classe, con tie-break).
 *
 * @param {string} championshipId
 * @param {Object} [options]
 * @param {boolean} [options.enabled=true]
 */
export function useChampionshipStandings(championshipId, options = {}) {
  return useQuery({
    queryKey: ['standings', 'byChampionship', championshipId],
    queryFn: () => api.standings.byChampionship(championshipId),
    enabled: Boolean(championshipId) && options.enabled !== false,
    staleTime: 60_000,
  });
}

/**
 * Andamento punti gara-per-gara di una classe (curva cumulativa).
 * Ricostruito lato backend da RaceResults.point_total, non da standings_json
 * (che non porta i punti per round) — vedi handleStandingsProgression.
 *
 * @param {string} championshipId
 * @param {string} [className] - se omesso, il backend usa la classe più popolosa
 * @param {Object} [options]
 * @param {boolean} [options.enabled=true]
 */
export function useChampionshipProgression(championshipId, className, options = {}) {
  return useQuery({
    queryKey: ['standings', 'progression', championshipId, className || null],
    queryFn: () => api.standings.progression(championshipId, className),
    enabled: Boolean(championshipId) && options.enabled !== false,
    staleTime: 60_000,
  });
}