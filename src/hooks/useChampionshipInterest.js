import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

/**
 * Manifestazione di interesse — campionati esterni (ACI, ERA, ...).
 * NON è l'iscrizione ufficiale: raccoglie solo un segnale interno per
 * lo staff VSD. Vedi apps-script/ChampionshipInterest.js.
 */

export function useInterestList(championshipKey) {
  return useQuery({
    queryKey: ['interest', championshipKey],
    queryFn: () => api.interest.list(championshipKey),
    enabled: !!championshipKey,
    staleTime: 30_000,
  });
}

export function useInterestRegister(championshipKey) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.interest.register({ championship_key: championshipKey, ...payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['interest', championshipKey] });
    },
  });
}

export function useInterestRemove(championshipKey) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (interestId) => api.interest.remove(interestId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['interest', championshipKey] });
    },
  });
}
