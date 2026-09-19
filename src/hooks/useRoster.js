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

/**
 * useAdminUpdateDriver — staff/admin: scrive status/removed_at/
 * race_number di UN ALTRO driver del team (role solo admin). Vedi
 * roster.adminUpdate (cloud/functions/social-manager/index.ts, NUOVA
 * 19/09/2026) per il gate lato server.
 */
export function useAdminUpdateDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.roster.adminUpdate(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['driver'] });
      qc.invalidateQueries({ queryKey: ['drivers'] });
    },
  });
}

/**
 * useDeletionCandidates — SOLO admin: ex piloti VSD senza alcun dato
 * reale collegato (candidati sicuri per hard-delete). Non abilitato
 * per default (enabled controllato dal chiamante) perché è un dato
 * sensibile da caricare solo quando l'admin apre effettivamente il
 * pannello di pulizia roster.
 */
export function useDeletionCandidates(enabled) {
  return useQuery({
    queryKey: ['roster', 'deletionCandidates'],
    queryFn: () => api.roster.deletionCandidates(),
    enabled: !!enabled,
  });
}

/**
 * useAdminDeleteDriver — SOLO admin: cancellazione definitiva di un
 * ex pilota senza contributi. Irreversibile — il backend ri-verifica
 * sempre lato server prima di eseguire (vedi roster.adminDelete).
 */
export function useAdminDeleteDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (driver_id) => api.roster.adminDelete(driver_id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['driver'] });
      qc.invalidateQueries({ queryKey: ['drivers'] });
      qc.invalidateQueries({ queryKey: ['roster', 'deletionCandidates'] });
    },
  });
}