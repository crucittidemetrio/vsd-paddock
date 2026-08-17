import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from './useAuth';

/**
 * useSponsors — CRM sponsor (staff only). Agenda privata dello staff per
 * tenere traccia dei contatti sponsor, a che punto è la trattativa e
 * quando ricontattare. La pagina pubblica /media-kit resta la vetrina,
 * questo è lo strumento interno.
 */
export function useSponsors(status) {
  const { isStaff } = useAuth();
  return useQuery({
    queryKey: ['sponsors', 'list', status || 'all'],
    queryFn: () => api.sponsors.list(status ? { status } : {}),
    select: (data) => data?.sponsors || [],
    enabled: isStaff,
    staleTime: 30_000,
  });
}

export function useAddSponsor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.sponsors.add(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sponsors', 'list'] });
    },
  });
}

export function useUpdateSponsor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.sponsors.update(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sponsors', 'list'] });
    },
  });
}

export function useRemoveSponsor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sponsor_id) => api.sponsors.remove(sponsor_id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sponsors', 'list'] });
    },
  });
}
