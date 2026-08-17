// VSD Paddock — Service Worker (v2)
// ═══════════════════════════════════════════════════════════
// Rende il sito installabile (requisito PWA: un SW registrato con un
// fetch handler) e gestisce la ricezione/click delle Web Push (vedi
// in fondo al file) — l'invio vero e proprio parte da
// apps-script/Push.js tramite il relay Vercel api/push-send.js.
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

self.addEventListener('install', () => {
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
        } catch {
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
        } catch {
          return Response.error();
        }
      })()
    );
  }
  // Tutto il resto (immagini, manifest, ecc.) → passa dritto alla rete,
  // nessuna intercettazione.
});

// ─── Web Push ───
// Il payload arriva già cifrato/decifrato dal browser (il relay Vercel
// in api/push-send.js si occupa della cifratura lato server) — qui
// arriva come JSON in chiaro: { title, body, url }.
self.addEventListener('push', (event) => {
  let data = { title: 'VSD Paddock', body: 'Nuova notifica' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // payload non-JSON — usa i default sopra invece di far fallire tutto
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url || '/' },
    })
  );
});

// Click sulla notifica → porta alla pagina indicata, riusando una tab
// già aperta del sito se esiste invece di aprirne una nuova ogni volta.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = allClients.find((c) => new URL(c.url).origin === self.location.origin);
      if (existing) {
        await existing.focus();
        if ('navigate' in existing) await existing.navigate(targetUrl);
        return;
      }
      await clients.openWindow(targetUrl);
    })()
  );
});
