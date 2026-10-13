import { useEffect, useState } from 'react';

// Intro cinematografica dell'hero pubblico (vedi components/landing/HeroIntro.jsx).
// 13/10/2026: prima partiva solo alla prima apertura della sessione
// (sessionStorage), quindi chi ricaricava la home non vedeva più traiettoria
// e ingresso. Ora parte a ogni caricamento della pagina; solo tornando alla
// home con la navigazione interna del sito resta tutto subito visibile.
// Gli effetti si dissolvono comunque dopo l'ingresso (CSS), senza coprire
// il video. Mai con "riduci movimento".
let playedThisLoad = false;

function shouldPlayIntro() {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  return !playedThisLoad;
}

/** 'full' = animazione completa, 'skip' = tutto subito visibile. */
export function useIntroMode() {
  const [mode] = useState(shouldPlayIntro() ? 'full' : 'skip');
  useEffect(() => {
    playedThisLoad = true;
  }, []);
  return mode;
}
