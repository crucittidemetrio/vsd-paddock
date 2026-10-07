import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

/**
 * Clash of Classes — GTE vs GT3.
 * Hook dedicati (dominio custom, non il generico Championships).
 */

export function useClashParticipants(championshipId) {
  return useQuery({
    queryKey: ['clash', 'participants', championshipId || null],
    queryFn: () => api.clash.participantsList(championshipId),
    staleTime: 30_000,
  });
}

export function useClashRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.clash.register(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clash', 'participants'] });
    },
  });
}

export function useClashAddParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.clash.addParticipant(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clash', 'participants'] });
    },
  });
}

export function useClashUpdateParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.clash.updateParticipant(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clash', 'participants'] });
    },
  });
}

export function useClashRemoveParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (participantId) => api.clash.removeParticipant(participantId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clash', 'participants'] });
    },
  });
}

export function useClashStandings(championshipId) {
  return useQuery({
    queryKey: ['clash', 'standings', championshipId || null],
    queryFn: () => api.clash.standings(championshipId),
    staleTime: 30_000,
  });
}

export function useClashSubmitRoundResults() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.clash.submitRoundResults(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clash', 'standings'] });
    },
  });
}

export function useClashReportIncident() {
  return useMutation({
    mutationFn: (payload) => api.clash.reportIncident(payload),
  });
}

export function useClashIncidents() {
  return useQuery({
    queryKey: ['clash', 'incidents'],
    queryFn: () => api.clash.incidentsList(),
    staleTime: 15_000,
  });
}
