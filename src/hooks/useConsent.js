import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from './useAuth';
import { driverPhotoUrl } from '../utils/driverPhotos';

// Attivo solo per chi ha un driver_id reale (pilot_vsd/staff/admin) —
// guest e anonimi non hanno nulla da accettare.
export function useConsentStatus() {
  const { driver, isVsdPilot } = useAuth();
  return useQuery({
    queryKey: ['consent', 'status', driver?.driver_id],
    queryFn: () => api.consent.status(),
    enabled: !!driver?.driver_id && isVsdPilot,
    staleTime: 60_000,
  });
}

export function useAcceptConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.consent.accept(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consent'] }),
  });
}

export function useConsentAdminList() {
  const { isAdmin } = useAuth();
  return useQuery({
    queryKey: ['consent', 'adminList'],
    queryFn: () => api.consent.adminList(),
    enabled: isAdmin,
    staleTime: 30_000,
  });
}

// Solo i flag social_consent per driver_id — pubblico, nessun login
// richiesto: serve anche su pagine viste da visitatori anonimi (es.
// Roster), che è esattamente dove va decisa la foto vera vs iniziali.
export function useConsentSocialFlags() {
  return useQuery({
    queryKey: ['consent', 'socialFlags'],
    queryFn: () => api.consent.socialFlags(),
    staleTime: 5 * 60_000,
  });
}

/**
 * URL della foto reale di un pilota, SOLO se disponibile E il pilota
 * ha dato consenso social per la versione corrente del documento.
 * Fail-safe: finché i flag non sono arrivati (o in errore), nessuna
 * foto — mai un fallback ottimistico che la mostri senza consenso
 * confermato. Il chiamante ricade su avatar/iniziali quando torna null.
 */
export function useConsentedDriverPhoto(driverId) {
  const flagsQuery = useConsentSocialFlags();
  const url = driverPhotoUrl(driverId);
  if (!url) return null;
  if (!flagsQuery.data?.flags?.[driverId]) return null;
  return url;
}
