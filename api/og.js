// Edge Function — inietta Open Graph / Twitter Card specifici per route
// nell'index.html statico, per dare anteprime corrette quando un link
// vsd-paddock viene condiviso su Facebook, Instagram, Discord, WhatsApp ecc.
//
// Perché serve: quei crawler leggono solo l'HTML iniziale, non eseguono JS.
// Il fallback statico in index.html resta invariato e continua a coprire
// tutte le altre route (non toccato da questo file). Qui sovrascriviamo
// SOLO le route esplicitamente mappate in OG_MAP, o le route dinamiche
// (race/championship-detail) risolte via backend, tramite rewrite puntuali
// configurati in vercel.json (nessun catch-all coinvolto).
//
// OG dinamiche (race, championship-detail): la chiamata live al backend
// Apps Script scatta SOLO se lo User-Agent è un crawler noto (Facebook,
// Twitter, Discord, ecc.) — un utente reale che apre /race/:id o
// /championships/:id passa dritto, senza chiamata aggiuntiva, esattamente
// come oggi. Questo evita di consumare quota Apps Script (limitata su
// account consumer) su ogni singola visita reale.
export const config = { runtime: 'edge' };

const SITE = 'https://vsd-paddock.vercel.app';

// Stesso env var usato dal frontend Vite in build — Vercel lo espone
// anche a runtime alle Edge Functions, non solo al build client.
const API_URL = process.env.VITE_API_URL;

const BOT_UA_RE =
  /facebookexternalhit|Facebot|Twitterbot|Discordbot|WhatsApp|TelegramBot|LinkedInBot|Slackbot|SkypeUriPreview|Pinterest|redditbot|vkShare|Applebot|Googlebot|W3C_Validator/i;

// Stringhe di default effettivamente presenti oggi in index.html.
// Se cambi il testo default in index.html, aggiorna anche questi valori
// (sostituzione per corrispondenza esatta di stringa, non regex).
const DEFAULTS = {
  title: 'VSD Paddock — Virtual Sim Driver | Italian Sim Racing Team',
  ogTwitterTitle: 'Virtual Sim Driver — Italian Sim Racing Team',
  metaDescription:
    'Virtual Sim Driver — team italiano di sim racing endurance. 28 piloti su Le Mans Ultimate, iRacing e Assetto Corsa Evo. Risultati, classifiche, calendario gare.',
  ogDescription:
    'Team italiano di sim racing endurance. 28 piloti, multi-sim (LMU, iRacing, ACE). Risultati, classifiche, calendario gare.',
  twitterDescription:
    'Team italiano di sim racing endurance. 28 piloti, multi-sim (LMU, iRacing, ACE).',
  ogTwitterImage: `${SITE}/og-image.png`,
  ogImageWidth: '1200',
  ogImageHeight: '630',
  ogUrl: `${SITE}/`,
};

const OG_MAP = {
  ue144: {
    title: "Ultimate Endurance 144' — VSD Racing",
    description:
      'Campionato endurance VSD su Le Mans Ultimate. 6 round, 3 classi, piloti singoli. Iscrizioni aperte a tutti su SimGrid.',
    image: `${SITE}/ue144.banner.jpg`,
    imageWidth: '1536',
    imageHeight: '1024',
    url: `${SITE}/ue144`,
  },
  joinus: {
    title: 'Unisciti a VSD — Virtual Sim Driver',
    description:
      'Cerchiamo piloti motivati per la stagione 2026. Endurance, sprint, multi-sim: scegli la tua categoria.',
    image: `${SITE}/og-image.png`,
    imageWidth: '1200',
    imageHeight: '630',
    url: `${SITE}/joinus`,
  },
  championships: {
    title: 'Campionati — VSD Paddock',
    description:
      'Tutti i campionati di Virtual Sim-Driver: classifiche, round e risultati in tempo reale.',
    image: `${SITE}/og-image.png`,
    imageWidth: '1200',
    imageHeight: '630',
    url: `${SITE}/championships`,
  },
  roster: {
    title: 'Roster piloti — VSD Paddock',
    description:
      'Tutti i piloti di Virtual Sim-Driver: profili, numero di gara, simulatori attivi.',
    image: `${SITE}/og-image.png`,
    imageWidth: '1200',
    imageHeight: '630',
    url: `${SITE}/roster`,
  },
  training: {
    title: 'Allenamento — VSD Paddock',
    description:
      'Riepilogo allenamento per pilota su Le Mans Ultimate, iRacing e Assetto Corsa Evo — giri, gap dal record squadra, readiness pre-gara.',
    image: `${SITE}/og-image.png`,
    imageWidth: '1200',
    imageHeight: '630',
    url: `${SITE}/training`,
  },
  records: {
    title: 'Muro dei Record — VSD Paddock',
    description:
      'Il giro più veloce mai registrato dal team, pista per pista, su tutti i simulatori.',
    image: `${SITE}/og-image.png`,
    imageWidth: '1200',
    imageHeight: '630',
    url: `${SITE}/records`,
  },
  recap: {
    title: 'Season Recap — VSD Paddock',
    description:
      'Il riepilogo di stagione di ogni pilota VSD: risultati, punti e momenti salienti.',
    image: `${SITE}/og-image.png`,
    imageWidth: '1200',
    imageHeight: '630',
    url: `${SITE}/recap`,
  },
};

