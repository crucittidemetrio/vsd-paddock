import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

export function useUpdateRacePoster() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ race_id, poster_url }) =>
      api.races.updatePoster({ race_id, poster_url }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['races'] });
      qc.invalidateQueries({ queryKey: ['racesUpcoming'] });
    },
  });
}