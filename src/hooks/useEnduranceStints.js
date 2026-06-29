import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

const QK = {
  list: (raceId) => ['endurance', 'stints', 'list', raceId || 'all'],
};

/**
 * Lista stint pianificati per una specifica gara endurance.
 * Auth required (backend).
 *
 * Ritorna shape: { ok, data: { stints: [...], count: N } }
 *
 * @param {string} raceId - race_id obbligatorio. Se omesso, la query è disabilitata.
 */
export function useStints(raceId) {
  return useQuery({
    queryKey: QK.list(raceId),
    queryFn: () => api.endurance.stints.list(raceId),
    staleTime: 30 * 1000,
    enabled: !!raceId,
  });
}

/**
 * Crea un nuovo stint (admin only).
 * Re-numbering automatico lato backend.
 *
 * Payload: {
 *   race_id, driver_id, stint_order,
 *   planned_start_time?, planned_end_time?, planned_duration_min?,
 *   tire_compound?, pit_stop_at_end?, fuel_loaded_l?,
 *   status?, notes?
 * }
 */
export function useAddStint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.endurance.stints.add(payload),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['endurance', 'stints', 'list', variables?.race_id] });
      qc.invalidateQueries({ queryKey: ['endurance', 'stints', 'list', 'all'] });
    },
  });
}

/**
 * Aggiorna uno stint esistente (admin only).
 * Se viene modificato stint_order, scatta re-numbering automatico lato backend.
 *
 * Payload: { stint_id, ...campi da aggiornare }
 */
export function useUpdateStint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.endurance.stints.update(payload),
   onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['endurance', 'stints', 'list', variables?.race_id] });
      qc.invalidateQueries({ queryKey: ['endurance', 'stints', 'list', 'all'] });
    },
  });
}

/**
 * Rimuovi uno stint (admin only, hard delete).
 * Re-numbering automatico lato backend.
 */
export function useRemoveStint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ stint_id }) => api.endurance.stints.remove(stint_id),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['endurance', 'stints', 'list', variables?.race_id] });
      qc.invalidateQueries({ queryKey: ['endurance', 'stints', 'list', 'all'] });
    },
  });
}
