// ═══════════════════════════════════════════════════════════
// Annuncio one-off: nuovo modulo di consenso privacy per i piloti.
// Usa lo stesso webhook pubblico degli altri annunci team
// (postToDiscord_ / Script Property DISCORD_WEBHOOK_URL — Notifications.js).
//
// IMPORTANTE: verifica che DISCORD_WEBHOOK_URL in Script Properties
// punti davvero al canale voluto prima di eseguire questa funzione —
// da codice non è possibile controllarlo.
//
// Esecuzione one-time: editor Apps Script → dropdown funzioni →
//             announceConsentRequest → ▶ Esegui.
// ═══════════════════════════════════════════════════════════

function announceConsentRequest() {
  const payload = {
    embeds: [{
      author: { name: 'VSD Paddock' },
      title: '🔒 Nuovo: Consenso pubblicazione dati',
      description:
        'Abbiamo attivato un modulo per autorizzare (o no) la pubblicazione dei tuoi dati ' +
        'su sito e social del team — è il documento GDPR che regola cosa mostriamo di te su ' +
        'Paddock e sui canali social.\n\n' +
        'Ci mette 1 minuto: vai su **Consenso dati** nel menu laterale e salva le tue scelte. ' +
        'Puoi modificarle quando vuoi tornando sulla stessa pagina.',
      color: VSD_COLORS.cyan,
      timestamp: new Date().toISOString(),
      footer: { text: 'Apri il Paddock per compilarlo' },
      url: PADDOCK_URL + '/consenso',
    }],
  };

  const result = postToDiscord_(payload);
  Logger.log(result.ok ? '✅ Annuncio consenso postato' : '⚠️  Annuncio non postato: ' + result.error);
}

/**
 * announceMissingConsents — promemoria pubblico che menziona (@mention
 * reale, non solo nome) i piloti attivi/trial che non hanno ancora
 * risposto al consenso per la versione corrente del documento.
 *
 * IMPORTANTE sulla differenza tra "content" ed "embeds": Discord invia
 * davvero una notifica di menzione solo per gli @mention dentro il
 * campo "content" del messaggio — un mention scritto dentro la
 * description di un embed è solo testo cliccabile, NON notifica
 * nessuno. Per questo qui i mention stanno nel content, il resto
 * (spiegazione, link) nell'embed.
 *
 * Nessuna scrittura sui dati dei piloti: sola lettura di Drivers +
 * Consents, poi un post al webhook pubblico. Va eseguita a mano
 * (nessun trigger automatico) — è un messaggio pubblico che riguarda
 * la privacy di persone specifiche, meglio un controllo umano prima
 * di ogni invio piuttosto che farlo partire da solo su schedule.
 *
 * Esecuzione: editor Apps Script → dropdown funzioni →
 *             announceMissingConsents → ▶ Esegui.
 */
function announceMissingConsents() {
  const drivers = sheetToObjects(SHEETS.DRIVERS)
    .filter(d => d.status === 'active' || d.status === 'trial');
  const responded = new Set(
    sheetToObjects(SHEETS.CONSENTS)
      .filter(c => c.consent_version === CONSENT_VERSION)
      .map(c => c.driver_id)
  );

  const missing = drivers.filter(d => !responded.has(d.driver_id));
  const missingWithDiscord = missing.filter(d => d.discord_id);
  const missingNoDiscord = missing.filter(d => !d.discord_id);

  if (missing.length === 0) {
    Logger.log('✅ Tutti i piloti attivi/trial hanno già risposto — nessun promemoria da mandare.');
    return;
  }

  if (missingWithDiscord.length > 0) {
    const mentions = missingWithDiscord.map(d => '<@' + d.discord_id + '>').join(' ');
    const payload = {
      content: mentions,
      embeds: [{
        author: { name: 'VSD Paddock' },
        title: '🔒 Promemoria: consenso dati ancora mancante',
        description:
          'Manca ancora la vostra risposta al modulo di consenso per la pubblicazione dei ' +
          'dati (sito/social) — **Consenso dati** nel menu laterale, bastano 30 secondi 🙏',
        color: VSD_COLORS.orange,
        timestamp: new Date().toISOString(),
        url: PADDOCK_URL + '/consenso',
      }],
    };
    const result = postToDiscord_(payload);
    Logger.log(result.ok
      ? `✅ Promemoria postato — menzionati ${missingWithDiscord.length} piloti`
      : '⚠️  Non postato: ' + result.error);
  }

  if (missingNoDiscord.length > 0) {
    Logger.log('⚠️  Mancano ma senza discord_id salvato, NON menzionati: ' +
      missingNoDiscord.map(d => d.display_name || d.driver_id).join(', '));
  }
}
