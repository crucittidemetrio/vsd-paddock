// Edge Function — inietta Open Graph / Twitter Card specifici per route
// nell'index.html statico, per dare anteprime corrette quando un link
// vsd-paddock viene condiviso su Facebook, Instagram, Discord, WhatsApp ecc.
//
// Perché serve: quei crawler leggono solo l'HTML iniziale, non eseguono JS.
// Il fallback statico in index.html resta invariato e continua a coprire
// tutte le altre route (non toccato da questo file). Qui sovrascriviamo
// SOLO le route esplicitamente mappate in OG_MAP, tramite un rewrite
// puntuale configurato in vercel.json (nessun catch-all coinvolto).
export const config = { runtime: 'edge' };

const SITE = 'https://vsd-paddock.vercel.app';

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
};

export default async function handler(request) {
  const url = new URL(request.url);
  const route = url.searchParams.get('route');
  const data = OG_MAP[route];

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
