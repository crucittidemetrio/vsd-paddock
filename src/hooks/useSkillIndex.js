import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

/**
 * useSkillIndex — indice skill unificato cross-sim per tutti i piloti
 * attivi con dati sufficienti. Un'unica chiamata batch: sia il badge sul
 * profilo pilota che la classifica in Team Dashboard leggono dalla
 * stessa lista, filtrando/cercando lato client.
 *
 * @param {string} sim - filtro opzionale per sim
 */
export function useSkillIndex(sim) {
  return useQuery({
    queryKey: ['skillIndex', 'list', sim || 'all'],
    queryFn: () => api.skillIndex.list(sim ? { sim } : {}),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * useDriverSkillIndex — comodo per il profilo singolo: trova la riga di
 * un driver specifico dalla lista batch, senza chiamate dedicate.
 */
export function useDriverSkillIndex(driverId) {
  const query = useSkillIndex();
  const drivers = query.data?.drivers || [];
  const entry = drivers.find(d => d.driver_id === driverId) || null;
  return { ...query, data: entry };
}

/**
 * useSkillIndexHistory — serie storica per un pilota (snapshot
 * settimanali via runSkillIndexSnapshot), per il grafico di andamento.
 */
export function useSkillIndexHistory(driverId) {
  return useQuery({
    queryKey: ['skillIndex', 'history', driverId],
    queryFn: () => api.skillIndex.history(driverId),
    select: (data) => data?.snapshots || [],
    enabled: !!driverId,
    staleTime: 5 * 60 * 1000,
  });
}
