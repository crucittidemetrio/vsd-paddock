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
      //
      // `|| []` su ogni campo array: il backend (LandingData.js) aggrega
      // ~9 letture in UNA sola esecuzione Apps Script, e con la mole dati
      // cresciuta durante la stagione capita che l'esecuzione sia lenta o
      // che un singolo pezzo fallisca silenziosamente lato server. Senza
      // questa guardia, un campo mancante finiva `undefined` nella cache
      // di React Query — che poi va in errore hard ("[key] data is
      // undefined") ovunque quella query key viene letta da un ALTRO hook
      // (es. useBestLaps su /laps), anche molto dopo e su una pagina
      // diversa, perché la cache di React Query è globale per tab.
      const raceLaps = d.race_laps || [];
      queryClient.setQueryData(['races', undefined],              d.all_races || []);
      queryClient.setQueryData(['races', 'upcoming'],             d.upcoming_races || []);
      queryClient.setQueryData(['laps', 'manual'],                d.manual_laps || []);
      queryClient.setQueryData(['raceLaps'],                      raceLaps);
      queryClient.setQueryData(['reports', {}],                   d.all_reports || []);
      queryClient.setQueryData(['reports', { driver_id: driverId }], d.my_reports || []);
      queryClient.setQueryData(['drivers', {}],                          d.drivers || []);
      // Pre-popola anche la key usata da Roster.jsx (include ex-VSD)
      queryClient.setQueryData(['drivers', { includeRemoved: true }],   d.drivers || []);
      queryClient.setQueryData(['lookups', 'tracks', 'all'],      d.tracks || []);
      queryClient.setQueryData(['lookups', 'cars', 'all'],        d.cars || []);
      queryClient.setQueryData(
        ['raceResults', { race_id: undefined, session_type: 'race', driver_id: driverId, limit: 200, sort: 'date_desc' }],
        { results: d.my_race_results || [], count: (d.my_race_results || []).length, totalAvailable: (d.my_race_results || []).length }
      );
      queryClient.setQueryData(
        ['raceResults', { race_id: undefined, session_type: 'race', driver_id: undefined, limit: 20, sort: 'date_desc' }],
        { results: d.team_race_results || [], count: (d.team_race_results || []).length, totalAvailable: (d.team_race_results || []).length }
      );

      return { ...d, race_laps: raceLaps };
    },
    enabled: Boolean(driverId),
    staleTime: 60_000,
  });
}
