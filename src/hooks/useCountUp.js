import { useEffect, useRef, useState } from 'react';

// Micro-interazione richiesta da Demetrio (25/09/2026, "rendere la UI
// più accattivante") — le stat di Mission Control (Best Laps/Gare
// disputate/Podi/Vittorie) erano numeri statici, spesso mostrati a "0"
// al primo render prima che landing.data risponda: un salto secco da
// vuoto a valore reale. Un count-up ease-out (0 → target) rende quel
// momento un piccolo "reveal" invece di uno scatto, senza inventare
// dati: il valore finale resta identico, cambia solo come ci si arriva.
//
// Rispetta prefers-reduced-motion (skip diretto al valore finale — la
// regola globale in index.css azzera le transition-duration CSS, ma
// qui l'animazione è guidata da requestAnimationFrame in JS, quindi va
// intercettata esplicitamente) e usa un ease-out standard (1 - (1-t)^3)
// coerente con le altre transizioni del sito (var(--t-base), 150-300ms
// di norma — qui più lungo, ~700ms, perché anima un valore numerico
// non un hover).
//
// Nota: quando reduced-motion è attivo o il target è 0, il valore
// finale viene restituito direttamente (nessun setState sincrono
// dentro l'effect, per rispettare react-hooks/set-state-in-effect) —
// setValue viene chiamato solo dentro il callback asincrono di rAF.
export function useCountUp(target, { duration = 700 } = {}) {
  const numericTarget = Number(target) || 0;
  const [value, setValue] = useState(numericTarget);
  const [prefersReduced] = useState(() => typeof window !== 'undefined'
    && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const frameRef = useRef(null);
  const prevTargetRef = useRef(numericTarget);
  const skip = prefersReduced || numericTarget === 0;

  useEffect(() => {
    if (skip) {
      prevTargetRef.current = numericTarget;
      return;
    }

    const from = prevTargetRef.current;
    const delta = numericTarget - from;
    if (delta === 0) return;

    const start = performance.now();
    function tick(now) {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + delta * eased));
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        prevTargetRef.current = numericTarget;
      }
    }
    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- duration è una config statica, non serve nelle dep
  }, [numericTarget, skip]);

  return skip ? numericTarget : value;
}
