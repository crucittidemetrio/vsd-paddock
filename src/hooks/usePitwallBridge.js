import { useEffect, useRef, useState } from 'react';

const DEFAULT_URL = 'ws://localhost:8090/ws/';
const RECONNECT_DELAY_MS = 2000;

/**
 * Si collega al VSD Pitwall Bridge (cartella vsd-pitwall-bridge/ nel repo,
 * eseguibile .NET locale che legge lo Scoring buffer di LMU via shared
 * memory e fa broadcast via WebSocket).
 *
 * IMPORTANTE — non è un servizio cloud: funziona SOLO nel browser del PC
 * che sta anche eseguendo il bridge (ws://localhost:8090). Non c'è nessun
 * canale verso il backend Apps Script qui: è un flusso locale a parte,
 * pensato per chi gestisce la strategia dalla stessa postazione dove gira
 * LMU. Uno snapshot riassuntivo di fine stint/sessione verso Apps Script è
 * un passo separato, non ancora implementato (vedi README del bridge).
 */
export function usePitwallBridge(url = DEFAULT_URL) {
  const [status, setStatus] = useState('connecting'); // connecting | connected | disconnected
  const [payload, setPayload] = useState(null);
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    function scheduleReconnect() {
      if (cancelled || reconnectTimerRef.current) return;
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        connect();
      }, RECONNECT_DELAY_MS);
    }

    function connect() {
      if (cancelled) return;
      setStatus((prev) => (prev === 'connected' ? prev : 'connecting'));

      let ws;
      try {
        ws = new WebSocket(url);
      } catch {
        // URL non valido o WebSocket non disponibile in questo contesto:
        // riprova comunque, non blocchiamo il resto della pagina.
        scheduleReconnect();
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        if (!cancelled) setStatus('connected');
      };

      ws.onmessage = (event) => {
        if (cancelled) return;
        try {
          setPayload(JSON.parse(event.data));
        } catch {
          // pacchetto malformato: ignora, il prossimo arriva tra ~200ms
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (cancelled) return;
        setStatus('disconnected');
        scheduleReconnect();
      };
      // onerror non serve gestirlo separatamente: per un WebSocket nativo
      // onclose viene sempre chiamato subito dopo, ed è lì che gestiamo
      // sia il cambio di stato che il retry.
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [url]);

  return { status, payload };
}
