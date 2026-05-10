import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

export function useShowcase() {
  return useQuery({
    queryKey: ['showcase', 'summary'],
    queryFn: () => api.showcase.summary(),
  });
}