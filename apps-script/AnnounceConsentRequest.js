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
