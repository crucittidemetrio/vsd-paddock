// ═══════════════════════════════════════════════════════════
// DISCORD WEBHOOK NOTIFICATIONS
// Posta messaggi al canale Discord configurato.
// Fault-tolerant: try/catch ovunque, non blocca mai l'operazione chiamante.
// ═══════════════════════════════════════════════════════════

const VSD_COLORS = {
  cyan:    0x00d9ff,   // brand primary
  green:   0x4ade80,   // success / podio
  orange:  0xfbbf24,   // warning
  red:     0xf87171,   // error
  blue:    0x3b82f6,   // info
  purple:  0xa855f7,   // best lap
};

const PADDOCK_URL = 'https://vsd-paddock.vercel.app';

/**
 * Posta un messaggio JSON a Discord.
 * Mai blocca il chiamante: cattura errori, logga e ritorna.
 */
function postToDiscord_(payload) {
  try {
    const url = PropertiesService.getScriptProperties().getProperty('DISCORD_WEBHOOK_URL');
    if (!url) {
      Logger.log('⚠️  DISCORD_WEBHOOK_URL non configurato in Script Properties');
      return { ok: false, error: 'webhook_not_configured' };
    }
    
    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    
    const status = response.getResponseCode();
    if (status >= 200 && status < 300) {
      Logger.log('✅ Discord notification posted');
      return { ok: true };
    }
    Logger.log('⚠️  Discord webhook returned ' + status + ': ' + response.getContentText());
    return { ok: false, error: 'http_' + status };
  } catch (e) {
    Logger.log('⚠️  Discord webhook error: ' + e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * Notifica: nuova gara importata con i suoi risultati.
 * 
 * @param {Object} race - record Race con race_id, race_name, sim, championship_id?
 * @param {Object} stats - { imported, vsd_matched, external, dnf, dns }
 */
function notifyRaceImported_(race, stats) {
  if (!race) return;
  
  const totalDrivers = stats.imported || 0;
  const vsdCount = stats.vsd_matched || 0;
  
  const payload = {
    embeds: [{
      author: { name: 'VSD Paddock' },
      title: '🏁 Nuovo risultato gara importato',
      description: '**' + (race.race_name || race.race_id) + '**',
      color: VSD_COLORS.cyan,
      fields: [
        { name: 'Sim',         value: race.sim || '?',              inline: true },
        { name: 'Risultati',   value: String(totalDrivers),         inline: true },
        { name: 'VSD',         value: String(vsdCount),             inline: true },
      ],
      timestamp: new Date().toISOString(),
      footer: { text: 'Apri Race Hub per dettagli' },
      url: PADDOCK_URL + '/race/' + race.race_id,
    }],
  };
  
  postToDiscord_(payload);
}

/**
 * Notifica: podio VSD in una sessione race (NON heat, NON qualifying).
 * Chiamata UNA volta per podio.
 */
function notifyVsdPodium_(driverName, position, race, sessionType) {
  if (!driverName || !position || !race) return;
  if (sessionType !== 'race') return; // skip heat e qualifying
  if (position > 3) return;
  
  const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
  const posLabels = { 1: 'P1 — VITTORIA', 2: 'P2', 3: 'P3' };
  
  const payload = {
    embeds: [{
      author: { name: 'VSD Paddock' },
      title: medals[position] + ' Podio VSD!',
      description: '**' + driverName + '** ' + posLabels[position] + '\n' +
                   (race.race_name || race.race_id),
      color: position === 1 ? VSD_COLORS.green : VSD_COLORS.cyan,
      fields: [
        { name: 'Sim',  value: race.sim || '?', inline: true },
      ],
      timestamp: new Date().toISOString(),
      url: PADDOCK_URL + '/race/' + race.race_id,
    }],
  };
  
  postToDiscord_(payload);
}

/**
 * Notifica: campionato concluso, incorona il/i campione/i (uno per classe).
 * Deduplicata via Script Properties — non ripete l'annuncio se il vincitore
 * non cambia tra un re-import e l'altro dello stesso standings_json.
 *
 * @param {Object} championship - { id, name, season }
 * @param {Array}  classResults - [{ class_name, winner_name, winner_points }]
 */
function notifyChampionshipCrowned_(championship, classResults) {
  if (!championship || !classResults || classResults.length === 0) return;

  const dedupKey = 'champion_notified_' + championship.id;
  const winnersSignature = JSON.stringify(
    classResults.map(c => c.class_name + ':' + c.winner_name)
  );
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(dedupKey) === winnersSignature) return; // già annunciato, nessuna variazione
  props.setProperty(dedupKey, winnersSignature);

  const fields = classResults.map(c => ({
    name: c.class_name,
    value: '🏆 **' + c.winner_name + '** — ' + c.winner_points + ' pt',
    inline: true,
  }));

  const payload = {
    embeds: [{
      author: { name: 'VSD Paddock' },
      title: '🏆 Campionato concluso — ' + (championship.name || championship.id),
      description: 'Stagione ' + (championship.season || '') + ' · Complimenti ai campioni!',
      color: VSD_COLORS.orange,
      fields: fields,
      timestamp: new Date().toISOString(),
      footer: { text: 'Classifica completa sul Paddock' },
      url: PADDOCK_URL + '/championships/' + championship.id,
    }],
  };

  postToDiscord_(payload);
}

/**
 * Notifica: aggiustamento punti manuale applicato da staff/admin
 * (penalità post-gara, scarto risultato, bonus). Trasparenza verso il team.
 *
 * @param {Object} championship - { id, name }
 * @param {Object} adjustment   - { driver_key, car_class, delta, reason? }
 */
function notifyPointsAdjustment_(championship, adjustment) {
  if (!championship || !adjustment) return;

  const driverName = _snDriverName_(adjustment.driver_key);
  const delta = Number(adjustment.delta) || 0;
  const deltaLabel = delta > 0 ? '+' + delta : String(delta);
  const isPenalty = delta < 0;

  const payload = {
    embeds: [{
      author: { name: 'VSD Paddock' },
      title: (isPenalty ? '⚠️' : '➕') + ' Aggiustamento punti applicato',
      description: '**' + driverName + '** (' + (adjustment.car_class || '?') + ')\n' +
                   (championship.name || championship.id),
      color: isPenalty ? VSD_COLORS.red : VSD_COLORS.blue,
      fields: [
        { name: 'Δ Punti', value: deltaLabel, inline: true },
        { name: 'Motivo',  value: adjustment.reason || '—', inline: true },
      ],
      timestamp: new Date().toISOString(),
      url: PADDOCK_URL + '/championships/' + championship.id,
    }],
  };

  postToDiscord_(payload);
}

/**
 * Notifica: nuovo record di squadra su una pista — il giro più veloce
 * mai fatto lì da un tesserato attivo, qualsiasi session_type (stesso
 * criterio del Muro dei Record, Records.js). Chiamata da handleLapsAdd
 * in BestLaps.js solo quando il giro appena inserito batte il record
 * precedente (o è il primo giro mai registrato su quella pista/sim).
 *
 * @param {Object} lap - { driver_name, sim, track_name, lap_time_display }
 * @param {string|null} previousDisplay - tempo del record precedente,
 *   o null se è il primo giro mai registrato su quella pista/sim
 */
function notifyNewTeamRecord_(lap, previousDisplay) {
  if (!lap) return;

  const payload = {
    embeds: [{
      author: { name: 'VSD Paddock' },
      title: '🏆 Nuovo record di squadra!',
      description: '**' + lap.driver_name + '** — ' + lap.track_name + ' (' + lap.sim + ')\n' +
                   '⏱️ **' + lap.lap_time_display + '**' +
                   (previousDisplay ? ' _(precedente: ' + previousDisplay + ')_' : ' _(primo tempo registrato su questa pista)_'),
      color: VSD_COLORS.purple,
      timestamp: new Date().toISOString(),
      footer: { text: 'Muro dei Record' },
      url: PADDOCK_URL + '/records',
    }],
  };

  postToDiscord_(payload);
}

/**
 * Helper test — verifica l'embed "nuovo record" con dati finti.
 * Non tocca nessun foglio Google Sheets, nessun giro reale.
 * Dropdown function → test_notification_record → ▶ Esegui
 */
function test_notification_record() {
  notifyNewTeamRecord_(
    { driver_name: '🧪 Pilota Test', sim: 'LMU', track_name: 'Circuito di Prova', lap_time_display: '1:30.000' },
    '1:31.500'
  );
}

/**
 * Helper test — esegui manualmente per verificare che il webhook funzioni.
 * Dropdown function → test_notification → ▶ Esegui
 */
function test_notification() {
  postToDiscord_({
    embeds: [{
      author: { name: 'VSD Paddock' },
      title: '🧪 Test notifica',
      description: 'Se vedi questo messaggio, il webhook funziona correttamente.',
      color: VSD_COLORS.cyan,
      timestamp: new Date().toISOString(),
    }],
  });
}

/**
 * Helper test — verifica l'embed "aggiustamento punti" con dati finti.
 * Non tocca nessun foglio Google Sheets, nessun campionato reale.
 * Dropdown function → test_notification_adjustment → ▶ Esegui
 */
function test_notification_adjustment() {
  notifyPointsAdjustment_(
    { id: 'chmp-test', name: '🧪 Campionato di Prova' },
    { driver_key: 'TEST_DRIVER_NON_ESISTE', car_class: 'GT3', delta: -5, reason: 'Test — ignora questo messaggio' }
  );
}
// ═══════════════════════════════════════════════════════════
// STINT NOTIFICATIONS — avvisi Discord pre-cambio pilota
// ═══════════════════════════════════════════════════════════

const STINT_NOTIFY_THRESHOLD_MIN = 30;
const STINT_NOTIFY_PROP_PREFIX   = 'stint_notified_';

function checkStintNotifications_() {
  try {
    const enabled = PropertiesService.getScriptProperties().getProperty('STINT_NOTIFY_ENABLED');
    if (enabled !== 'true') return; // interruttore spento → esce subito

    const races = _snLoadInProgressRaces_();
    if (races.length === 0) return;
    const nowMs = Date.now();
    const props = PropertiesService.getScriptProperties();
    races.forEach(race => {
      const stints = _esLoadAll_(race.race_id);
      if (!stints || stints.length === 0) return;
      stints.forEach(s => {
        const status = String(s.status || '').toLowerCase();
        if (status === 'completed' || status === 'aborted') return;
        const startMs = new Date(s.planned_start_time).getTime();
        if (isNaN(startMs)) return;
        const minsToStart = (startMs - nowMs) / 60000;
        if (minsToStart <= 0 || minsToStart > STINT_NOTIFY_THRESHOLD_MIN) return;
        const key = STINT_NOTIFY_PROP_PREFIX + s.stint_id;
        if (props.getProperty(key)) return;
        const driverName = _snDriverName_(s.driver_id);
        const isFirst = Number(s.stint_order) === 1;
        _snSendStintAlert_(race, s, driverName, Math.round(minsToStart), isFirst);
        props.setProperty(key, new Date(nowMs).toISOString());
      });
    });
  } catch (e) {
    Logger.log('checkStintNotifications_ error: ' + e.message);
  }
}

function _snLoadInProgressRaces_() {
  try {
    const rows = getCachedSheetData_(SHEETS.RACES, 900);
    return rows.filter(r => String(r.status || '').toLowerCase() === 'in_progress');
  } catch (e) {
    Logger.log('_snLoadInProgressRaces_ error: ' + e.message);
    return [];
  }
}

function _snDriverName_(driverId) {
  if (!driverId) return 'Pilota';
  try {
    const drivers = getCachedSheetData_(SHEETS.DRIVERS, 600);
    const d = drivers.find(x => x.driver_id === driverId);
    return d && d.display_name ? d.display_name : driverId;
  } catch (e) {
    return driverId;
  }
}

function _snSendStintAlert_(race, stint, driverName, minsToStart, isFirst) {
  const raceName = race.race_name || race.race_id;
  const order = stint.stint_order;
  const title = isFirst ? '🏁 ' + raceName + ' — Via!' : '🔄 Cambio pilota tra ~' + minsToStart + ' min';
  const desc = isFirst
    ? '**' + driverName + '** al via nel primo stint. In bocca al lupo! 🍀'
    : 'Preparati **' + driverName + '** — stint ' + order + ' tra circa ' + minsToStart + ' minuti.';
  postToDiscord_({
    embeds: [{
      title: title,
      description: desc,
      color: isFirst ? VSD_COLORS.green : VSD_COLORS.orange,
      footer: { text: raceName + ' · Stint ' + order },
      url: PADDOCK_URL + '/race/' + race.race_id,
    }],
  });
}

function runStintNotificationsCheck() {
  checkStintNotifications_();
}