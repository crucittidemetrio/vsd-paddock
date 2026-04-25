import { useState, useEffect } from 'react';

/**
 * Hook che restituisce il timestamp corrente e si aggiorna a intervalli.
 * Default 1000ms (1s) — usato per countdown live.
 */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}