// ===========================================
// VSD PADDOCK — Hooks per i lookups (tracks, cars)
// ===========================================
// Single source of truth per tracks/cars.
// I queryFn unwrappano la response { tracks: [...], count: N } → array piatto.
// useLookupResolvers fornisce getTrack(id) / getCar(id) O(1) per i formatters.
// ===========================================
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

const STALE_TIME = 5 * 60 * 1000;
const CACHE_TIME = 30 * 60 * 1000;

/**
 * Lista tracks. Ritorna array piatto (unwrap della shape { tracks, count }).
 * @param {string} [sim] - 'IRC'|'LMU'|'ACE' (opzionale → ritorna tutti)
 */
export function useTracks(sim) {
  return useQuery({
    queryKey: ['lookups', 'tracks', sim || 'all'],
    queryFn: async () => {
      const res = await api.lookups.tracks(sim);
      // Backend serve sia Array(3) (deploy attuale) sia { tracks: [...] } (versione futura)
      if (Array.isArray(res)) return res;
      return res?.tracks ?? [];
    },
    staleTime: STALE_TIME,
    gcTime: CACHE_TIME,
  });
}

/**
 * Lista cars. Ritorna array piatto (unwrap della shape { cars, count }).
 * @param {string} [sim] - 'IRC'|'LMU'|'ACE' (opzionale → ritorna tutti)
 */
export function useCars(sim) {
  return useQuery({
    queryKey: ['lookups', 'cars', sim || 'all'],
    queryFn: async () => {
      const res = await api.lookups.cars(sim);
      if (Array.isArray(res)) return res;
      return res?.cars ?? [];
    },
    staleTime: STALE_TIME,
    gcTime: CACHE_TIME,
  });
}

/**
 * Resolver: carica tutti i tracks/cars (no sim filter) e fornisce
 * getTrack(id) / getCar(id) O(1) per i formatters data-driven.
 *
 * Uso tipico nei componenti:
 *   const { getTrack, getCar, isLoading } = useLookupResolvers();
 *   if (isLoading) return <Spinner />;
 *   formatTrackInfo(getTrack(lap.track_id))
 */
export function useLookupResolvers() {
  const tracks = useTracks();
  const cars = useCars();

  const tracksById = useMemo(
    () => new Map((tracks.data ?? []).map(t => [t.track_id, t])),
    [tracks.data]
  );

  const carsById = useMemo(
    () => new Map((cars.data ?? []).map(c => [c.car_id, c])),
    [cars.data]
  );

  return {
    getTrack: (id) => tracksById.get(id) ?? null,
    getCar: (id) => carsById.get(id) ?? null,
    isLoading: tracks.isLoading || cars.isLoading,
    isError: tracks.isError || cars.isError,
    error: tracks.error || cars.error,
  };
}