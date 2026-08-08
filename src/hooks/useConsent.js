import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from './useAuth';

// Attivo solo per chi ha un driver_id reale (pilot_vsd/staff/admin) —
// guest e anonimi non hanno nulla da accettare.
export function useConsentStatus() {
  const { driver, isVsdPilot } = useAuth();
  return useQuery({
    queryKey: ['consent', 'status', driver?.driver_id],
    queryFn: () => api.consent.status(),
    enabled: !!driver?.driver_id && isVsdPilot,
    staleTime: 60_000,
  });
}

export function useAcceptConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.consent.accept(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consent'] }),
  });
}

export function useConsentAdminList() {
  const { isAdmin } = useAuth();
  return useQuery({
    queryKey: ['consent', 'adminList'],
    queryFn: () => api.consent.adminList(),
    enabled: isAdmin,
    staleTime: 30_000,
  });
}
