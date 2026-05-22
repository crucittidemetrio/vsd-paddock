import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '../api/client';
import { useCars as useCarsInternal } from './useLookups';

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
 * LEGACY: usata da pagine pre-Wave 9.14. Lasciata intatta per backward compat.
 * Per la nuova leaderboard team-wide raggruppata per race_class, usare useTeamLeaderboard.
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

// ===========================================
// WAVE 9.14 — Hooks redesign BestLaps
// ===========================================

/**
 * useTeamLeaderboard — record team-wide per ogni combinazione (sim, track_id, race_class).
 * UNA SOLA riga per combo: il giro più veloce del team in quella classe su quel circuito.
 *
 * Giri di auto SENZA race_class assegnato (es. ACE oggi, IRC fino a popolamento)
 * vengono ESCLUSI — non rappresentabili in una classe.
 *
 * @param {Object} [filters] - { sim?, track_id?, race_class? } filtri client-side
 *                              accetta 'all' come no-op per ciascun filtro
 */
export function useTeamLeaderboard(filters = {}) {
  const lapsQuery = useBestLaps();
  const carsQuery = useCarsInternal();

  const data = useMemo(() => {
    if (!lapsQuery.data || !carsQuery.data) return null;

    // Build car_id → race_class lookup
    const carRaceClass = {};
    carsQuery.data.forEach(c => {
      carRaceClass[c.car_id] = (c.race_class && String(c.race_class).trim()) || null;
    });

    // Annotate + scarta giri senza race_class
    const annotated = lapsQuery.data
      .map(l => ({ ...l, race_class: carRaceClass[l.car_id] || null }))
      .filter(l => l.race_class);

    // Group by (sim, track_id, race_class), keep best lap
    const groups = {};
    annotated.forEach(l => {
      const key = `${l.sim}__${l.track_id}__${l.race_class}`;
      const t = Number(l.lap_time_ms);
      const current = groups[key];
      if (!current || Number(current.lap_time_ms) > t) {
        groups[key] = l;
      }
    });

    let records = Object.values(groups);

    // Apply filters client-side
    if (filters.sim && filters.sim !== 'all') {
      records = records.filter(r => r.sim === filters.sim);
    }
    if (filters.track_id && filters.track_id !== 'all') {
      records = records.filter(r => r.track_id === filters.track_id);
    }
    if (filters.race_class && filters.race_class !== 'all') {
      records = records.filter(r => r.race_class === filters.race_class);
    }

    // Sort stable: sim → track_id → race_class
    records.sort((a, b) => {
      if (a.sim !== b.sim) return String(a.sim).localeCompare(String(b.sim));
      if (a.track_id !== b.track_id) return String(a.track_id).localeCompare(String(b.track_id));
      return String(a.race_class).localeCompare(String(b.race_class));
    });

    return records;
  }, [lapsQuery.data, carsQuery.data, filters.sim, filters.track_id, filters.race_class]);

  return {
    data,
    isLoading: lapsQuery.isLoading || carsQuery.isLoading,
    isError: lapsQuery.isError || carsQuery.isError,
    error: lapsQuery.error || carsQuery.error,
  };
}

/**
 * useMyBestLaps — i miei best per ogni (sim, track_id, race_class) con gap dal record team.
 *
 * Include anche i miei giri SENZA race_class — saranno mostrati in sezione "Da classificare"
 * nella UI. Logica di grouping per non classificati: una riga per car_id, evita merge errati.
 *
 * @param {string} driverId - VSD driver_id loggato
 * @param {Object} [filters] - { sim?, track_id?, race_class? }
 */
export function useMyBestLaps(driverId, filters = {}) {
  const myLapsQuery = useBestLaps({ driver_id: driverId });
  const teamLeaderboard = useTeamLeaderboard();
  const carsQuery = useCarsInternal();

  const data = useMemo(() => {
    if (!driverId) return null;
    if (!myLapsQuery.data || !carsQuery.data || !teamLeaderboard.data) return null;

    const carRaceClass = {};
    carsQuery.data.forEach(c => {
      carRaceClass[c.car_id] = (c.race_class && String(c.race_class).trim()) || null;
    });

    // Annotate con race_class
    const annotated = myLapsQuery.data.map(l => ({
      ...l,
      race_class: carRaceClass[l.car_id] || null,
    }));

    // Group: classificati per (sim, track, race_class), non-classificati per (sim, track, car_id)
    const groups = {};
    annotated.forEach(l => {
      const rcKey = l.race_class || `__unclassified__${l.car_id}`;
      const key = `${l.sim}__${l.track_id}__${rcKey}`;
      const t = Number(l.lap_time_ms);
      const current = groups[key];
      if (!current || Number(current.lap_time_ms) > t) {
        groups[key] = l;
      }
    });

    // Build team record lookup per (sim, track, race_class)
    const teamRecordByKey = {};
    teamLeaderboard.data.forEach(r => {
      const key = `${r.sim}__${r.track_id}__${r.race_class}`;
      teamRecordByKey[key] = r;
    });

    // Annotate ogni mio best con team record + gap + flag is_record_holder
    let myRecords = Object.values(groups).map(l => {
      if (!l.race_class) {
        return { ...l, team_record_ms: null, gap_ms: null, is_record_holder: false };
      }
      const teamKey = `${l.sim}__${l.track_id}__${l.race_class}`;
      const teamRecord = teamRecordByKey[teamKey];
      if (!teamRecord) {
        return { ...l, team_record_ms: null, gap_ms: null, is_record_holder: false };
      }
      const myMs = Number(l.lap_time_ms);
      const recMs = Number(teamRecord.lap_time_ms);
      const gapMs = myMs - recMs;
      const isRecordHolder = teamRecord.driver_id === l.driver_id && gapMs === 0;
      return {
        ...l,
        team_record_ms: recMs,
        gap_ms: gapMs,
        is_record_holder: isRecordHolder,
      };
    });

    if (filters.sim && filters.sim !== 'all') {
      myRecords = myRecords.filter(r => r.sim === filters.sim);
    }
    if (filters.track_id && filters.track_id !== 'all') {
      myRecords = myRecords.filter(r => r.track_id === filters.track_id);
    }
    if (filters.race_class && filters.race_class !== 'all') {
      myRecords = myRecords.filter(r => r.race_class === filters.race_class);
    }

    // Sort: classificati prima (per sim/track/gap asc), non-classificati in fondo
    myRecords.sort((a, b) => {
      if (a.race_class && !b.race_class) return -1;
      if (!a.race_class && b.race_class) return 1;
      if (a.race_class && b.race_class) {
        if (a.sim !== b.sim) return String(a.sim).localeCompare(String(b.sim));
        if (a.track_id !== b.track_id) return String(a.track_id).localeCompare(String(b.track_id));
        return (a.gap_ms || 0) - (b.gap_ms || 0);
      }
      return 0;
    });

    return myRecords;
  }, [
    myLapsQuery.data,
    carsQuery.data,
    teamLeaderboard.data,
    driverId,
    filters.sim,
    filters.track_id,
    filters.race_class,
  ]);

  return {
    data,
    isLoading: myLapsQuery.isLoading || carsQuery.isLoading || teamLeaderboard.isLoading,
    isError: myLapsQuery.isError || carsQuery.isError || teamLeaderboard.isError,
    error: myLapsQuery.error || carsQuery.error || teamLeaderboard.error,
  };
}