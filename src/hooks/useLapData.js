import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

/**
 * Mutation per importare un CSV di Analisi di Passo (export del plugin
 * SimHub, vedi simhub-plugin/). Su successo invalida la cache delle
 * sessioni per far comparire subito quella appena importata.
 *
 * Uso:
 *   const m = useImportLapData();
 *   m.mutate({ csvText, driverIdOverride }, { onSuccess, onError });
 *
 * driverIdOverride (opzionale): forza il pilota per TUTTE le righe
 * invece di affidarsi al campo driver_name letto da SimHub — utile
 * perché quella property non è garantita al 100% (vedi commenti nel
 * plugin C#) e le sessioni caricate a mano sono quasi sempre di un
 * solo pilota che lo staff conosce con certezza.
 */
export function useImportLapData() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ csvText, driverIdOverride }) => api.lapData.import(csvText, driverIdOverride),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lapData', 'sessions'] });
    },
  });
}

/**
 * Elenco sessioni di Analisi di Passo già importate.
 */
export function useLapDataSessions() {
  return useQuery({
    queryKey: ['lapData', 'sessions'],
    queryFn: () => api.lapData.sessions(),
    staleTime: 30_000,
  });
}

/**
 * Dettaglio giri di una sessione (per grafico passo, trend
 * carburante/temperature, confronto piloti).
 */
export function useLapDataSession(sessionId) {
  return useQuery({
    queryKey: ['lapData', 'session', sessionId],
    queryFn: () => api.lapData.session(sessionId),
    enabled: !!sessionId,
    staleTime: 30_000,
  });
}
