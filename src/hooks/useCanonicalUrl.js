import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Mantiene il tag <link rel="canonical"> sincronizzato con il path corrente.
 *
 * L'app è una SPA: il canonical di partenza in index.html è statico e punta
 * sempre alla home. Senza questo hook, Google vede lo stesso canonical su
 * ogni pagina (/ue144, /roster/:driverId, /championships/:id, ecc.) e le
 * tratta come duplicati della home, escludendole dall'indicizzazione.
 *
 * Va montato una sola volta in un componente che vive per tutta la sessione
 * di navigazione (qui: AppShell), non in ogni singola pagina — così nessuna
 * nuova route rischia di essere dimenticata.
 */
export function useCanonicalUrl() {
  const location = useLocation();

  useEffect(() => {
    const link = document.querySelector('link[rel="canonical"]');
    if (!link) return;
    link.setAttribute('href', `${window.location.origin}${location.pathname}`);
  }, [location.pathname]);
}
