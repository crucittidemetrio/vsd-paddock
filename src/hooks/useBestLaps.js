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
 * useBestLaps — best laps unificati: manuali (BestLaps tab) + race-derivati (RaceResults).
 * Merge client-side, filtering client-side.
 *
 * @param {Object} [filters] - { driver_id?, sim?, track_id?, car_id? }
 * @param {number} [limit]   - numero massimo di righe da ritornare (dopo filtri e sort)
 */
export function useBestLaps(filters = {}, limit) {
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
    let all = [...manual, ...race].sort(
      (a, b) => Number(a.lap_time_ms) - Number(b.lap_time_ms)
    );

    // Apply filters
    if (filters && filters.driver_id) {
      all = all.filter(l => l.driver_id === filters.driver_id);
    }
    if (filters && filters.sim) {
      all = all.filter(l => l.sim === filters.sim);
    }
    if (filters && filters.track_id) {
      all = all.filter(l => l.track_id === filters.track_id);
    }
    if (filters && filters.car_id) {
      all = all.filter(l => l.car_id === filters.car_id);
    }

    if (limit && limit > 0) {
      all = all.slice(0, limit);
    }

    return all;
  }, [manualQuery.data, raceQuery.data, filters, limit]);

  return {
    data: merged,
    isLoading: manualQuery.isLoading || raceQuery.isLoading,
    isError: manualQuery.isError || raceQuery.isError,
    error: manualQuery.error || raceQuery.error,
  };
}

/**
 * useLeaderboard — best per pilota su (sim, track, [car]).
 * Derivato client-side da useBestLaps senza filtri (volutamente:
 * la leaderboard è team-wide, il filtro driver_id annullerebbe lo scope).
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