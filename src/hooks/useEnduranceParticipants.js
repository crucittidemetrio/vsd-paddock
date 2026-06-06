import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

const QK = {
  list: (auditionId) => ['endurance', 'participants', 'list', auditionId || 'all'],
};

/**
 * Lista partecipanti di una specifica audition (o globale se auditionId omesso).
 * Pubblico (no auth required lato backend).
 */
export function useParticipants(auditionId) {
  return useQuery({
    queryKey: QK.list(auditionId),
    queryFn: () => api.endurance.participants.list(auditionId),
    staleTime: 30 * 1000,
  });
}

/**
 * Aggiungi un pilota all'audition (admin only).
 * Payload: { audition_id, driver_id, status?, notes? }
 */
export function useAddParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.endurance.participants.add(payload),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['endurance', 'participants', 'list', variables?.audition_id] });
      qc.invalidateQueries({ queryKey: ['endurance', 'participants', 'list', 'all'] });
    },
  });
}

/**
 * Aggiorna status o notes di un partecipante (admin only).
 * Payload: { participation_id, status?, notes? }
 */
export function useUpdateParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.endurance.participants.update(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['endurance', 'participants', 'list'] });
    },
  });
}

/**
 * Rimuovi un partecipante (admin only, hard delete).
 */
export function useRemoveParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (participation_id) => api.endurance.participants.remove(participation_id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['endurance', 'participants', 'list'] });
    },
  });
}
