// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Social Manager
// ═══════════════════════════════════════════════════════════
//
// Strumento di pianificazione contenuti social per staff admin.
// Due tab nuovi nel VSD_HUB_DB: SocialPosts (bozze/programmati/
// pubblicati), SocialMetrics (storico follower inserito a mano).
//
// LIMITE STRUTTURALE, non aggirabile: non esiste nessun connettore
// di pubblicazione Facebook/Instagram nel registro MCP (verificato
// esplicitamente). Questo modulo NON pubblica mai nulla in automatico
// su nessun social — "pubblicato" qui significa solo "Demetrio l'ha
// già postato a mano e lo marca come fatto per tenere traccia".
// Se in futuro nasce un connettore reale, questo è il punto dove
// agganciarlo — oggi sarebbe un bottone che finge di funzionare, e
// non lo costruiamo.
//
// Auth: tutte le action qui sono ctx.isAdmin, non ctx.isStaff — su
// richiesta esplicita di Demetrio ("Admin o Team Principal", non i
// piloti normali né lo staff generico). Più stretto del pattern
// usato per BestLaps/Races.
//
// Setup one-time: esegui setupSocialManagerTabs() dall'editor Apps
// Script prima di usare qualunque action di questo file — crea i
// tab se mancanti, idempotente (skip se già esistenti).

const SOCIAL_POSTS_HEADERS = [
  'post_id', 'content', 'platforms', 'status', 'scheduled_date',
  'link_destination', 'created_by', 'created_at', 'updated_at', 'published_at',
];

const SOCIAL_METRICS_HEADERS = [
  'metric_id', 'platform', 'followers', 'recorded_date', 'recorded_by',
];

/**
 * Setup one-time — crea i tab SocialPosts/SocialMetrics se mancanti.
 * Esecuzione: editor Apps Script → dropdown funzioni →
 *             setupSocialManagerTabs → ▶ Esegui (una volta sola).
 */
function setupSocialManagerTabs() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const tabs = [
    { name: SHEETS.SOCIAL_POSTS, headers: SOCIAL_POSTS_HEADERS },
    { name: SHEETS.SOCIAL_METRICS, headers: SOCIAL_METRICS_HEADERS },
  ];

  const results = [];

  tabs.forEach(tab => {
    let sheet = ss.getSheetByName(tab.name);

    if (sheet) {
      results.push(`⚠  Tab "${tab.name}" già esistente — skip`);
      return;
    }

    sheet = ss.insertSheet(tab.name);
    sheet.getRange(1, 1, 1, tab.headers.length).setValues([tab.headers]);

    const headerRange = sheet.getRange(1, 1, 1, tab.headers.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#1f2a44');
    headerRange.setFontColor('#ffffff');
    headerRange.setFontSize(10);
    headerRange.setHorizontalAlignment('left');
    sheet.setFrozenRows(1);

    for (let i = 1; i <= tab.headers.length; i++) {
      sheet.autoResizeColumn(i);
      if (sheet.getColumnWidth(i) < 100) sheet.setColumnWidth(i, 100);
    }

    results.push(`✓  Tab "${tab.name}" creato con ${tab.headers.length} colonne`);
  });

  Logger.log(results.join('\n'));
}

/**
 * Genera un ID progressivo con prefisso, scansionando la colonna A.
 * Stesso pattern di handleLapsAdd (BestLaps.js).
 */
