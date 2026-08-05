import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

const QK = {
  list: (raceId) => ['raceCrews', 'list', raceId || 'all'],
};

/**
 * useRaceCrews — roster equipaggi (pilota → vettura) di una gara.
 * Serve a sapere quali car_number esistono su una gara PRIMA di
 * pianificare gli stint, e a filtrare i piloti selezionabili per
 * vettura nello Stint Planner.
 *
 * @param {string} raceId - race_id obbligatorio. Se omesso, query disabilitata.
 */
export function useRaceCrews(raceId) {
  return useQuery({
    queryKey: QK.list(raceId),
    queryFn: () => api.raceCrews.list(raceId),
    select: (data) => data?.crews || [],
    staleTime: 30 * 1000,
    enabled: !!raceId,
  });
}

/**
 * useAddCrewMember — assegna un pilota a una vettura (admin/staff).
 * Payload: { race_id, car_number, driver_id, notes? }
 */
export function useAddCrewMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.raceCrews.add(payload),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: QK.list(variables?.race_id) });
    },
  });
}

/**
 * useRemoveCrewMember — rimuove un pilota da un equipaggio (admin/staff).
 */
export function useRemoveCrewMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ crew_id }) => api.raceCrews.remove(crew_id),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: QK.list(variables?.race_id) });
    },
  });
}
