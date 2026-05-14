import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

export function useImportChampionshipStandings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ championship_id, json_data }) =>
      api.championships.importStandings({ championship_id, json_data }),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['standings', variables.championship_id] });
      qc.invalidateQueries({ queryKey: ['championships'] });
    },
  });
}