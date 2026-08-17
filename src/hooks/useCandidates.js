import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from './useAuth';

/**
 * useCandidates — pipeline candidature (staff only). Affianca il Google
 * Form pubblico di /joinus: lo staff aggiunge qui a mano i candidati
 * promettenti visti nelle risposte del form (o arrivati via Discord,
 * passaparola, ecc.) e ne segue lo stato.
 */
export function useCandidates(status) {
  const { isStaff } = useAuth();
  return useQuery({
    queryKey: ['candidates', 'list', status || 'all'],
    queryFn: () => api.candidates.list(status ? { status } : {}),
    select: (data) => data?.candidates || [],
    enabled: isStaff,
    staleTime: 30_000,
  });
}

export function useAddCandidate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.candidates.add(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['candidates', 'list'] });
    },
  });
}

export function useUpdateCandidate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.candidates.update(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['candidates', 'list'] });
    },
  });
}

export function useRemoveCandidate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (candidate_id) => api.candidates.remove(candidate_id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['candidates', 'list'] });
    },
  });
}
