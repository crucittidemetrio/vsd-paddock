import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

/**
 * useFuelSummary — consumo medio mobile e autonomia stimata per una
 * vettura su una gara, calcolati backend-side da fuel.summary sui
 * campioni inviati dal companion app (companion/fuel_bridge.py).
 *
 * Polling breve (15s): a differenza del resto dei dati admin, questo
 * è pensato per essere guardato DURANTE la gara mentre i campioni
 * arrivano giro dopo giro.
 *
 * @param {string} raceId
 * @param {string} carNumber
 */
export function useFuelSummary(raceId, carNumber) {
  return useQuery({
    queryKey: ['fuel', 'summary', raceId, carNumber],
    queryFn: () => api.fuel.summary(raceId, carNumber),
    enabled: !!raceId && !!carNumber,
    refetchInterval: 15 * 1000,
    staleTime: 10 * 1000,
  });
}
