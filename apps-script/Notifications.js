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
 * Posta un messaggio JSON a Discord usando l'URL salvato in una
 * Script Property. Mai blocca il chiamante: cattura errori, logga
 * e ritorna.
 *
 * @param {Object} payload - embed Discord
 * @param {string} propertyName - nome della Script Property col webhook URL
 */
function postToDiscordWebhook_(payload, propertyName) {
  try {
    const url = PropertiesService.getScriptProperties().getProperty(propertyName);
    if (!url) {
      Logger.log('⚠️  ' + propertyName + ' non configurato in Script Properties');
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
      Logger.log('✅ Discord notification posted (' + propertyName + ')');
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
 * Posta al webhook pubblico (canale notizie/annunci del team).
 * Mai blocca il chiamante: cattura errori, logga e ritorna.
 */
function postToDiscord_(payload) {
  return postToDiscordWebhook_(payload, 'DISCORD_WEBHOOK_URL');
}

/**
 * Posta al webhook admin/staff-only (canale ⛔staff-only) — usato per
 * notifiche operative che riguardano solo lo staff (es. coda di
 * validazione Best Lap), non i piloti in generale.
 */
function postToDiscordAdmin_(payload) {
  return postToDiscordWebhook_(payload, 'DISCORD_WEBHOOK_ADMIN_URL');
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
 *
 * @param {string|null} driverId - se noto e con consenso social attivo
 *   (hasSocialConsent_, Consent.js), aggiunge la foto del pilota come
 *   thumbnail dell'embed. Opzionale: senza, la notifica resta solo
 *   testuale come prima.
 */
function notifyVsdPodium_(driverName, position, race, sessionType, driverId) {
  if (!driverName || !position || !race) return;
  if (sessionType !== 'race') return; // skip heat e qualifying
  if (position > 3) return;

  const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
  const posLabels = { 1: 'P1 — VITTORIA', 2: 'P2', 3: 'P3' };

  const embed = {
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
  };
  if (driverId && hasSocialConsent_(driverId)) {
    embed.thumbnail = { url: PADDOCK_URL + '/drivers/' + driverId + '.jpg' };
  }

  postToDiscord_({ embeds: [embed] });
}

/**
 * Notifica: lo staff ha formalizzato lo stato/penalità di un incidente
 * (Registro incidenti). Canale staff-only — non pubblico: sono decisioni
 * di stewarding, non vanno annunciate automaticamente ai piloti.
 *
 * @param {Object} incident - riga arricchita da handleIncidentsResolve
 *   (reporter_sim, against, track, status, penalty_type?, penalty_detail?)
 */
function notifyIncidentResolved_(incident) {
  if (!incident) return;

  const statusLabels = { open: 'Aperto', reviewing: 'In revisione', closed: 'Chiuso' };
  const embed = {
    author: { name: 'VSD Paddock — Steward' },
    title: '🚩 Incidente aggiornato: ' + (statusLabels[incident.status] || incident.status),
    description: (incident.reporter_sim || '?') + ' → ' + (incident.against || '?') +
                 (incident.track ? '\n' + incident.track : ''),
    color: incident.status === 'closed' ? VSD_COLORS.green : VSD_COLORS.orange,
    fields: [],
    timestamp: new Date().toISOString(),
    footer: { text: 'Registro incidenti · Admin' },
  };
  if (incident.penalty_type) {
    embed.fields.push({
      name: 'Penalità',
      value: incident.penalty_type + (incident.penalty_detail ? ' — ' + incident.penalty_detail : ''),
      inline: true,
    });
  }

  postToDiscordAdmin_({ embeds: [embed] });
}

/**
 * Notifica: nuovo candidato aggiunto alla pipeline (Candidates.js).
 * Canale staff-only — è uno strumento di coordinamento interno tra staff,
 * non un annuncio per i piloti. Chiamata da handleCandidatesAdd.
 *
 * @param {Object} candidate - riga appena creata (display_name, source, sim_preference?)
 */
function notifyNewCandidate_(candidate) {
  if (!candidate || !candidate.display_name) return;

  const embed = {
    author: { name: 'VSD Paddock — Selezione' },
    title: '📋 Nuovo candidato in pipeline',
    description: '**' + candidate.display_name + '**' +
                 (candidate.sim_preference ? ' · ' + candidate.sim_preference : ''),
    color: VSD_COLORS.blue,
    fields: [
      { name: 'Fonte', value: candidate.source || '—', inline: true },
    ],
    timestamp: new Date().toISOString(),
    footer: { text: 'Pipeline candidature · Admin' },
    url: PADDOCK_URL + '/admin/candidates',
  };

  postToDiscordAdmin_({ embeds: [embed] });
}

/**
 * Notifica: nuovo sponsor/lead aggiunto al CRM (Sponsors.js). Canale
 * staff-only — informazioni di business, mai pubbliche. Distinta da
 * notifySponsorActivated_: questa scatta alla CREAZIONE del lead (stato
 * iniziale 'lead'), non quando la trattativa si chiude con successo.
 *
 * @param {Object} sponsor - riga appena creata (company_name, contact_name?, value_estimate?)
 */
function notifyNewSponsorLead_(sponsor) {
  if (!sponsor || !sponsor.company_name) return;

  const embed = {
    author: { name: 'VSD Paddock — Partnership' },
    title: '🆕 Nuovo lead sponsor',
    description: '**' + sponsor.company_name + '**' +
                 (sponsor.contact_name ? ' — ' + sponsor.contact_name : ''),
    color: VSD_COLORS.blue,
    fields: sponsor.value_estimate ? [{ name: 'Valore stimato', value: String(sponsor.value_estimate), inline: true }] : [],
    timestamp: new Date().toISOString(),
    footer: { text: 'CRM Sponsor · Admin' },
    url: PADDOCK_URL + '/admin/sponsors',
  };

  postToDiscordAdmin_({ embeds: [embed] });
}

/**
 * Push PERSONALE ai piloti coinvolti in un incidente appena formalizzato
 * dallo staff — segnalante ed accusato, se noti come tesserati VSD.
 * Distinta da notifyIncidentResolved_ (canale staff-only, contiene anche
 * penalty_detail per lo stewarding interno): questa va DIRETTAMENTE ai
 * piloti, quindi il corpo del messaggio resta agli stessi campi già
 * visibili loro in app (status, penalty_type — MAI staff_notes).
 *
 * @param {Object} incident - riga arricchita (reporter_driver_id?,
 *   against_driver_id?, status, penalty_type?, track?)
 */
function notifyIncidentResolvedPush_(incident) {
  if (!incident) return;
  const statusLabels = { open: 'Aperto', reviewing: 'In revisione', closed: 'Chiuso' };
  const targets = Array.from(new Set(
    [incident.reporter_driver_id, incident.against_driver_id].filter(Boolean)
  ));
  if (targets.length === 0) return;

  const body = 'Stato: ' + (statusLabels[incident.status] || incident.status) +
    (incident.penalty_type ? ' · ' + incident.penalty_type : '') +
    (incident.track ? ' · ' + incident.track : '');

  sendPushNotification_(targets, {
    title: '🚩 Un tuo incidente è stato aggiornato',
    body: body,
    url: PADDOCK_URL + '/roster',
  });
}

/**
 * Notifica: uno sponsor è passato allo stato 'active' (CRM sponsor).
 * Canale staff-only — informazioni di business, mai pubbliche.
 *
 * @param {Object} sponsor - { company_name, value_estimate? }
 */
function notifySponsorActivated_(sponsor) {
  if (!sponsor || !sponsor.company_name) return;

  const embed = {
    author: { name: 'VSD Paddock — Partnership' },
    title: '🤝 Nuovo sponsor attivo!',
    description: '**' + sponsor.company_name + '**' + (sponsor.value_estimate ? '\n' + sponsor.value_estimate : ''),
    color: VSD_COLORS.green,
    timestamp: new Date().toISOString(),
    footer: { text: 'CRM Sponsor · Admin' },
  };

  postToDiscordAdmin_({ embeds: [embed] });
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
 * @param {Object} lap - { driver_name, driver_id?, sim, track_name, lap_time_display }
 *   driver_id opzionale: se presente e con consenso social attivo,
 *   aggiunge la foto del pilota come thumbnail dell'embed.
 * @param {string|null} previousDisplay - tempo del record precedente,
 *   o null se è il primo giro mai registrato su quella pista/sim
 */
function notifyNewTeamRecord_(lap, previousDisplay) {
  if (!lap) return;

  const embed = {
    author: { name: 'VSD Paddock' },
    title: '🏆 Nuovo record di squadra!',
    description: '**' + lap.driver_name + '** — ' + lap.track_name + ' (' + lap.sim + ')\n' +
                 '⏱️ **' + lap.lap_time_display + '**' +
                 (previousDisplay ? ' _(precedente: ' + previousDisplay + ')_' : ' _(primo tempo registrato su questa pista)_'),
    color: VSD_COLORS.purple,
    timestamp: new Date().toISOString(),
    footer: { text: 'Muro dei Record' },
    url: PADDOCK_URL + '/records',
  };
  if (lap.driver_id && hasSocialConsent_(lap.driver_id)) {
    embed.thumbnail = { url: PADDOCK_URL + '/drivers/' + lap.driver_id + '.jpg' };
  }

  postToDiscord_({ embeds: [embed] });
}

// ═══════════════════════════════════════════════════════════
// MILESTONE / ACHIEVEMENT NOTIFICATIONS
// Soglie di gare disputate (session_type 'race', non DNS) per pilota VSD.
// Chiamata dal pipeline di import risultati (RaceResultsImport.js) dopo
// ogni gara importata, con la lista dei driver_id VSD coinvolti. Il
// controllo è puramente "il conteggio attuale coincide con una soglia?" —
// nessuna deduplica esplicita necessaria: un secondo import della stessa
// gara non crea nuove righe in RaceResults, quindi il conteggio non
// ricambia e la notifica non riparte (stesso principio "non bloccante"
// delle altre notifiche in questo file).
// ═══════════════════════════════════════════════════════════

// Soglie allineate a DriverProfile.jsx (veteranTier/podiumTier/winTier) —
// stessa progressione mostrata come badge "Traguardi" sul profilo pilota.
const MILESTONE_THRESHOLDS = [1, 10, 25, 50, 100, 150, 200, 250, 300];
const PODIUM_MILESTONE_THRESHOLDS = [1, 5, 10, 25, 50];
const WIN_MILESTONE_THRESHOLDS = [1, 5, 10, 25];

const MILESTONE_LABELS = {
  1:   'Debutto in gara! 🎉',
  10:  '10 gare disputate',
  25:  '25 gare disputate',
  50:  '50 gare disputate',
  100: '100 gare disputate — un secolo! 💯',
  150: '150 gare disputate',
  200: '200 gare disputate',
  250: '250 gare disputate',
  300: '300 gare disputate',
};

const PODIUM_MILESTONE_LABELS = {
  1: 'Primo podio! 🎉',
  5: '5 podi',
  10: '10 podi',
  25: '25 podi',
  50: '50 podi',
};

const WIN_MILESTONE_LABELS = {
  1: 'Prima vittoria! 🎉',
  5: '5 vittorie',
  10: '10 vittorie',
  25: '25 vittorie',
};

/**
 * Controlla, per ogni driver_id passato, se il conteggio totale di gare
 * disputate / podi / vittorie (RaceResults, session_type 'race', non DNS)
 * coincide con una soglia. Se sì, invia una notifica Discord. Fault-
 * tolerant: try/catch interno, non blocca mai il chiamante.
 *
 * @param {Array<string>} driverIds - driver_id VSD coinvolti nell'import
 *   appena completato (anche duplicati, anche DNS/DNF: i conteggi reali
 *   vengono ricalcolati dalla sheet, questi id sono solo "chi controllare").
 */
function checkAndNotifyMilestones_(driverIds) {
  try {
    if (!driverIds || driverIds.length === 0) return;
    const uniqueIds = Array.from(new Set(driverIds.filter(Boolean).map(String)));
    if (uniqueIds.length === 0) return;

    const allResults = sheetToObjects(SHEETS.RACE_RESULTS);
    const drivers = getCachedSheetData_(SHEETS.DRIVERS, 600);
    const driverMap = {};
    drivers.forEach(d => { driverMap[d.driver_id] = d; });

    uniqueIds.forEach(driverId => {
      const driverRaceResults = allResults.filter(r =>
        String(r.driver_id || '').trim() === driverId &&
        String(r.session_type || 'race').toLowerCase() === 'race' &&
        String(r.dns).toUpperCase() !== 'TRUE'
      );
      const racesCount = driverRaceResults.length;
      const podiumsCount = driverRaceResults.filter(r =>
        String(r.dnf).toUpperCase() !== 'TRUE' &&
        Number(r.finish_position) > 0 && Number(r.finish_position) <= 3
      ).length;
      const winsCount = driverRaceResults.filter(r =>
        String(r.dnf).toUpperCase() !== 'TRUE' && Number(r.finish_position) === 1
      ).length;

      const driver = driverMap[driverId];

      if (MILESTONE_THRESHOLDS.indexOf(racesCount) !== -1) {
        notifyMilestoneReached_(driver, driverId, MILESTONE_LABELS[racesCount] || (racesCount + ' gare disputate'));
      }
      if (PODIUM_MILESTONE_THRESHOLDS.indexOf(podiumsCount) !== -1) {
        notifyMilestoneReached_(driver, driverId, PODIUM_MILESTONE_LABELS[podiumsCount]);
      }
      if (WIN_MILESTONE_THRESHOLDS.indexOf(winsCount) !== -1) {
        notifyMilestoneReached_(driver, driverId, WIN_MILESTONE_LABELS[winsCount]);
      }
    });
  } catch (e) {
    Logger.log('⚠️  checkAndNotifyMilestones_ error (non-blocking): ' + e.message);
  }
}

/**
 * Notifica: "Pilota della gara" — miglior prestazione VSD nella gara
 * appena importata (session_type 'race'). Criterio: tra i piloti VSD
 * arrivati al traguardo (no DNF/DNS) si preferisce chi ha MENO incidenti
 * noti (0 se disponibile), e a parità la miglior posizione normalizzata
 * sulla dimensione reale della propria classe in QUESTA gara (stessa
 * normalizzazione di computeFieldSizes_/SkillIndex.js, ma calcolata sulla
 * singola gara appena importata, non su una finestra rolling di 15 gare
 * — sono due indicatori distinti con scopi diversi, non duplicati).
 * Premia quindi la guida pulita prima del piazzamento puro. Chiamata da
 * handleRaceResultsImport dopo un import 'race' (LMU o iRacing — legge
 * direttamente RaceResults già scritto, quindi format-agnostic). Fault-
 * tolerant: try/catch, non blocca mai l'import.
 *
 * @param {Object} race - { race_id, race_name, sim }
 */
function checkAndNotifyRaceMvp_(race) {
  try {
    if (!race || !race.race_id) return;

    const allResults = sheetToObjects(SHEETS.RACE_RESULTS);
    const raceRows = allResults.filter(r =>
      String(r.race_id) === String(race.race_id) &&
      String(r.session_type || 'race').toLowerCase() === 'race'
    );
    if (raceRows.length === 0) return;

    const fieldSizes = computeFieldSizes_(raceRows);

    const vsdFinishers = raceRows.filter(r =>
      String(r.is_vsd_driver).toUpperCase() === 'TRUE' &&
      String(r.dnf).toUpperCase() !== 'TRUE' &&
      String(r.dns).toUpperCase() !== 'TRUE' &&
      Number(r.finish_position) > 0
    );
    if (vsdFinishers.length === 0) return;

    const scored = vsdFinishers.map(r => {
      const pos = Number(r.finish_position);
      const fieldSize = fieldSizes[r.race_id + '__' + r.car_class] || 0;
      const finishPct = (fieldSize >= 3)
        ? Math.max(0, Math.min(1, 1 - (pos - 1) / (fieldSize - 1)))
        : 0;
      const incidents = (r.incidents !== '' && r.incidents != null && !isNaN(Number(r.incidents)))
        ? Number(r.incidents) : null;
      return { row: r, finishPct, incidents };
    });

    // Guida pulita prima: incidenti noti e più bassi vincono. "Incidenti
    // sconosciuti" va in coda (non premiato né penalizzato rispetto a chi
    // ha 0 noti, ma nemmeno preferito). A parità, miglior finishPct.
    scored.sort((a, b) => {
      const ai = a.incidents === null ? Infinity : a.incidents;
      const bi = b.incidents === null ? Infinity : b.incidents;
      if (ai !== bi) return ai - bi;
      return b.finishPct - a.finishPct;
    });

    const mvp = scored[0];
    if (!mvp || mvp.finishPct <= 0) return; // campo troppo piccolo per un piazzamento significativo

    const driverId = mvp.row.driver_id;
    const drivers = getCachedSheetData_(SHEETS.DRIVERS, 600);
    const driver = drivers.find(d => d.driver_id === driverId);
    const displayName = (driver && driver.display_name) || driverId;

    const cleanLine = mvp.incidents === 0 ? ' · guida pulita (0 incidenti)'
      : (mvp.incidents != null ? ' · ' + mvp.incidents + ' incidenti' : '');

    const embed = {
      author: { name: 'VSD Paddock' },
      title: '⭐ Pilota della gara',
      description: '**' + displayName + '** — P' + Number(mvp.row.finish_position) +
                   ' (' + (mvp.row.car_class || '?') + ')' + cleanLine + '\n' +
                   (race.race_name || race.race_id),
      color: VSD_COLORS.green,
      timestamp: new Date().toISOString(),
      footer: { text: 'Selezionato su piazzamento normalizzato + pulizia di guida' },
      url: PADDOCK_URL + '/race/' + race.race_id,
    };
    if (hasSocialConsent_(driverId)) {
      embed.thumbnail = { url: PADDOCK_URL + '/drivers/' + driverId + '.jpg' };
    }

    postToDiscord_({ embeds: [embed] });

    // Push PERSONALE al pilota selezionato — un riconoscimento pubblico
    // ma vale la pena che lo sappia subito anche se non ha Discord aperto.
    sendPushNotification_([driverId], {
      title: '⭐ Sei il Pilota della gara!',
      body: (race.race_name || race.race_id) + ' — P' + Number(mvp.row.finish_position) + cleanLine,
      url: PADDOCK_URL + '/race/' + race.race_id,
    });
  } catch (e) {
    Logger.log('⚠️  checkAndNotifyRaceMvp_ error (non-blocking): ' + e.message);
  }
}

/**
 * Notifica: un pilota VSD ha raggiunto un traguardo (gare/podi/vittorie).
 *
 * @param {Object} driver - record Drivers (display_name), può essere null
 *   se il driver_id non è (più) in anagrafica
 * @param {string} driverId
 * @param {string} label - etichetta già risolta del traguardo (es. "10 gare disputate")
 */
function notifyMilestoneReached_(driver, driverId, label) {
  if (!label) return;
  const displayName = (driver && driver.display_name) || driverId;

  const embed = {
    author: { name: 'VSD Paddock' },
    title: '🎖️ Traguardo raggiunto!',
    description: '**' + displayName + '** — ' + label,
    color: VSD_COLORS.orange,
    timestamp: new Date().toISOString(),
    footer: { text: 'Continua così!' },
    url: PADDOCK_URL + '/roster/' + driverId,
  };
  if (hasSocialConsent_(driverId)) {
    embed.thumbnail = { url: PADDOCK_URL + '/drivers/' + driverId + '.jpg' };
  }

  postToDiscord_({ embeds: [embed] });

  // Push PERSONALE al pilota interessato — un traguardo è un momento suo,
  // merita di raggiungerlo anche se non ha Discord aperto in quel momento.
  sendPushNotification_([driverId], {
    title: '🎖️ Traguardo raggiunto!',
    body: label,
    url: PADDOCK_URL + '/roster/' + driverId,
  });
}

/**
 * Notifica: un pilota VSD ha inviato un nuovo Best Lap con foto di prova,
 * in attesa di validazione. Va al webhook admin/staff-only (⛔staff-only),
 * non al canale pubblico — è un compito per lo staff, non un annuncio.
 * Chiamata da handleLapSubmissionsSubmit in BestLaps.js.
 *
 * @param {Object} submission - { driver_name, sim, track_id, lap_time_display, submission_id }
 */
function notifyNewLapSubmission_(submission) {
  if (!submission) return;

  const payload = {
    embeds: [{
      author: { name: 'VSD Paddock' },
      title: '📸 Nuovo Best Lap da validare',
      description: '**' + submission.driver_name + '** — ' + submission.track_id + ' (' + submission.sim + ')\n' +
                   '⏱️ **' + submission.lap_time_display + '**',
      color: VSD_COLORS.orange,
      timestamp: new Date().toISOString(),
      footer: { text: submission.submission_id },
      url: PADDOCK_URL + '/best-laps',
    }],
  };

  postToDiscordAdmin_(payload);
}

/**
 * Helper test — verifica l'embed "nuovo Best Lap da validare" con dati
 * finti, sul webhook admin. Dropdown function → test_notification_lap_submission → ▶ Esegui
 */
function test_notification_lap_submission() {
  notifyNewLapSubmission_({
    driver_name: '🧪 Pilota Test',
    sim: 'LMU',
    track_id: 'circuito_di_prova',
    lap_time_display: '1:30.000',
    submission_id: 'SUB000',
  });
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
 * Helper test — esegue checkAndNotifyRaceMvp_ su una gara REALE già
 * importata (a differenza degli altri test_notification_*, qui non ha
 * senso un embed finto: serve leggere RaceResults vero per calcolare il
 * piazzamento normalizzato). Se la gara non ha risultati 'race' con
 * piloti VSD arrivati al traguardo, non invia nulla — controlla il log.
 * Dropdown function → test_race_mvp → ▶ Esegui (modifica TEST_RACE_ID
 * sotto con un race_id reale prima di lanciarla).
 */
function test_race_mvp() {
  const TEST_RACE_ID = 'INSERISCI_RACE_ID_REALE';
  const races = getCachedSheetData_(SHEETS.RACES, 900);
  const race = races.find(r => r.race_id === TEST_RACE_ID);
  if (!race) {
    Logger.log('⚠️  race_id non trovato: ' + TEST_RACE_ID + ' — modifica TEST_RACE_ID in test_race_mvp()');
    return;
  }
  checkAndNotifyRaceMvp_(race);
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
 * Helper test — verifica l'embed "nuovo candidato" con dati finti.
 * Non tocca nessun foglio Google Sheets, nessun candidato reale.
 * Dropdown function → test_notification_candidate → ▶ Esegui
 */
function test_notification_candidate() {
  notifyNewCandidate_({
    display_name: '🧪 Candidato Test',
    sim_preference: 'LMU',
    source: 'Google Form',
  });
}

/**
 * Helper test — verifica l'embed "nuovo lead sponsor" con dati finti.
 * Non tocca nessun foglio Google Sheets, nessuno sponsor reale.
 * Dropdown function → test_notification_sponsor_lead → ▶ Esegui
 */
function test_notification_sponsor_lead() {
  notifyNewSponsorLead_({
    company_name: '🧪 Sponsor Test SRL',
    contact_name: 'Mario Rossi',
    value_estimate: '500€/stagione',
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

  // Push PERSONALE al pilota di questo stint, oltre all'annuncio Discord
  // pubblico sopra — è lui/lei che deve sapere di prepararsi, non solo il
  // canale team in generale.
  if (stint.driver_id) {
    const pushTitle = isFirst ? '🏁 Sei al via!' : '🔄 Il tuo stint si avvicina';
    const pushBody = isFirst
      ? raceName + ' — primo stint, in bocca al lupo!'
      : raceName + ' — stint ' + order + ' tra circa ' + minsToStart + ' min.';
    sendPushNotification_([stint.driver_id], {
      title: pushTitle,
      body: pushBody,
      url: PADDOCK_URL + '/race/' + race.race_id,
    });
  }
}

function runStintNotificationsCheck() {
  checkStintNotifications_();
}

// ═══════════════════════════════════════════════════════════
// DIGEST SETTIMANALE — riepilogo Discord ogni 7 giorni
// Da installare come trigger orario (Apps Script editor → icona orologio
// "Trigger" a sinistra → Aggiungi trigger → funzione: runWeeklyDigest →
// origine evento: basato sul tempo → timer settimanale, consigliato
// lunedì mattina). Nessun trigger viene creato automaticamente da questo
// codice — va aggiunto manualmente una volta sola.
// ═══════════════════════════════════════════════════════════

/**
 * Costruisce e posta il riepilogo degli ultimi 7 giorni: gare disputate,
 * podi VSD, miglior giro della settimana, prossima gara in calendario.
 * Se non c'è stato nessun risultato nell'ultima settimana E non c'è
 * nessuna gara futura da annunciare, non invia nulla (evita digest vuoti
 * nelle settimane morte). Fault-tolerant: try/catch, non lancia mai.
 *
 * Wave successiva: oltre al post Discord (pubblico, come prima), il
 * digest va anche in push broadcast a tutti i piloti iscritti — è un
 * "richiamo" pensato apposta per chi non apre Discord regolarmente.
 */
function postWeeklyDigest_() {
  try {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);

    const allResults = sheetToObjects(SHEETS.RACE_RESULTS);
    const races = getCachedSheetData_(SHEETS.RACES, 900);
    const racesById = {};
    races.forEach(r => { racesById[r.race_id] = r; });
    const drivers = getCachedSheetData_(SHEETS.DRIVERS, 600);
    const driverMap = {};
    drivers.forEach(d => { driverMap[d.driver_id] = d; });
    const activeDrivers = drivers.filter(d => d.status === 'active' && !d.removed_at);

    const weekResults = allResults.filter(r => {
      if (String(r.is_vsd_driver).toUpperCase() !== 'TRUE') return false;
      if (String(r.session_type || 'race').toLowerCase() !== 'race') return false;
      if (String(r.dns).toUpperCase() === 'TRUE') return false;
      const d = new Date(r.set_date);
      return !isNaN(d.getTime()) && d >= weekAgo && d <= now;
    });

    // Prossima gara scheduled più vicina (qualsiasi distanza futura, non
    // solo entro la settimana) — dà un motivo di aprire l'app anche nelle
    // settimane senza risultati recenti da mostrare.
    const upcomingRace = races
      .filter(r => String(r.status).toLowerCase() === 'scheduled')
      .map(r => ({ race: r, date: parseRaceDate(r.date) }))
      .filter(x => x.date && x.date >= now)
      .sort((a, b) => a.date - b.date)[0];

    if (weekResults.length === 0 && !upcomingRace) {
      Logger.log('📅 Digest settimanale: nessun risultato negli ultimi 7 giorni e nessuna gara futura, invio saltato');
      return;
    }

    const raceIds = Array.from(new Set(weekResults.map(r => r.race_id)));

    const podiums = weekResults
      .filter(r => String(r.dnf).toUpperCase() !== 'TRUE' && Number(r.finish_position) > 0 && Number(r.finish_position) <= 3)
      .sort((a, b) => Number(a.finish_position) - Number(b.finish_position));

    let best = null;
    weekResults.forEach(r => {
      const ms = Number(r.best_lap_ms);
      if (ms > 0 && (!best || ms < Number(best.best_lap_ms))) best = r;
    });

    const fields = [];
    if (weekResults.length > 0) {
      fields.push({ name: 'Gare disputate', value: String(raceIds.length), inline: true });
      fields.push({ name: 'Risultati VSD', value: String(weekResults.length), inline: true });
    }

    if (podiums.length > 0) {
      const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
      const podiumLines = podiums.slice(0, 8).map(r => {
        const driver = driverMap[r.driver_id];
        const name = driver ? driver.display_name : r.driver_id;
        const race = racesById[r.race_id];
        return medals[Number(r.finish_position)] + ' **' + name + '** — ' +
          (race ? (race.race_name || race.race_id) : r.race_id);
      }).join('\n');
      fields.push({ name: 'Podi della settimana', value: podiumLines, inline: false });
    }

    if (best) {
      const driver = driverMap[best.driver_id];
      const name = driver ? driver.display_name : best.driver_id;
      const race = racesById[best.race_id];
      fields.push({
        name: 'Miglior giro della settimana',
        value: '⏱️ **' + name + '** — ' + msToLapDisplay_(Number(best.best_lap_ms)) + ' (' +
          (race ? (race.race_name || race.race_id) : best.race_id) + ')',
        inline: false,
      });
    }

    let upcomingLabel = null;
    if (upcomingRace) {
      const race = upcomingRace.race;
      const allRsvps = sheetToObjects(SHEETS.RACE_RSVPS);
      const confirmedCount = allRsvps.filter(r =>
        r.race_id === race.race_id && String(r.status) === 'confirmed'
      ).length;
      const dateLabel = upcomingRace.date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
      upcomingLabel = (race.race_name || race.race_id) + ' — ' + dateLabel;
      fields.push({
        name: 'Prossima gara',
        value: '🏁 **' + upcomingLabel + '**\n' +
          'Confermati: ' + confirmedCount + '/' + activeDrivers.length,
        inline: false,
      });
    }

    postToDiscord_({
      embeds: [{
        author: { name: 'VSD Paddock' },
        title: '📅 Riepilogo settimanale',
        description: 'Cosa è successo negli ultimi 7 giorni sul Paddock',
        color: VSD_COLORS.blue,
        fields: fields,
        timestamp: new Date().toISOString(),
        footer: { text: 'Prossimo digest tra 7 giorni' },
        url: PADDOCK_URL,
      }],
    });

    // Push broadcast — stesso contenuto in forma sintetica, a tutti i
    // piloti iscritti (sendPushNotification_(null, ...) = broadcast,
    // stesso pattern di checkAndNotifyUpcomingRacePush_ in Push.js).
    // Serve a riportare dentro chi non controlla Discord regolarmente.
    const pushBodyParts = [];
    if (weekResults.length > 0) {
      pushBodyParts.push(raceIds.length + ' gare, ' + podiums.length + ' podi VSD');
    }
    if (upcomingLabel) {
      pushBodyParts.push('Prossima: ' + upcomingLabel);
    }
    if (pushBodyParts.length > 0) {
      sendPushNotification_(null, {
        title: '📅 Riepilogo settimanale VSD Paddock',
        body: pushBodyParts.join(' · '),
        url: PADDOCK_URL,
      });
    }

    Logger.log('✅ Digest settimanale inviato (' + weekResults.length + ' risultati, ' + podiums.length + ' podi, prossima gara: ' + (upcomingLabel || 'nessuna') + ')');
  } catch (e) {
    Logger.log('⚠️  postWeeklyDigest_ error: ' + e.message);
  }
}

/**
 * Entry point per il trigger orario — vedi commento di sezione sopra per
 * come installarlo. Nome scelto per essere selezionabile facilmente dal
 * dropdown dei trigger.
 */
function runWeeklyDigest() {
  postWeeklyDigest_();
}

/**
 * Helper test — esegue il digest sui dati REALI (a differenza degli altri
 * test_notification_*, qui non ha senso un embed finto: il digest riflette
 * la sheet vera). Se non ci sono risultati nell'ultima settimana, non
 * invia nulla — controlla il log di esecuzione.
 * Dropdown function → test_weekly_digest → ▶ Esegui
 */
function test_weekly_digest() {
  postWeeklyDigest_();
}

// ═══════════════════════════════════════════════════════════
// AUGURI DI COMPLEANNO AUTOMATICI — #bar-sport
// ═══════════════════════════════════════════════════════════
//
// Il consenso (Consents, foglio scritto da Consent.js) raccoglie
// birth_date come testo 'YYYY-MM-DD' — vedi Consent.js riga ~167.
// Usiamo quel dato, già raccolto per altri scopi, per augurare buon
// compleanno ai piloti nel canale social del team (#bar-sport, non
// annunci pubblici né staff-only: serve un webhook dedicato, vedi
// postToDiscordBarSport_ sotto).
//
// Copertura parziale per costruzione: solo i piloti che hanno già dato
// consenso finiscono in Consents con una birth_date. Non è un bug — è
// il perimetro reale dei dati raccolti, cresce mano a mano che più
// piloti completano il consenso.
//
// Privacy: confrontiamo solo giorno/mese. L'anno di nascita non viene
// mai letto per il messaggio — resta nel foglio Consents, non passa
// mai per Discord.

/**
 * Posta al webhook dedicato #bar-sport (canale social/casual del team,
 * separato da annunci pubblici e staff-only) — usato per messaggi
 * informali come gli auguri di compleanno automatici.
 */
function postToDiscordBarSport_(payload) {
  return postToDiscordWebhook_(payload, 'DISCORD_WEBHOOK_BARSPORT_URL');
}

/**
 * Controlla chi compie gli anni oggi (Europe/Rome, vedi appsscript.json)
 * tra i piloti attivi con consenso, e posta gli auguri in #bar-sport.
 * Tagga con <@discord_id> quando disponibile (ping reale, non solo
 * nome) — fallback al nome in grassetto se manca il discord_id.
 * Dedup per driver_id: un pilota con più righe di consenso (rinnovi)
 * non genera messaggi doppi.
 */
function checkBirthdaysToday_() {
  try {
    const now = new Date();
    const todayMonth = now.getMonth();
    const todayDay = now.getDate();

    const consents = sheetToObjects(SHEETS.CONSENTS);
    const drivers = getCachedSheetData_(SHEETS.DRIVERS, 600);
    const driverMap = {};
    drivers.forEach(d => { driverMap[d.driver_id] = d; });

    const seen = {};
    const birthdayDrivers = [];
    consents.forEach(c => {
      if (!c.birth_date || !c.driver_id || seen[c.driver_id]) return;
      const bd = new Date(String(c.birth_date));
      if (isNaN(bd.getTime())) return;
      if (bd.getMonth() !== todayMonth || bd.getDate() !== todayDay) return;

      const driver = driverMap[c.driver_id];
      if (!driver || driver.status !== 'active' || driver.removed_at) return;

      seen[c.driver_id] = true;
      birthdayDrivers.push(driver);
    });

    if (birthdayDrivers.length === 0) {
      Logger.log('🎂 Nessun compleanno oggi.');
      return;
    }

    const mentions = birthdayDrivers.map(d =>
      d.discord_id ? '<@' + d.discord_id + '>' : ('**' + d.display_name + '**')
    ).join(' ');
    const isPlural = birthdayDrivers.length > 1;

    postToDiscordBarSport_({
      content: mentions,
      embeds: [{
        author: { name: 'VSD Paddock' },
        title: '🎂 Buon compleanno!',
        description: isPlural
          ? 'Oggi festeggiamo ' + birthdayDrivers.length + ' piloti del team! Tanti auguri da tutta VSD 🥳🏁'
          : 'Oggi festeggia ' + birthdayDrivers[0].display_name + '! Tanti auguri da tutta VSD 🥳🏁',
        color: VSD_COLORS.orange,
        timestamp: new Date().toISOString(),
      }],
    });

    Logger.log('✅ Auguri compleanno inviati per: ' + birthdayDrivers.map(d => d.display_name).join(', '));
  } catch (e) {
    Logger.log('⚠️  checkBirthdaysToday_ error: ' + e.message);
  }
}

/**
 * Entry point per il trigger giornaliero — vedi Triggers.js.
 */
function runBirthdayCheck() {
  checkBirthdaysToday_();
}

/**
 * Helper test — esegue il controllo sui dati REALI (stesso approccio di
 * test_weekly_digest). Se nessuno compie gli anni oggi non invia nulla —
 * controlla il log di esecuzione.
 * Dropdown function → test_birthday_check → ▶ Esegui
 */
function test_birthday_check() {
  checkBirthdaysToday_();
}