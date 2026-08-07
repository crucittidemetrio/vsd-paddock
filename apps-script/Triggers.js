// ═══════════════════════════════════════════════════════════
// SETUP TRIGGER — installazione idempotente dei trigger a tempo
// ═══════════════════════════════════════════════════════════
//
// Perché questo file: sia gli stint alert (Notifications.js,
// runStintNotificationsCheck) sia il sync Garage61 (garage61.js,
// garage61RunSync) sono progettati per girare su un trigger a tempo,
// ma finora l'unica "documentazione" era un commento con le istruzioni
// per installarlo A MANO dall'editor Apps Script (menu Trigger).
// Questo significa che lo stato dei trigger installati non è visibile
// da nessuna parte nel codice sorgente — se il progetto viene
// riclonato, o l'account cambia, i trigger si perdono in silenzio e le
// funzioni (corrette) semplicemente non vengono mai chiamate, senza
// nessun errore visibile.
//
// setupTriggers() qui sotto fa la stessa cosa ma da codice, idempotente
// (controlla ScriptApp.getProjectTriggers() prima di creare — eseguirla
// più volte non crea duplicati, quindi non rischia di far scattare
// notifiche doppie).
//
// NB IMPORTANTE: installare il trigger di runStintNotificationsCheck
// NON attiva da solo le notifiche stint — quella funzione controlla
// anche la Script Property STINT_NOTIFY_ENABLED, che va impostata a
// 'true' separatamente (Project Settings → Script Properties). Questo
// setup si limita a garantire che il meccanismo POSSA funzionare
// quando/se lo si accende, senza cambiare comportamento da solo.
//
// Esecuzione: editor Apps Script → dropdown funzioni →
//             setupTriggers → ▶ Esegui (una volta, o ogni volta che si
//             vuole verificare che i trigger siano a posto).

function setupTriggers() {
  const existingHandlers = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction());
  const results = [];

  function ensureTimeTrigger(handlerName, label, build) {
    if (existingHandlers.indexOf(handlerName) !== -1) {
      results.push(`⏭  ${handlerName} (${label}) — trigger già presente, skip`);
      return;
    }
    build();
    results.push(`✅ ${handlerName} (${label}) — trigger installato`);
  }

  // Stint alert pre-cambio pilota (endurance). Soglia di preavviso
  // STINT_NOTIFY_THRESHOLD_MIN=30 (vedi Notifications.js) — 5 minuti
  // di granularità sono ampiamente sufficienti e restano ben dentro le
  // quote gratuite di Apps Script (max 20 trigger/utente, esecuzioni
  // ~90min/giorno su account consumer).
  ensureTimeTrigger('runStintNotificationsCheck', 'stint alert ogni 5 min', () => {
    ScriptApp.newTrigger('runStintNotificationsCheck')
      .timeBased()
      .everyMinutes(5)
      .create();
  });

  // Sync Garage61 automatico — stessa cadenza già documentata a mano
  // in garage61.js (lag upstream ~1-3h → ogni 4h è il compromesso già
  // scelto in precedenza, qui solo reso installabile da codice).
  ensureTimeTrigger('garage61RunSync', 'sync Garage61 ogni 4h', () => {
    ScriptApp.newTrigger('garage61RunSync')
      .timeBased()
      .everyHours(4)
      .create();
  });

  // Archiviazione sessioni FuelLog concluse (FuelLogArchive.js) — tiene
  // il tab live piccolo per fuel.summary durante le gare. Non è
  // time-critical, una volta al giorno basta ampiamente (le sessioni
  // diventano "stale" solo dopo FUEL_LOG_STALE_DAYS giorni di
  // inattività). Consigliato lanciare previewFuelLogArchive() a mano
  // prima di attivare questo trigger la prima volta.
  ensureTimeTrigger('fuelLogArchiveDailyRun', 'archiviazione FuelLog una volta al giorno', () => {
    ScriptApp.newTrigger('fuelLogArchiveDailyRun')
      .timeBased()
      .everyDays(1)
      .create();
  });

  Logger.log(results.join('\n'));
  return results;
}

/**
 * Helper diagnostico — elenca tutti i trigger installati sul progetto,
 * con funzione chiamata e tipo. Utile per verificare lo stato attuale
 * prima/dopo aver eseguito setupTriggers(), o per capire se un trigger
 * "misterioso" installato a mano tempo fa esiste ancora.
 * Dropdown function → listTriggers → ▶ Esegui.
 */
function listTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  if (triggers.length === 0) {
    Logger.log('Nessun trigger installato sul progetto.');
    return [];
  }
  const rows = triggers.map(t => {
    const handler = t.getHandlerFunction();
    const type = t.getEventType();
    return `${handler} — ${type}`;
  });
  Logger.log(rows.join('\n'));
  return rows;
}
