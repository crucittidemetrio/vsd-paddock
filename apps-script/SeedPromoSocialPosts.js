// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Seed one-off: bozze social per il promo "tour app"
// ═══════════════════════════════════════════════════════════
// Crea due bozze in SocialPosts (status 'bozza', non pubblicate) per
// il video promo vsd-promo-iconic-gte.mp4 (media/ nel repo): una per
// Instagram/Facebook, una per Discord — stesso video, testo adattato
// al tono di ciascuna piattaforma.
//
// NON allega il video: media_url richiede un file già presente in
// Media Gallery (upload via browser su Vercel Blob, richiede sessione
// utente — non eseguibile da qui). Dopo aver lanciato questa funzione,
// apri Social Manager → Media Gallery, carica il file
// vsd-promo-iconic-gte.mp4, poi vai sul post in bozza (tab Post) e
// collegalo con "Usa nel post".
//
// Esecuzione: editor Apps Script → dropdown funzioni →
//             seedPromoSocialPosts → ▶ Esegui (una volta sola).
// Richiede che setupSocialManagerTabs() sia già stato eseguito.

function seedPromoSocialPosts() {
  const sheet = getSheet(SHEETS.SOCIAL_POSTS);
  if (!sheet) {
    Logger.log('✗ Foglio SocialPosts non trovato — esegui prima setupSocialManagerTabs()');
    return;
  }

  const posts = [
    {
      platforms: ['instagram', 'facebook'],
      content:
        'Stagione conclusa, ma il viaggio continua. 🏁\n' +
        'Ecco cosa ti aspetta dentro VSD Paddock: Mission Control, Roster, Race Hub, ' +
        'Campionati, Confronto Piloti, Muro dei Record — tutto quello che serve a un ' +
        'pilota per correre sul serio.\n\n' +
        '28 piloti attivi. 3 simulatori. Una squadra sola.\n\n' +
        'Unisciti a noi → discord.gg/virtualsimdriver\n\n' +
        '#SimRacing #Esports #VSD #LMU #iRacing',
      link_destination: '/joinus',
    },
    {
      platforms: ['discord'],
      content:
        'Un piccolo giro dentro VSD Paddock 👇\n' +
        'Mission Control, Roster, Race Hub, Campionati, Confronto Piloti e il Muro dei ' +
        'Record — la nostra webapp per gestire tutto quello che serve a una squadra da corsa.\n\n' +
        '28 piloti attivi, 3 simulatori. Se non l\'hai ancora vista, dai un\'occhiata → ' +
        'vsd-paddock.vercel.app',
      link_destination: '/joinus',
    },
  ];

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const results = [];

  posts.forEach(p => {
    const now = new Date().toISOString();
    const postId = socialNextId_(sheet, 'SPOST');
    const row = {
      post_id: postId,
      content: p.content,
      platforms: p.platforms.join(','),
      status: 'bozza',
      scheduled_date: '',
      link_destination: p.link_destination,
      created_by: 'DEMETRIO-6899',
      created_at: now,
      updated_at: now,
      published_at: '',
      race_id: '',
      pillar: '',
      media_url: '',
    };
    sheet.appendRow(headers.map(h => (row[h] !== undefined ? row[h] : '')));
    results.push(`✓ ${postId} — ${p.platforms.join('/')}`);
  });

  Logger.log(results.join('\n') + '\n\nOra vai su Social Manager → Media Gallery, carica ' +
    'vsd-promo-iconic-gte.mp4, poi collegalo a ciascuna bozza da "Usa nel post".');
}
