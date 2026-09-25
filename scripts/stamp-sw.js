// Timbra dist/sw.js con una CACHE_VERSION unica per ogni deploy.
//
// Prima di questo script, CACHE_VERSION era una stringa fissa
// ('vsd-paddock-v1') che non cambiava mai tra un deploy e l'altro.
// L'handler 'activate' del service worker cancella solo le cache con
// una chiave diversa da CACHE_VERSION — se la chiave resta identica
// per sempre, la pulizia non scatta MAI: un bundle vecchio (index.html
// cache-first come fallback offline + asset hashati) poteva restare
// bloccato sul dispositivo indefinitamente, anche con la logica di
// aggiornamento in useServiceWorkerUpdate.js (che sblocca solo se il
// browser arriva a scaricare ed eseguire il nuovo bundle — se il tab è
// bloccato su codice vecchissimo, quel codice potrebbe non esserci
// nemmeno più).
//
// Con una versione diversa ad ogni build (SHA del commit su Vercel,
// timestamp in locale), ogni deploy forza il browser a svuotare la
// cache precedente e ripartire pulito — stesso principio del cache
// busting sugli asset hashati di Vite, applicato al service worker
// stesso.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const swPath = resolve(__dirname, '../dist/sw.js');

const buildId =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ||
  process.env.VERCEL_DEPLOYMENT_ID ||
  `local-${Date.now()}`;

const contents = readFileSync(swPath, 'utf8');
const stamped = contents.replace(
  /const CACHE_VERSION = ['"][^'"]*['"];/,
  `const CACHE_VERSION = 'vsd-paddock-${buildId}';`
);

if (stamped === contents) {
  throw new Error('stamp-sw: pattern CACHE_VERSION non trovato in dist/sw.js — controlla che public/sw.js non sia stato rinominato o riscritto.');
}

writeFileSync(swPath, stamped, 'utf8');
console.log(`stamp-sw: CACHE_VERSION impostata a vsd-paddock-${buildId}`);
