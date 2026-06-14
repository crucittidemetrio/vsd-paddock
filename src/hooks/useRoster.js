import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

export function useDrivers(filters = {}) {
  return useQuery({
    queryKey: ['drivers', filters],
    queryFn: () => api.roster.list(filters),
  });
}

export function useDrivers(filters = {}) {
  return useQuery({
    queryKey: ['drivers', filters],
    queryFn: () => api.roster.list({ includeInactive: true, ...filters }),
  });
}