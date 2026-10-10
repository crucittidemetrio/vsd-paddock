import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

/**
 * useAcademyRanking — classifica VR (Punti Merito) per un simulatore.
 *
 * Fase 1: solo Punti Merito da RaceResults, nessuna penalità, nessun
 * badge, nessuno scoping stagionale. Vedi apps-script/Academy.js per
 * lo scope esatto — questa è una classifica di anteprima, non il VR
 * definitivo della spec VPR.
 *
 * @param {'LMU'|'IRC'|'ACE'} sim
 */
export function useAcademyRanking(sim) {
  return useQuery({
    queryKey: ['academy', 'ranking', sim],
    queryFn: async () => {
      const data = await api.academy.ranking(sim);
      writeCache(sim, data);
      return data;
    },
    enabled: Boolean(sim),
    staleTime: 60_000,
    // Il calcolo lato server impiega 5-8 s a freddo: si mostra subito
    // l'ultima classifica vista su questo dispositivo (placeholder, non
    // salvata in cache react-query) e la si sostituisce appena arriva quella
    // aggiornata. isPlaceholderData permette alla pagina di segnalarlo.
    placeholderData: () => readCache(sim),
  });
}

const CACHE_PREFIX = 'vsd_academy_ranking_v1:';

function readCache(sim) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + sim);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

function writeCache(sim, data) {
  try {
    if (data) localStorage.setItem(CACHE_PREFIX + sim, JSON.stringify(data));
  } catch {
    /* quota piena o storage non disponibile: si ignora */
  }
}
