import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '../api/client';

// Re-export dei lookup hooks: single source of truth in useLookups.js.
export { useTracks, useCars } from './useLookups';

/**
 * Race laps interni — derivati da RaceResults.
 */
function useRaceLaps() {
  return useQuery({
    queryKey: ['raceLaps'],
    queryFn: () => api.laps.raceLaps(),
    staleTime: 60_000,
  });
}

/**
 * useBestLaps — best laps unificati: manuali (BestLaps tab) + race-derivati
 * (RaceResults). Il merge avviene client-side. Filtri e limit applicati
 * a valle dal componente, NON passati al backend.
 *
 * @param {Object} [_filters] - ignorato, mantenuto per retrocompatibilità di firma
 * @param {number} [_limit]   - ignorato
 */
export function useBestLaps(_filters = {}, _limit) {
  const manualQuery = useQuery({
    queryKey: ['laps', 'manual'],
    queryFn: () => api.laps.list({}, undefined),
  });

  const raceQuery = useRaceLaps();

  const merged = useMemo(() => {
    const manual = (manualQuery.data || []).map(l => ({
      ...l,
      source: l.source || 'manual',
    }));
    const race = raceQuery.data || [];
    return [...manual, ...race].sort(
      (a, b) => Number(a.lap_time_ms) - Number(b.lap_time_ms)
    );
  }, [manualQuery.data, raceQuery.data]);

  return {
    data: merged,
    isLoading: manualQuery.isLoading || raceQuery.isLoading,
    isError: manualQuery.isError || raceQuery.isError,
    error: manualQuery.error || raceQuery.error,
  };
}

/**
 * useLeaderboard — best per pilota su (sim, track, [car]).
 * Derivato client-side da useBestLaps, quindi include race laps.
 * L'endpoint backend laps.leaderboard non viene più chiamato (resta a backend
 * come dormant ma non rimosso).
 */
export function useLeaderboard(sim, trackId, carId) {
  const lapsQuery = useBestLaps();

  const leaderboard = useMemo(() => {
    if (!lapsQuery.data || !sim || !trackId) return null;

    const filtered = lapsQuery.data.filter(l => {
      if (l.sim !== sim) return false;
      if (l.track_id !== trackId) return false;
      if (carId && l.car_id !== carId) return false;
      return true;
    });

    const byDriver = {};
    filtered.forEach(l => {
      const t = Number(l.lap_time_ms);
      const current = byDriver[l.driver_id];
      if (!current || Number(current.lap_time_ms) > t) {
        byDriver[l.driver_id] = l;
      }
    });

    return Object.values(byDriver).sort(
      (a, b) => Number(a.lap_time_ms) - Number(b.lap_time_ms)
    );
  }, [lapsQuery.data, sim, trackId, carId]);

  return {
    data: leaderboard,
    isLoading: lapsQuery.isLoading,
    isError: lapsQuery.isError,
    error: lapsQuery.error,
  };
}