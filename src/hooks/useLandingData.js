// ═══════════════════════════════════════════════════════════
// useLandingData — Hook aggregato per la Landing page
// ═══════════════════════════════════════════════════════════
// Una sola fetch verso landing.data invece di ~9 chiamate
// separate. Pre-popola le cache degli hook esistenti così
// gli altri componenti (es. MyDominantClassesWidget) trovano
// i dati già disponibili senza fare fetch proprie.
// ═══════════════════════════════════════════════════════════

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

export function useLandingData(driverId) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ['landing', 'data', driverId],
    queryFn: async () => {
      const d = await api.landing.data({ driver_id: driverId });

      // Pre-popola le cache degli hook esistenti.
      // Quando altri componenti montano dopo la Landing, trovano
      // già i dati e non fanno fetch proprie.
      queryClient.setQueryData(['races', undefined],              d.all_races);
      queryClient.setQueryData(['races', 'upcoming'],             d.upcoming_races);
      queryClient.setQueryData(['laps', 'manual'],                d.manual_laps);
      queryClient.setQueryData(['raceLaps'],                      d.race_laps);
      queryClient.setQueryData(['reports', {}],                   d.all_reports);
      queryClient.setQueryData(['reports', { driver_id: driverId }], d.my_reports);
      queryClient.setQueryData(['drivers', {}],                          d.drivers);
      // Pre-popola anche la key usata da Roster.jsx (include ex-VSD)
      queryClient.setQueryData(['drivers', { includeRemoved: true }],   d.drivers);
      queryClient.setQueryData(['lookups', 'tracks', 'all'],      d.tracks);
      queryClient.setQueryData(['lookups', 'cars', 'all'],        d.cars);
      queryClient.setQueryData(
        ['raceResults', { race_id: undefined, session_type: 'race', driver_id: driverId, limit: 200, sort: 'date_desc' }],
        { results: d.my_race_results, count: d.my_race_results.length, totalAvailable: d.my_race_results.length }
      );
      queryClient.setQueryData(
        ['raceResults', { race_id: undefined, session_type: 'race', driver_id: undefined, limit: 20, sort: 'date_desc' }],
        { results: d.team_race_results, count: d.team_race_results.length, totalAvailable: d.team_race_results.length }
      );

      return d;
    },
    enabled: Boolean(driverId),
    staleTime: 60_000,
  });
}
