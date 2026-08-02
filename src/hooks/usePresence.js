import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from './useAuth';

const HEARTBEAT_INTERVAL_MS = 60000; // deve stare sotto PRESENCE_TTL_SECONDS (90s) lato backend
const ONLINE_POLL_INTERVAL_MS = 25000;

/**
 * Manda un heartbeat periodico finché un pilota VSD autenticato ha
 * l'app aperta. Alimenta presence.online (pallino "online ora" nel
 * Roster). Nessun heartbeat per guest/anonimi — non hanno driver_id.
 *
 * Montato una sola volta a livello di AppShell: gira per tutta la
 * sessione, non solo quando si è sulla pagina Roster.
 */
export function usePresenceHeartbeat() {
  const { isVsdPilot, driver } = useAuth();
  const driverId = driver?.driver_id;

  useEffect(() => {
    if (!isVsdPilot || !driverId) return undefined;

    let cancelled = false;
    const beat = () => {
      if (!cancelled) api.presence.heartbeat().catch(() => {});
    };

    beat(); // subito al mount/login, non aspettare il primo interval
    const id = setInterval(beat, HEARTBEAT_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isVsdPilot, driverId]);
}

/**
 * Polling leggero di chi è online ORA. Usato dal Roster per il pallino
 * verde "live" — non è chat, un ritardo di 20-30s è accettabile.
 *
 * @param {boolean} enabled - passa false per non pollare (es. tab non attiva)
 */
export function usePresenceOnline(enabled = true) {
  return useQuery({
    queryKey: ['presence', 'online'],
    queryFn: () => api.presence.online(),
    enabled,
    refetchInterval: enabled ? ONLINE_POLL_INTERVAL_MS : false,
    staleTime: 15000,
  });
}
