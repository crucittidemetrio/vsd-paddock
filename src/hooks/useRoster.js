import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

export function useDrivers(filters = {}) {
  return useQuery({
    queryKey: ['drivers', filters],
    queryFn: () => api.roster.list({ includeInactive: true, ...filters }),
  });
}

export function useDriver(driverId) {
  return useQuery({
    queryKey: ['driver', driverId],
    queryFn: () => api.roster.get(driverId),
    enabled: !!driverId,
  });
}