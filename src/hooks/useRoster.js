import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

export function useDrivers(filters = {}) {
  return useQuery({
    queryKey: ['drivers', filters],
    queryFn: () => api.roster.list(filters),
  });
}

export function useDriver(driverId) {
  return useQuery({
    queryKey: ['driver', driverId],
    queryFn: () => api.roster.get(driverId),
    enabled: !!driverId,
  });
}

/**
 * useUpdateMyProfile — self-edit del proprio profilo (bio/instagram,
 * niente avatar per scelta esplicita). Invalida sia la cache del
 * proprio dettaglio (roster.get) sia le liste driver (roster.list),
 * dato che entrambe possono includere i campi appena modificati.
 */
export function useUpdateMyProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.roster.updateSelf(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['driver'] });
      qc.invalidateQueries({ queryKey: ['drivers'] });
    },
  });
}