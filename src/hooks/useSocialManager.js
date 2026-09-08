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

// ── Discord (numero membri reale via invito pubblico) ─────

export function useDiscordStats() {
  return useMutation({
    mutationFn: () => api.social.discordStats(),
  });
}

// ── Media Gallery (file caricati su Vercel Blob) ──────────

export function useSocialMedia(tag) {
  return useQuery({
    queryKey: ['social', 'media', tag || 'all'],
    queryFn: () => api.social.mediaList(tag),
    staleTime: 30_000,
  });
}

export function useAddSocialMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.social.mediaAdd(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['social', 'media'] }),
  });
}

export function useRemoveSocialMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (media_id) => api.social.mediaRemove(media_id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['social', 'media'] }),
  });
}

// ── Piano editoriale — sezioni archiviate manualmente ─────
// Indipendente dalla finestra -10/+45gg calcolata in useEditorialPlan
// (SocialManager.jsx): un admin archivia quando i post di chiusura
// (risultati/highlight) sono davvero fatti, non quando scade un timer.

export function useSocialPlanDismissed() {
  return useQuery({
    queryKey: ['social', 'planDismissed'],
    queryFn: () => api.social.planDismissedList(),
    staleTime: 30_000,
  });
}

export function useDismissSocialPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (race_id) => api.social.planDismiss(race_id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['social', 'planDismissed'] }),
  });
}

export function useUndismissSocialPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (race_id) => api.social.planUndismiss(race_id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['social', 'planDismissed'] }),
  });
}
