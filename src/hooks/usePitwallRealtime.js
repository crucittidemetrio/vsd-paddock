import { useEffect, useRef, useState } from 'react';
import { getPitwallRealtimeClient } from '../api/supabaseClient';
import { getSupabaseSession, resolveDriverAndTier } from '../api/supabaseAuth';

/**
 * usePitwallRealtime — vista LIVE remota del Pit Wall (#339), alimentata
 * dal canale Supabase Realtime Broadcast privato `pitwall:{team_id}`
 * (infrastruttura backend già chiusa in #263: RLS su `realtime.messages`,
 * azione `pitwall.broadcastLive`). Alternativa via cloud a
 * usePitwallBridge (ws://localhost:8090, invariato) per chi NON sta sullo
 * stesso PC del bridge — vedi cloud/README.md nota #263 sulla scelta
 * "doppio binario": questo hook non sostituisce nulla, si aggiunge.
 *
 * Il bridge C# (#340) pubblica sul canale con throttle più basso del
 * WebSocket locale (pensato per un pannello di controllo a distanza, non
 * per l'HUD di chi guida) — i frame quindi arrivano più radi qui che su
 * usePitwallBridge, per design.
 *
 * Nessuna persistenza: come il bridge originale, i frame live sono
 * effimeri, mai scritti su tabella. Richiede un pilota autenticato del
 * team (stesso gate `pilot_vsd` della pagina /pitwall) — la RLS backend
 * comunque rifiuterebbe un canale di un team diverso dal proprio.
 */
export function usePitwallRealtime() {
  const [status, setStatus] = useState('resolving'); // resolving | connecting | connected | disconnected | no-team
  const [payload, setPayload] = useState(null);
  const [teamId, setTeamId] = useState(null);
  const channelRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    // Client DEDICATO al Realtime (getPitwallRealtimeClient), separato dal
    // client condiviso che gestisce login/sessione/REST — vedi il commento
    // in supabaseClient.js sul perché (regressione reale evitata: mai
    // configurare `accessToken` sul client condiviso).
    const supabase = getPitwallRealtimeClient();

    async function connect() {
      if (!supabase) {
        setStatus('disconnected');
        return;
      }
      const session = await getSupabaseSession();
      const { driver } = await resolveDriverAndTier(session);
      if (cancelled) return;

      if (!driver?.team_id) {
        // Nessuna sessione Supabase reale o nessun driver collegato: la
        // pagina è comunque gated a monte (RequireTier), ma un token
        // scaduto/sessione legacy-only può arrivare fin qui — nessun
        // team_id, nessun canale a cui iscriversi.
        setStatus('no-team');
        return;
      }

      setTeamId(driver.team_id);
      setStatus('connecting');

      const channel = supabase.channel(`pitwall:${driver.team_id}`, {
        config: { private: true },
      });
      channelRef.current = channel;

      channel
        .on('broadcast', { event: 'telemetry' }, ({ payload: framePayload }) => {
          if (!cancelled) setPayload(framePayload);
        })
        .subscribe((subStatus) => {
          if (cancelled) return;
          if (subStatus === 'SUBSCRIBED') setStatus('connected');
          else if (subStatus === 'CLOSED' || subStatus === 'CHANNEL_ERROR' || subStatus === 'TIMED_OUT') {
            setStatus('disconnected');
          }
        });
    }

    connect();

    return () => {
      cancelled = true;
      if (channelRef.current) {
        getPitwallRealtimeClient()?.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);

  return { status, payload, teamId };
}
