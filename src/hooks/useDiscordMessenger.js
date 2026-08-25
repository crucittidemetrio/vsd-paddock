import { useMutation } from '@tanstack/react-query';
import { api } from '../api/client';

/**
 * Compilatore messaggi Discord — staff (canale o DM). Nessuna query di
 * lettura: è un invio stateless, non c'è uno storico da mostrare qui
 * (per quello c'è il Registro di controllo, vedi useAuditLog.js).
 */
export function useMessengerSend() {
  return useMutation({
    mutationFn: (payload) => api.messenger.send(payload),
  });
}
