import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';

// Chiave pubblica VAPID — NON è un segreto (il protocollo Web Push la
// invia ai server push di Google/Mozilla per verificare il mittente),
// può stare tranquillamente nel bundle frontend. La privata resta solo
// nell'env Vercel di api/push-send.js.
const VAPID_PUBLIC_KEY = 'BK3tYycdN00hDq8aaHfpCLn4VBZWo_ebd9NWQRbR6fu4nwnf3chcKrJFwb2EC_tNJfxumOWIUN6jE8gG4NClBDs';

// applicationServerKey vuole un Uint8Array, non la stringa base64url —
// conversione standard raccomandata dalla documentazione Push API.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Stato e azioni per le notifiche push del browser corrente. Non
 * assume nulla sull'auth: il chiamante (un componente sul profilo
 * pilota) gate già la visibilità a chi è loggato — qui ci limitiamo a
 * gestire Notification/PushManager e a chiamare push.subscribe /
 * push.unsubscribe sul backend.
 */
function detectPushSupport() {
  return 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined';
}

export function usePushSubscription() {
  // Lazy initializer: sincrono, calcolato una volta sola al mount —
  // nessun bisogno di un effetto solo per un feature-detect puro.
  const [supported] = useState(detectPushSupport);
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [subscribed, setSubscribed] = useState(false);
  // Se il browser non supporta le push non c'è nulla da controllare in
  // async: parte già "non in caricamento" invece di restare bloccato.
  const [loading, setLoading] = useState(supported);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!supported) return;

    (async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        setSubscribed(!!existing);
      } catch {
        // Non blocca la UI — semplicemente parte da "non iscritto".
      } finally {
        setLoading(false);
      }
    })();
  }, [supported]);

  const subscribe = useCallback(async () => {
    setError(null);
    try {
      if (Notification.permission === 'denied') {
        throw new Error(
          'Notifiche bloccate nelle impostazioni del browser — vanno riabilitate da lì, non da qui.'
        );
      }
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        throw new Error('Permesso non concesso.');
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const json = subscription.toJSON();
      await api.push.subscribe({
        endpoint: json.endpoint,
        keys: json.keys,
        user_agent: navigator.userAgent,
      });

      setSubscribed(true);
      return true;
    } catch (e) {
      setError(e.message || 'Errore attivazione notifiche');
      return false;
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        // Best-effort: se questa fallisce la riga resta nel foglio, ma
        // il browser ha già smesso di ricevere — nessun danno per il pilota.
        await api.push.unsubscribe(endpoint).catch(() => {});
      }
      setSubscribed(false);
      return true;
    } catch (e) {
      setError(e.message || 'Errore disattivazione notifiche');
      return false;
    }
  }, []);

  return { supported, permission, subscribed, loading, error, subscribe, unsubscribe };
}
