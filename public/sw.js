// VSD Paddock — Service Worker (v1)
// ═══════════════════════════════════════════════════════════
// Scopo v1: rendere il sito installabile (requisito PWA: un SW
// registrato con un fetch handler, anche minimale). Le notifiche push
// NON sono ancora implementate — richiedono un'infrastruttura a parte
// (VAPID keys, storage delle subscription, un trigger lato backend).
//
// Strategia di cache pensata per non servire mai contenuto vecchio
// dopo un deploy:
//  - Navigazioni (HTML) → network-first: sempre l'ultima versione se
//    online, cache solo come fallback offline.
//  - Asset con hash nel nome (/assets/*.js, /assets/*.css) → cache-first:
//    sicuro perché ogni build Vite genera nomi file nuovi, non c'è
//    rischio di restare agganciati a un bundle vecchio.
//  - Tutto il resto (chiamate all'API Apps Script, richieste POST,
//    domini esterni) → passa dritto alla rete, mai intercettato.
// ═══════════════════════════════════════════════════════════

const CACHE_VERSION = 'vsd-paddock-v1';
const OFFLINE_URL = '/';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Solo GET: mai intercettare POST (tutte le chiamate API del sito
  // sono POST verso Apps Script) o altri metodi.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Solo same-origin: le richieste verso script.google.com (API) e altri
  // domini esterni passano dritte, senza passare dalla cache.
  if (url.origin !== self.location.origin) return;

  // Navigazioni (cambio pagina / refresh) → network-first.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(CACHE_VERSION);
          cache.put(OFFLINE_URL, fresh.clone());
          return fresh;
        } catch (e) {
          const cache = await caches.open(CACHE_VERSION);
          const cached = await cache.match(OFFLINE_URL);
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  // Asset hashati (/assets/...) → cache-first, sicuro perché il nome
  // file cambia ad ogni build.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_VERSION);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const fresh = await fetch(request);
          if (fresh.ok) cache.put(request, fresh.clone());
          return fresh;
        } catch (e) {
          return Response.error();
        }
      })()
    );
  }
  // Tutto il resto (immagini, manifest, ecc.) → passa dritto alla rete,
  // nessuna intercettazione.
});