function socialNextId_(sheet, prefix) {
  const data = sheet.getDataRange().getValues();
  let max = 0;
  const re = new RegExp(prefix + '(\\d+)', 'i');
  for (let i = 1; i < data.length; i++) {
    const m = String(data[i][0] || '').match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return prefix + String(max + 1).padStart(3, '0');
}

// ═══════════════════════════════════════════════════════════
// SOCIAL POSTS — CRUD
// ═══════════════════════════════════════════════════════════

/**
 * social.posts.list — Tutti i post, filtro opzionale per status.
 * @param {Object} payload - { status? }
 */
function handleSocialPostsList(payload, ctx) {
  if (!ctx || !ctx.isAdmin) return fail('Accesso riservato ad admin/team principal');

  let posts = sheetToObjects(SHEETS.SOCIAL_POSTS);
  const statusFilter = payload && payload.status;
  if (statusFilter) posts = posts.filter(p => p.status === statusFilter);

  posts.sort((a, b) => {
    const da = a.scheduled_date || a.created_at || '';
    const db = b.scheduled_date || b.created_at || '';
    return String(db).localeCompare(String(da));
  });

  return ok({ posts, count: posts.length });
}

/**
 * social.posts.create — Nuova bozza/post.
 * @param {Object} payload - { content, platforms: string[], scheduled_date?, link_destination? }
 */
function handleSocialPostsCreate(payload, ctx) {
  if (!ctx || !ctx.isAdmin) return fail('Accesso riservato ad admin/team principal');
  if (!payload || !String(payload.content || '').trim()) return fail('content obbligatorio');

  const platforms = Array.isArray(payload.platforms) ? payload.platforms : [];
  if (platforms.length === 0) return fail('Seleziona almeno una piattaforma');

  const sheet = getSheet(SHEETS.SOCIAL_POSTS);
  if (!sheet) return fail('Foglio SocialPosts non trovato — esegui setupSocialManagerTabs() prima');

  const now = new Date().toISOString();
  const postId = socialNextId_(sheet, 'SPOST');

  const newPost = {
    post_id: postId,
    content: payload.content.trim(),
    platforms: platforms.join(','),
    status: 'bozza',
    scheduled_date: payload.scheduled_date || '',
    link_destination: payload.link_destination || '',
    created_by: ctx.driver_id || '',
    created_at: now,
    updated_at: now,
    published_at: '',
  };

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = headers.map(h => (newPost[h] !== undefined ? newPost[h] : ''));
  sheet.appendRow(row);

  return ok({ post_id: postId, post: newPost });
}

/**
 * social.posts.update — Modifica un post esistente, incluso il
 * cambio di status (es. 'programmato' → 'pubblicato' dopo che
 * Demetrio l'ha postato a mano sui social).
 * @param {Object} payload - { post_id, ...campi da aggiornare }
 */
function handleSocialPostsUpdate(payload, ctx) {
  if (!ctx || !ctx.isAdmin) return fail('Accesso riservato ad admin/team principal');

  const postId = payload && payload.post_id;
  if (!postId) return fail('post_id obbligatorio');

  const sheet = getSheet(SHEETS.SOCIAL_POSTS);
  if (!sheet) return fail('Foglio SocialPosts non trovato');

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rowIndex = data.findIndex(row => row[0] === postId);
  if (rowIndex === -1) return fail('Post non trovato: ' + postId);

  const statusColIdx = headers.indexOf('status');
  const currentStatus = statusColIdx !== -1 ? data[rowIndex][statusColIdx] : '';

  const payloadToApply = { ...payload };
  if (Array.isArray(payloadToApply.platforms)) {
    payloadToApply.platforms = payloadToApply.platforms.join(',');
  }
  payloadToApply.updated_at = new Date().toISOString();

  // Se il post passa a 'pubblicato' per la prima volta, timbra published_at.
  if (payloadToApply.status === 'pubblicato' && currentStatus !== 'pubblicato') {
    payloadToApply.published_at = new Date().toISOString();
  }

  const rowToUpdate = rowIndex + 1;
  const updatedFields = [];
  for (const key in payloadToApply) {
    if (key === 'post_id' || key === 'created_at' || key === 'created_by') continue;
    const colIndex = headers.indexOf(key);
    if (colIndex !== -1) {
      sheet.getRange(rowToUpdate, colIndex + 1).setValue(payloadToApply[key]);
      updatedFields.push(key);
    }
  }

  return ok({ post_id: postId, updated: updatedFields });
}

/**
 * social.posts.remove — Elimina un post/bozza.
 * @param {Object} payload - { post_id }
 */
function handleSocialPostsRemove(payload, ctx) {
  if (!ctx || !ctx.isAdmin) return fail('Accesso riservato ad admin/team principal');

  const postId = payload && payload.post_id;
  if (!postId) return fail('post_id obbligatorio');

  const sheet = getSheet(SHEETS.SOCIAL_POSTS);
  if (!sheet) return fail('Foglio SocialPosts non trovato');

  const data = sheet.getDataRange().getValues();
  const rowIndex = data.findIndex(row => row[0] === postId);
  if (rowIndex === -1) return fail('Post non trovato: ' + postId);

  sheet.deleteRow(rowIndex + 1);
  return ok({ post_id: postId, deleted: true });
}

// ═══════════════════════════════════════════════════════════
// SOCIAL METRICS — tracking follower manuale
// ═══════════════════════════════════════════════════════════

/**
 * social.metrics.list — Storico follower, filtro opzionale piattaforma.
 * @param {Object} payload - { platform? }
 */
function handleSocialMetricsList(payload, ctx) {
  if (!ctx || !ctx.isAdmin) return fail('Accesso riservato ad admin/team principal');

  let metrics = sheetToObjects(SHEETS.SOCIAL_METRICS);
  const platformFilter = payload && payload.platform;
  if (platformFilter) metrics = metrics.filter(m => m.platform === platformFilter);

  metrics.sort((a, b) => String(a.recorded_date).localeCompare(String(b.recorded_date)));

  return ok({ metrics, count: metrics.length });
}

/**
 * social.metrics.add — Nuova rilevazione follower (inserita a mano).
 * @param {Object} payload - { platform: 'instagram'|'facebook', followers, recorded_date? }
 */
function handleSocialMetricsAdd(payload, ctx) {
  if (!ctx || !ctx.isAdmin) return fail('Accesso riservato ad admin/team principal');

  const platform = payload && payload.platform;
  const followers = payload && Number(payload.followers);
  if (!platform) return fail('platform obbligatorio');
  if (!followers || followers < 0) return fail('followers non valido');

  const sheet = getSheet(SHEETS.SOCIAL_METRICS);
  if (!sheet) return fail('Foglio SocialMetrics non trovato — esegui setupSocialManagerTabs() prima');

  const metricId = socialNextId_(sheet, 'SMET');
  const newMetric = {
    metric_id: metricId,
    platform,
    followers,
    recorded_date: payload.recorded_date || new Date().toISOString().split('T')[0],
    recorded_by: ctx.driver_id || '',
  };

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = headers.map(h => (newMetric[h] !== undefined ? newMetric[h] : ''));
  sheet.appendRow(row);

  return ok({ metric_id: metricId, metric: newMetric });
}

// ═══════════════════════════════════════════════════════════
// GENERAZIONE TESTO — Anthropic API
// ═══════════════════════════════════════════════════════════
//
// Chiave letta da Script Property ANTHROPIC_API_KEY — mai in chiaro
// nel codice, mai esposta al frontend. Configurazione manuale:
// editor Apps Script → ⚙ Impostazioni progetto → Proprietà script →
// Aggiungi proprietà script → nome ANTHROPIC_API_KEY, valore la tua
// chiave da console.anthropic.com.

const SOCIAL_AI_SYSTEM_PROMPT =
  'Sei il copywriter social di Virtual Sim-Driver (VSD), team italiano di ' +
  'sim racing endurance su Le Mans Ultimate, iRacing e Assetto Corsa Evo. ' +
  'Scrivi in italiano, tono energico ma non urlato, frasi brevi, coerente ' +
  'con contenuti già pubblicati dal team (motorsport reale come riferimento, ' +
  'non gaming casual). Includi 3-6 hashtag pertinenti in fondo. Massimo 80 ' +
  'parole. Rispondi SOLO col testo del post, nessuna premessa o spiegazione.';

/**
 * social.generateText — Genera un testo di post via Claude (Anthropic API).
 * @param {Object} payload - { prompt: string }
 */
function handleSocialGenerateText(payload, ctx) {
  if (!ctx || !ctx.isAdmin) return fail('Accesso riservato ad admin/team principal');

  const prompt = payload && String(payload.prompt || '').trim();
  if (!prompt) return fail('prompt obbligatorio');

  const apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return fail(
      'Chiave AI non configurata. Aggiungi ANTHROPIC_API_KEY nelle Proprietà ' +
      'script del progetto Apps Script (⚙ Impostazioni progetto → Proprietà script).'
    );
  }

  try {
    const response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      payload: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: SOCIAL_AI_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      }),
      muteHttpExceptions: true,
    });

    const status = response.getResponseCode();
    const body = JSON.parse(response.getContentText());

    if (status !== 200) {
      const msg = (body && body.error && body.error.message) || ('HTTP ' + status);
      return fail('Errore Anthropic API: ' + msg);
    }

    const text = body.content && body.content[0] && body.content[0].text;
    if (!text) return fail('Risposta AI vuota o in formato inatteso');

    return ok({ text: text.trim() });
  } catch (e) {
    return fail('Errore chiamata AI: ' + e.message);
  }
}
