import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

/**
 * Candidati in prequalifica — campionati esterni (ACI, ERA, ...).
 * Elenco a sheet gestibile dallo staff senza redeploy, vedi
 * apps-script/PrequalCandidates.js.
 */

export function usePrequalList(championshipKey) {
  return useQuery({
    queryKey: ['prequal', championshipKey],
    queryFn: () => api.prequal.list(championshipKey),
    enabled: !!championshipKey,
    staleTime: 30_000,
  });
}

export function useAddPrequalCandidate(championshipKey) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.prequal.add({ championship_key: championshipKey, ...payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prequal', championshipKey] });
    },
  });
}

export function useRemovePrequalCandidate(championshipKey) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (candidateId) => api.prequal.remove(candidateId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prequal', championshipKey] });
    },
  });
}