// POST verso il backend Apps Script, stesso protocollo di src/api/realApi.js
// (body JSON in text/plain per evitare preflight CORS). token: null → ctx
// anonimo lato backend, sufficiente per races.get e championships.list che
// sono già letture pubbliche.
async function fetchBackend_(action, payload) {
  if (!API_URL) return null;
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({ action, token: null, payload: payload || {} }),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    });
    const json = await res.json();
    return json && json.ok ? json.data : null;
  } catch {
    return null;
  }
}

async function resolveDynamicOg_(route, id) {
  if (!id) return null;

  if (route === 'race') {
    const data = await fetchBackend_('races.get', { race_id: id });
    const race = data && data.race;
    if (!race) return null;
    return {
      title: `${race.race_name || 'Gara'} — VSD Paddock`,
      description:
        `Risultati, classifica e best lap${race.round ? ` — Round ${race.round}` : ''} di ` +
        `${race.championship_name || 'questa gara'} su VSD Paddock.`,
      image: race.poster_url || `${SITE}/og-image.png`,
      imageWidth: '1200',
      imageHeight: '630',
      url: `${SITE}/race/${id}`,
    };
  }

  if (route === 'championship-detail') {
    const data = await fetchBackend_('championships.list', {});
    const list = (data && data.championships) || [];
    const champ = list.find(c => String(c.id) === String(id));
    if (!champ) return null;
    return {
      title: `${champ.name || 'Campionato'} — VSD Paddock`,
      description:
        `Campionato${champ.sim ? ' ' + champ.sim : ''}${champ.season ? ' stagione ' + champ.season : ''} ` +
        `su VSD Paddock. Classifiche, round e risultati in tempo reale.`,
      image: champ.banner_url || `${SITE}/og-image.png`,
      imageWidth: '1200',
      imageHeight: '630',
      url: `${SITE}/championships/${id}`,
    };
  }

  return null;
}

export default async function handler(request) {
  const url = new URL(request.url);
  const route = url.searchParams.get('route');
  const id = url.searchParams.get('id');

  let data = OG_MAP[route];

  if (!data && id && (route === 'race' || route === 'championship-detail')) {
    const ua = request.headers.get('user-agent') || '';
    if (BOT_UA_RE.test(ua)) {
      data = await resolveDynamicOg_(route, id);
    }
  }

  const htmlRes = await fetch(new URL('/index.html', url.origin));
  let html = await htmlRes.text();

  if (data) {
    html = html
      .replace(`<title>${DEFAULTS.title}</title>`, `<title>${data.title}</title>`)
      .replaceAll(`content="${DEFAULTS.ogTwitterTitle}"`, `content="${data.title}"`)
      .replace(`content="${DEFAULTS.metaDescription}"`, `content="${data.description}"`)
      .replace(`content="${DEFAULTS.ogDescription}"`, `content="${data.description}"`)
      .replace(`content="${DEFAULTS.twitterDescription}"`, `content="${data.description}"`)
      .replaceAll(`content="${DEFAULTS.ogTwitterImage}"`, `content="${data.image}"`)
      .replace(`content="${DEFAULTS.ogImageWidth}"`, `content="${data.imageWidth}"`)
      .replace(`content="${DEFAULTS.ogImageHeight}"`, `content="${data.imageHeight}"`)
      .replace(`content="${DEFAULTS.ogUrl}"`, `content="${data.url}"`)
      .replace(
        `<link rel="canonical" href="${DEFAULTS.ogUrl}" />`,
        `<link rel="canonical" href="${data.url}" />`
      );
  }

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
