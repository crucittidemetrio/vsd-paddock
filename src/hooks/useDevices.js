import { useMutation } from '@tanstack/react-query';
import { api } from '../api/client';

/**
 * useCreateCompanionToken — genera un token long-lived (180gg) per
 * autenticare il companion app fuel/energy (script locale che legge la
 * shared memory di Le Mans Ultimate). Nessuna invalidation di query:
 * il token non è letto da nessuna query, solo mostrato una tantum
 * all'utente per copiarlo nel proprio config.json.
 */
export function useCreateCompanionToken() {
  return useMutation({
    mutationFn: () => api.devices.createToken(),
  });
}
