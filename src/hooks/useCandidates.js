import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from './useAuth';

/**
 * useCandidates — pipeline candidature (staff only). Fino al 26/09/2026
 * affiancava un Google Form esterno che lo staff doveva ricopiare a
 * mano; da quel giorno /joinus scrive direttamente qui via
 * useApplyCandidate (vedi sotto) — restano comunque possibili
 * candidati aggiunti a mano (Discord, passaparola, ecc.).
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

/**
 * useApplyCandidate — candidatura pubblica da /joinus (26/09/2026).
 * Nessuna auth, nessuna query da invalidare per il visitatore
 * anonimo (non vede la pipeline staff) — invalidiamo comunque
 * ['candidates','list'] per il caso raro di uno staff loggato che
 * ha la pagina AdminCandidates aperta in un'altra tab.
 */
export function useApplyCandidate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.candidates.apply(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['candidates', 'list'] });
    },
  });
}
