import { useEffect, useState } from 'react';

// Intro cinematografica dell'hero pubblico (vedi components/landing/HeroIntro.jsx):
// completa solo alla prima apertura della sessione, mai con "riduci movimento".
const SEEN_KEY = 'vsd_intro_seen_v1';

function shouldPlayIntro() {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  try {
    return sessionStorage.getItem(SEEN_KEY) !== '1';
  } catch {
    return true;
  }
}

/** 'full' = animazione completa, 'skip' = tutto subito visibile. */
export function useIntroMode() {
  const [mode] = useState(() => (shouldPlayIntro() ? 'full' : 'skip'));
  useEffect(() => {
    try { sessionStorage.setItem(SEEN_KEY, '1'); } catch { /* storage non disponibile */ }
  }, []);
  return mode;
}

