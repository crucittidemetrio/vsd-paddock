import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from './useAuth';

/**
 * useTreasury — Cassa / rendiconto team (solo admin/Team Principal).
 * Sostituisce l'inserimento manuale sul foglio Google esterno "Rendiconto
 * Comunity Virtual Sim-Driver": entrate (donazioni community) e uscite
 * (spese) si registrano da qui, con totali/saldo calcolati live.
 */
export function useTreasury(type) {
  const { isAdmin } = useAuth();
  return useQuery({
        queryKey: ['treasury', 'list', type || 'all'],
        queryFn: () => api.treasury.list(type ? { type } : {}),
        staleTime: 30_000,
    enabled: isAdmin,
  });
}

export function useAddTreasuryEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.treasury.add(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['treasury', 'list'] });
    },
  });
}

export function useUpdateTreasuryEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.treasury.update(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['treasury', 'list'] });
    },
  });
}

export function useRemoveTreasuryEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entry_id) => api.treasury.remove(entry_id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['treasury', 'list'] });
    },
  });
}
