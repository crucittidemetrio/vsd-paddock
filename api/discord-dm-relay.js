// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Relay per l'invio di DM Discord (Task #109)
// ═══════════════════════════════════════════════════════════
//
// Perché esiste: le chiamate dirette Discord Bot API da Apps Script
// (UrlFetchApp) funzionano per aprire il canale DM (POST
// /users/@me/channels) ma vengono bloccate con 403 dal WAF Cloudflare
// di Discord sull'endpoint di invio messaggio (POST
// /channels/{id}/messages) — risposta {"code":40333,"message":"internal
// network error"}. Non è un problema di permessi/privacy: Cloudflare
// filtra più aggressivamente l'endpoint di invio messaggi (più esposto
// ad abuso) e le IP condivise di Google Cloud/Apps Script ci finiscono
// dentro. Apps Script non permette di impostare uno User-Agent custom
// per aggirarlo (UrlFetchApp lo ignora sempre, limitazione nota di
// Google mai risolta). Soluzione: spostare SOLO la chiamata Discord su
// un ambiente con IP/User-Agent diversi — questa function Vercel.
//
// Auth: NON è una route pubblica per il browser — solo Apps Script la
// chiama, autenticata con un secret condiviso (env DISCORD_RELAY_SECRET,
// stesso valore nello Script Property Apps Script) passato nell'header
// x-discord-relay-secret. Senza controlli chiunque conoscesse l'URL
// potrebbe mandare DM a nome del bot a qualunque utente.
//
// Env richieste (Vercel → Settings → Environment Variables):
//   DISCORD_BOT_TOKEN       — stesso token del Developer Portal già
//                             usato nello Script Property Apps Script
//   DISCORD_RELAY_SECRET    — stringa casuale, stessa nello Script
//                             Property Apps Script (DISCORD_RELAY_SECRET)

const DISCORD_API_BASE = 'https://discord.com/api/v10';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const secret = process.env.DISCORD_RELAY_SECRET;
  const receivedSecret = request.headers['x-discord-relay-secret'];
  if (!secret || receivedSecret !== secret) {
    return response.status(401).json({ ok: false, error: 'Non autorizzato' });
  }

  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    return response.status(500).json({ ok: false, error: 'DISCORD_BOT_TOKEN non configurato su Vercel' });
  }

  const { discordId, messagePayload } = request.body || {};
  if (!discordId) {
    return response.status(400).json({ ok: false, error: 'discordId mancante' });
  }
  if (!messagePayload || (!messagePayload.embeds && !messagePayload.content)) {
    return response.status(400).json({ ok: false, error: 'messagePayload mancante (serve embeds o content)' });
  }

  try {
    const channelRes = await fetch(DISCORD_API_BASE + '/users/@me/channels', {
      method: 'POST',
      headers: {
        'Authorization': 'Bot ' + botToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ recipient_id: discordId }),
    });
    if (!channelRes.ok) {
      const detail = await safeErrorDetail_(channelRes);
      return response.status(200).json({ ok: false, error: 'http_' + channelRes.status + '_open_channel' + detail });
    }
    const channel = await channelRes.json();
    if (!channel.id) {
      return response.status(200).json({ ok: false, error: 'channel_id_mancante' });
    }

    const msgRes = await fetch(DISCORD_API_BASE + '/channels/' + channel.id + '/messages', {
      method: 'POST',
      headers: {
        'Authorization': 'Bot ' + botToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messagePayload),
    });
    if (!msgRes.ok) {
      const detail = await safeErrorDetail_(msgRes);
      return response.status(200).json({ ok: false, error: 'http_' + msgRes.status + '_send_message' + detail });
    }

    return response.status(200).json({ ok: true });
  } catch (err) {
    return response.status(200).json({ ok: false, error: 'relay_exception: ' + err.message });
  }
}

// Estrae code+message dal body errore Discord, senza mai lanciare se il
// body non è JSON valido — stessa diagnostica già usata in
// DiscordMessenger.js lato Apps Script.
// Legge il body come testo grezzo UNA volta sola (un Response si può
// consumare una volta sola: chiamare .json() e poi .text() sullo stesso
// oggetto fallisce silenziosamente) e prova a interpretarlo come JSON
// Discord ({code, message}). Se non è JSON, o non ha quei campi,
// ritorna comunque il testo grezzo — meglio un dettaglio scomodo da
// leggere che un errore "http_403_send_message" senza alcun contesto,
// che in passato ci ha fatto perdere tempo a inseguire la pista
// sbagliata (permessi/privacy del pilota) quando la causa reale era
// un'altra.
async function safeErrorDetail_(res) {
  let raw = '';
  try {
    raw = await res.text();
  } catch (e) {
    return ' [impossibile leggere il body della risposta]';
  }
  try {
    const body = JSON.parse(raw);
    if (body && (body.code !== undefined || body.message)) {
      return ' [discord ' + body.code + ': ' + body.message + ']';
    }
  } catch (e) {
    // non JSON — usiamo il testo grezzo qui sotto
  }
  return raw ? ' [raw: ' + raw.slice(0, 200) + ']' : ' [risposta vuota]';
}
