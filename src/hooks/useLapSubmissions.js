import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

/**
 * useMyLapSubmissions — storico delle richieste inviate dal pilota
 * loggato (pending/approved/rejected). Richiede un pilota autenticato:
 * passare `enabled` per evitare la chiamata da anonimo.
 */
export function useMyLapSubmissions(enabled = true) {
  return useQuery({
    queryKey: ['lapSubmissions', 'mine'],
    queryFn: () => api.lapSubmissions.listMine(),
    select: (data) => data?.submissions || [],
    enabled,
  });
}

/**
 * useRemoveLapSubmission — cancella una riga dallo storico richieste.
 * SOLO admin lato backend (vedi handleLapSubmissionsRemove): non tocca
 * mai il lap reale già copiato in BestLaps, serve solo a ripulire lo
 * storico (es. richieste di test). Invalida lo storico personale.
 */
export function useRemoveLapSubmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (submission_id) => api.lapSubmissions.remove(submission_id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lapSubmissions', 'mine'] });
    },
  });
}

/**
 * usePendingLapSubmissions — coda di revisione. Solo admin: se la
 * chiamata arriva da un non-admin il backend risponde fail, quindi va
 * usata solo dietro un gate `isAdmin` nella pagina.
 */
export function usePendingLapSubmissions(enabled = true) {
  return useQuery({
    queryKey: ['lapSubmissions', 'pending'],
    queryFn: () => api.lapSubmissions.listPending(),
    select: (data) => data?.submissions || [],
    enabled,
    refetchInterval: enabled ? 30_000 : false,
  });
}

/**
 * useSubmitLap — un pilota invia un proprio tempo con foto di prova.
 * Invalida lo storico personale al successo.
 */
export function useSubmitLap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.lapSubmissions.submit(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lapSubmissions', 'mine'] });
    },
  });
}

/**
 * useApproveLapSubmission — admin approva: il backend copia il tempo in
 * BestLaps e restituisce evidence_url, che il chiamante deve passare a
 * /api/media-delete per cancellare la foto (non serve più conservarla).
 * Invalida la coda pending e i lap manuali (ora contiene il nuovo lap).
 */
export function useApproveLapSubmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (submission_id) => api.lapSubmissions.approve(submission_id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lapSubmissions', 'pending'] });
      qc.invalidateQueries({ queryKey: ['laps', 'manual'] });
    },
  });
}

/**
 * useRejectLapSubmission — admin rifiuta: il backend restituisce
 * comunque evidence_url per la stessa ragione di useApproveLapSubmission
 * (la foto va cancellata anche sulle richieste rifiutate).
 */
export function useRejectLapSubmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ submission_id, review_note }) =>
      api.lapSubmissions.reject(submission_id, review_note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lapSubmissions', 'pending'] });
    },
  });
}
