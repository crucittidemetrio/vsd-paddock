import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

// ── Posts ──────────────────────────────────────────────────

export function useSocialPosts(status) {
  return useQuery({
    queryKey: ['social', 'posts', status || 'all'],
    queryFn: () => api.social.postsList(status),
    staleTime: 30_000,
  });
}

export function useCreateSocialPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.social.postsCreate(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['social', 'posts'] }),
  });
}

export function useUpdateSocialPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.social.postsUpdate(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['social', 'posts'] }),
  });
}

export function useDeleteSocialPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (post_id) => api.social.postsRemove(post_id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['social', 'posts'] }),
  });
}

// ── Metrics (follower, tracking manuale) ──────────────────

export function useSocialMetrics(platform) {
  return useQuery({
    queryKey: ['social', 'metrics', platform || 'all'],
    queryFn: () => api.social.metricsList(platform),
    staleTime: 30_000,
  });
}

export function useAddSocialMetric() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.social.metricsAdd(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['social', 'metrics'] }),
  });
}

// ── Generazione testo AI ───────────────────────────────────

export function useGenerateSocialText() {
  return useMutation({
    mutationFn: ({ prompt, provider }) => api.social.generateText(prompt, provider),
  });
}
