import { useEffect, useState } from 'react';

const CHECK_INTERVAL_MS = 5 * 60_000; // 5 min

/**
 * #377 (21/09/2026) — causa reale del crash "intermittente"
 * `preferred_sims.split is not a function` su /roster: il codice era
 * già corretto (normalizeRosterDriver in supabaseApi.js, fix #329) in
 * OGNI deploy verificato — il bug non era riproducibile su un tab
 * nuovo, in nessun test. La causa vera è architetturale, non un bug
 * di questo componente: VSD Paddock è una SPA con client-side routing
 * (React Router) dietro un service worker PWA che fa skipWaiting()+
 * clients.claim() silenziosamente ad ogni deploy (vedi public/sw.js).
 * Un tab tenuto aperto per ore (uso normale per una dashboard che si
 * controlla durante una sessione di sim racing) non rifà MAI un fetch
 * di rete per l'HTML/JS finché non naviga o non viene ricaricato — il
 * bundle JS già in memoria resta quello di quando la pagina è stata
 * aperta, anche se nel frattempo sono usciti 10 deploy con fix. Un
 * tab aperto prima di un fix continua quindi a eseguire codice vecchio
 * indefinitamente, riproducendo bug già chiusi da tempo.
 *
 * Fix: non un fix del bug (già chiuso), ma della causa strutturale —
 * rilevare quando il service worker ha installato una versione più
 * recente (un vero aggiornamento, non la prima installazione) e
 * avvisare l'utente con un bottone di refresh esplicito, invece di
 * un reload forzato silenzioso che rischierebbe di far perdere un
 * form aperto (es. Modifica profilo, Risoluzione incidente).
 */
export function useServiceWorkerUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    let cancelled = false;
    let intervalId;

    const watchRegistration = (registration) => {
      if (!registration || cancelled) return;

      const watchInstalling = (installingWorker) => {
        if (!installingWorker) return;
        installingWorker.addEventListener('statechange', () => {
          // 'installed' + un controller già attivo = è un aggiornamento
          // (non la primissima installazione del SW su questo browser).
          if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setUpdateAvailable(true);
          }
        });
      };

      watchInstalling(registration.installing);
      registration.addEventListener('updatefound', () => {
        watchInstalling(registration.installing);
      });

      // Controllo periodico esplicito: i browser ricontrollano un SW
      // solo alla navigazione o ~ogni 24h di default, troppo lento per
      // un tab tenuto aperto per ore durante un progetto con deploy
      // frequenti come questo.
      intervalId = setInterval(() => {
        registration.update().catch(() => {});
      }, CHECK_INTERVAL_MS);
    };

    navigator.serviceWorker.getRegistration().then(watchRegistration).catch(() => {});

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  return {
    updateAvailable,
    reload: () => window.location.reload(),
  };
}
