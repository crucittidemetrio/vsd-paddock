import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

/**
 * Mutation per importare risultati gara da JSON LMU.
 * Su successo, invalida cache `raceResults` e `races` per propagare i dati.
 *
 * Uso:
 *   const m = useImportRaceResults();
 *   m.mutate({ race_id, json_data }, { onSuccess, onError });
 */
export function useImportRaceResults() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ race_id, json_data }) =>
      api.raceResults.import({ race_id, json_data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['raceResults'] });
      queryClient.invalidateQueries({ queryKey: ['races'] });
    },
  });
}