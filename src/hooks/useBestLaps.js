import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '../api/client';
import { useCars as useCarsInternal } from './useLookups';

export { useTracks, useCars } from './useLookups';

const SEASON_2026_START = '2026-01-01';

/**
 * True se il giro è avvenuto a partire dal 1 gennaio 2026.
 * Tollerante sui nomi del campo data (lap_date, created_at, date).
 */
function isInSeason2026(lap) {
  const raw = lap.set_date || lap.race_date || lap.lap_date || lap.created_at || lap.date;
  if (!raw) return false;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return false;
  return d >= new Date(SEASON_2026_START);
}

function lapTimestamp(lap) {
  const raw = lap.set_date || lap.race_date || lap.lap_date || lap.created_at || lap.date;
  if (!raw) return 0;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function useRaceLaps() {
  return useQuery({
    queryKey: ['raceLaps'],
    queryFn: () => api.laps.raceLaps(),
    staleTime: 60_000,
  });
}

/**
 * useBestLaps — best laps unificati: manuali + race-derivati.
 *
 * @param {Object} [filters] - { driver_id?, sim?, track_id?, car_id? }
 * @param {number} [limit]
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
 * useLeaderboard — LEGACY: best per pilota su (sim, track, [car]).
 * Lasciata intatta per Landing/DriverProfile/Reports.
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
 * useTeamLeaderboard — record team-wide per ogni (sim, track_id, race_class).
 * UNA SOLA riga per combo: il giro più veloce del team in quella classe su quel circuito.
 * Include `lastLaps` = ultimi 10 giri del record holder in quella combo (per sparkline).
 *
 * Giri di auto SENZA race_class assegnato vengono ESCLUSI.
 *
 * @param {Object} [filters] - { sim?, track_id?, race_class?, season? }
 *                              season: 'all' (default) | 'season2026'
 */
export function useTeamLeaderboard(filters = {}) {
  const lapsQuery = useBestLaps();
  const carsQuery = useCarsInternal();

  const data = useMemo(() => {
    if (!lapsQuery.data || !carsQuery.data) return null;

    const carRaceClass = {};
    carsQuery.data.forEach(c => {
      carRaceClass[c.car_id] = (c.race_class && String(c.race_class).trim()) || null;
    });

    // Annotate + filtro race_class
    let annotated = lapsQuery.data
      .map(l => ({ ...l, race_class: carRaceClass[l.car_id] || null }))
      .filter(l => l.race_class);

    // Filtro stagione (PRIMA del raggruppamento, altrimenti il "record" sarebbe quello all-time poi escluso)
    if (filters.season === 'season2026') {
      annotated = annotated.filter(isInSeason2026);
    }

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

    // Per ogni record, calcola lastLaps del record holder in quella combo (ultimi 10, cronologico)
    let records = Object.values(groups).map(rec => {
      const lapsOfHolder = annotated
        .filter(l =>
          l.sim === rec.sim &&
          l.track_id === rec.track_id &&
          l.race_class === rec.race_class &&
          l.driver_id === rec.driver_id
        )
        .sort((a, b) => lapTimestamp(a) - lapTimestamp(b))
        .slice(-10)
        .map(l => Number(l.lap_time_ms));

      return { ...rec, lastLaps: lapsOfHolder };
    });

    // Filtri visualizzazione
    if (filters.sim && filters.sim !== 'all') {
      records = records.filter(r => r.sim === filters.sim);
    }
    if (filters.track_id && filters.track_id !== 'all') {
      records = records.filter(r => r.track_id === filters.track_id);
    }
    if (filters.race_class && filters.race_class !== 'all') {
      records = records.filter(r => r.race_class === filters.race_class);
    }

    records.sort((a, b) => {
      if (a.sim !== b.sim) return String(a.sim).localeCompare(String(b.sim));
      if (a.track_id !== b.track_id) return String(a.track_id).localeCompare(String(b.track_id));
      return String(a.race_class).localeCompare(String(b.race_class));
    });

    return records;
  }, [
    lapsQuery.data,
    carsQuery.data,
    filters.sim,
    filters.track_id,
    filters.race_class,
    filters.season,
  ]);

  return {
    data,
    isLoading: lapsQuery.isLoading || carsQuery.isLoading,
    isError: lapsQuery.isError || carsQuery.isError,
    error: lapsQuery.error || carsQuery.error,
  };
}

/**
 * useMyBestLaps — i miei best per ogni (sim, track_id, race_class) con gap dal team + lastLaps.
 *
 * @param {string} driverId
 * @param {Object} [filters] - { sim?, track_id?, race_class?, season? }
 */
export function useMyBestLaps(driverId, filters = {}) {
  const myLapsQuery = useBestLaps({ driver_id: driverId });
  const teamLeaderboard = useTeamLeaderboard({ season: filters.season });
  const carsQuery = useCarsInternal();

  const data = useMemo(() => {
    if (!driverId) return null;
    if (!myLapsQuery.data || !carsQuery.data || !teamLeaderboard.data) return null;

    const carRaceClass = {};
    carsQuery.data.forEach(c => {
      carRaceClass[c.car_id] = (c.race_class && String(c.race_class).trim()) || null;
    });

    // Annotate
    let annotated = myLapsQuery.data.map(l => ({
      ...l,
      race_class: carRaceClass[l.car_id] || null,
    }));

    // Filtro stagione
    if (filters.season === 'season2026') {
      annotated = annotated.filter(isInSeason2026);
    }

    // Group by (sim, track_id, race_class). Non-classificati raggruppati per car_id
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

    // Team record lookup
    const teamRecordByKey = {};
    teamLeaderboard.data.forEach(r => {
      const key = `${r.sim}__${r.track_id}__${r.race_class}`;
      teamRecordByKey[key] = r;
    });

    // Annotate ogni mio best con team record + gap + lastLaps
    let myRecords = Object.values(groups).map(l => {
      // lastLaps personali in quella combo (per sparkline)
      const myLapsInCombo = annotated
        .filter(ll => {
          if (ll.sim !== l.sim || ll.track_id !== l.track_id) return false;
          // Per i classificati: stessa race_class. Per i non classificati: stessa car_id.
          if (l.race_class) return ll.race_class === l.race_class;
          return ll.car_id === l.car_id && !ll.race_class;
        })
        .sort((a, b) => lapTimestamp(a) - lapTimestamp(b))
        .slice(-10)
        .map(ll => Number(ll.lap_time_ms));

      if (!l.race_class) {
        return {
          ...l,
          team_record_ms: null,
          gap_ms: null,
          is_record_holder: false,
          lastLaps: myLapsInCombo,
        };
      }
      const teamKey = `${l.sim}__${l.track_id}__${l.race_class}`;
      const teamRecord = teamRecordByKey[teamKey];
      if (!teamRecord) {
        return {
          ...l,
          team_record_ms: null,
          gap_ms: null,
          is_record_holder: false,
          lastLaps: myLapsInCombo,
        };
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
        lastLaps: myLapsInCombo,
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
    filters.season,
  ]);

  return {
    data,
    isLoading: myLapsQuery.isLoading || carsQuery.isLoading || teamLeaderboard.isLoading,
    isError: myLapsQuery.isError || carsQuery.isError || teamLeaderboard.isError,
    error: myLapsQuery.error || carsQuery.error || teamLeaderboard.error,
  };
}

/**
 * useMyDominantClasses — combo (sim, track, race_class) dove il driver è team record holder.
 * Restituisce array filtrato di useTeamLeaderboard. Default all-time.
 *
 * @param {string} driverId
 * @param {Object} [options] - { season? } season: 'all' | 'season2026'
 */
export function useMyDominantClasses(driverId, options = {}) {
  const teamLeaderboard = useTeamLeaderboard({ season: options.season });

  const data = useMemo(() => {
    if (!driverId || !teamLeaderboard.data) return null;

    return teamLeaderboard.data
      .filter(rec => rec.driver_id === driverId)
      .sort((a, b) => {
        if (a.sim !== b.sim) return String(a.sim).localeCompare(String(b.sim));
        if (a.track_id !== b.track_id) return String(a.track_id).localeCompare(String(b.track_id));
        return String(a.race_class).localeCompare(String(b.race_class));
      });
  }, [teamLeaderboard.data, driverId]);

  return {
    data,
    isLoading: teamLeaderboard.isLoading,
    isError: teamLeaderboard.isError,
    error: teamLeaderboard.error,
  };
}

/**
 * useManualBestLaps — lista grezza dei lap inseriti manualmente (no merge
 * coi race laps, no dedup). Uso: pagina admin di gestione CRUD.
 */
export function useManualBestLaps() {
  return useQuery({
    queryKey: ['laps', 'manual'],
    queryFn: () => api.laps.list({}, undefined),
  });
}

// ═══════════════════════════════════════════════════════════
// MUTATION HOOKS — inserimento manuale best lap (staff only)
// ═══════════════════════════════════════════════════════════

/**
 * useAddBestLap — crea un nuovo lap manuale.
 * Invalida la cache dei lap manuali al successo.
 */
export function useAddBestLap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.laps.add(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['laps', 'manual'] });
    },
  });
}

/**
 * useUpdateBestLap — modifica un lap manuale esistente.
 * Invalida la cache dei lap manuali al successo.
 */
export function useUpdateBestLap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.laps.update(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['laps', 'manual'] });
    },
  });
}

/**
 * useDeleteBestLap — elimina un lap manuale.
 * Invalida la cache dei lap manuali al successo.
 */
export function useDeleteBestLap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (lap_id) => api.laps.remove(lap_id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['laps', 'manual'] });
    },
  });
}