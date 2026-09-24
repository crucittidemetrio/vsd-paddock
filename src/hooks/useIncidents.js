import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from './useAuth';

/**
 * useIncidents — registro incidenti/steward (staff only). Unisce le
 * segnalazioni del Modulo reclamo pubblico (sola lettura) con lo stato
 * formalizzato dallo staff.
 */
export function useIncidents(status) {
  const { isStaff } = useAuth();
  return useQuery({
    queryKey: ['incidents', 'list', status || 'all'],
    queryFn: () => api.incidents.list(status ? { status } : {}),
    select: (data) => data?.incidents || [],
    enabled: isStaff,
    staleTime: 30_000,
  });
}

/**
 * useMyIncidents — segnalazioni che riguardano UN singolo pilota (come
 * segnalante o come segnalato), per il pannello "I miei incidenti" sul
 * proprio profilo. Diversa da useIncidents: quella è gated `isStaff` e
 * pensata per il registro completo; questa è pensata per QUALSIASI
 * pilota loggato, incluso uno staff che guarda il proprio profilo (per
 * cui il backend restituirebbe l'intero registro, non solo il suo) —
 * il filtro per driverId qui sotto garantisce lo scoping corretto in
 * entrambi i casi, sopra a quello già applicato dal backend per i
 * piloti non-staff.
 *
 * @param {string} driverId
 */
export function useMyIncidents(driverId) {
  return useQuery({
    queryKey: ['incidents', 'mine', driverId],
    queryFn: () => api.incidents.list({}),
    select: (data) => (data?.incidents || []).filter(
      i => i.reporter_driver_id === driverId || i.against_driver_id === driverId
    ),
    enabled: !!driverId,
    staleTime: 30_000,
  });
}

/**
 * useIncidentsPublicOutcomes — vista pubblica "Esiti" (#408, pagina
 * /reclami), sempre abilitata (nessun gate isStaff/login). Chiama la
 * stessa incidents.list: senza sessione, supabaseApi.js inietta
 * team_slug e l'Edge Function risponde con il ramo pubblico
 * sanitizzato (niente description/staff_notes/contatti — vedi
 * incidents-list/index.ts v5). Filtro status lato server come
 * useIncidents; round/search restano lato client (dataset piccolo,
 * community di un solo team).
 */
export function useIncidentsPublicOutcomes(status) {
  return useQuery({
    queryKey: ['incidents', 'public', status || 'all'],
    queryFn: () => api.incidents.list(status ? { status } : {}),
    select: (data) => data?.incidents || [],
    staleTime: 30_000,
  });
}

/**
 * useReportIncident — invia una segnalazione tramite il form nativo
 * (#351, sostituisce il vecchio Google Form esterno). Pubblica: nessuna
 * sessione richiesta (community-wide, come il Form che sostituisce —
 * l'iniezione automatica di team_slug per i chiamanti anonimi è gestita
 * da supabaseApi.js).
 */
export function useReportIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.incidents.report(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incidents', 'list'] });
    },
  });
}

export function useResolveIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.incidents.resolve(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incidents', 'list'] });
    },
  });
}
