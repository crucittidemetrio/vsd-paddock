// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Seed one-off: bozze evergreen (spotlight + dietro le quinte)
// ═══════════════════════════════════════════════════════════
// Due bozze per riempire da subito il piano editoriale evergreen (tab
// "Piano editoriale" in Social Manager), oltre ai post gara-correlati.
//
// "Pilot spotlight" è lasciato con un placeholder [NOME PILOTA]: non
// invento una biografia o citazioni per un pilota reale senza il suo
// consenso — vai su Post, scegli tu chi presentare, sostituisci il
// placeholder e aggiungi 2-3 frasi vere (com'è arrivato in VSD, il suo
// sim/classe preferita, un aneddoto). "Dietro le quinte" invece è
// pronto così com'è: parla del FuelLog live, funzione reale già in
// produzione, nessun dato personale coinvolto.
//
// Esecuzione: editor Apps Script → dropdown funzioni →
//             seedEvergreenSocialPosts → ▶ Esegui (una volta sola).
// Richiede che setupSocialManagerTabs() sia già stato eseguito.

function seedEvergreenSocialPosts() {
  const sheet = getSheet(SHEETS.SOCIAL_POSTS);
  if (!sheet) {
    Logger.log('✗ Foglio SocialPosts non trovato — esegui prima setupSocialManagerTabs()');
    return;
  }

  const posts = [
    {
      platforms: ['instagram', 'facebook'],
      pillar: 'spotlight',
      link_destination: '/roster',
      content:
        '🎙️ Pilot Spotlight — [NOME PILOTA]\n\n' +
        '[2-3 frasi: da quanto è in VSD, sim/classe preferita, un aneddoto o risultato ' +
        'recente. Dati veri, niente inventato.]\n\n' +
        'Scopri tutto il roster → vsd-paddock.vercel.app/roster\n\n' +
        '#SimRacing #VSD #PilotSpotlight',
    },
    {
      platforms: ['instagram', 'facebook'],
      pillar: 'dietro_quinte',
      link_destination: '',
      content:
        '🔧 Dietro le quinte — come teniamo sotto controllo il carburante in gara\n\n' +
        'Durante le endurance i nostri piloti hanno un\'app companion che legge la telemetria ' +
        'live e manda i dati a VSD Paddock in tempo reale: consumo medio per giro, energia ' +
        'residua, e proiezione automatica di quanto rabbocco serve per arrivare al cambio ' +
        'pilota successivo.\n\n' +
        'Meno calcoli a mente durante lo stint, più concentrazione sulla guida.\n\n' +
        '#SimRacing #VSD #Endurance #DietroLeQuinte',
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
      pillar: p.pillar,
      media_url: '',
    };
    sheet.appendRow(headers.map(h => (row[h] !== undefined ? row[h] : '')));
    results.push(`✓ ${postId} — pillar:${p.pillar}`);
  });

  Logger.log(results.join('\n') + '\n\nLa bozza "spotlight" ha un placeholder [NOME PILOTA] ' +
    'da compilare a mano prima di pubblicare.');
}
