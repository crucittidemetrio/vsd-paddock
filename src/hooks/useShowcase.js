import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

export function useShowcase() {
  return useQuery({
    queryKey: ['showcase', 'summary'],
    queryFn: () => api.showcase.summary(),
  });
}

export function useMediaKit() {
  return useQuery({
    queryKey: ['showcase', 'mediaKit'],
    queryFn: () => api.showcase.mediaKit(),
    staleTime: 5 * 60_000,
  });
}