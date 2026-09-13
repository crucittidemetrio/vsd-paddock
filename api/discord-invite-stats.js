// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Relay per le statistiche membri Discord (invito pubblico)
// ═══════════════════════════════════════════════════════════
//
// Perché esiste: la chiamata GET a discord.com/api/v10/invites/{code}
// da Apps Script (UrlFetchApp) viene bloccata dal WAF Cloudflare di
// Discord con "error code: 1015" (You are being rate limited — risposta
// testo semplice, non JSON, che mandava in errore il JSON.parse lato
// Apps Script con "Unexpected token"). Le IP condivise di Google Apps
// Script vengono penalizzate in blocco, indipendentemente dalla
// frequenza reale delle nostre chiamate — stesso identico problema già
// visto e risolto per l'invio DM (vedi discord-dm-relay.js). Soluzione
// identica: spostare SOLO la chiamata Discord su un ambiente con IP
// diverse — questa function Vercel.
//
// Questo endpoint NON richiede il Bot Token: /invites/{code} è un
// endpoint pubblico di Discord, basta il codice invito. Il secret
// condiviso qui sotto serve solo a evitare che chiunque conosca l'URL
// possa usare la nostra function Vercel come proxy anonimo verso
// Discord, non per autenticarsi a Discord stesso.
//
// Auth: NON è una route pubblica per il browser — solo Apps Script la
// chiama, autenticata con lo stesso secret condiviso del relay DM
// (env DISCORD_RELAY_SECRET) passato nell'header
// x-discord-relay-secret.
//
// Env richieste (Vercel → Settings → Environment Variables):
//   DISCORD_RELAY_SECRET — stessa già usata da discord-dm-relay.js

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

  const { inviteCode } = request.body || {};
  if (!inviteCode) {
    return response.status(400).json({ ok: false, error: 'inviteCode mancante' });
  }

  try {
    const discordRes = await fetch(
      DISCORD_API_BASE + '/invites/' + encodeURIComponent(inviteCode) + '?with_counts=true',
      { method: 'GET' }
    );

    // Legge il body come testo grezzo UNA volta sola e prova a
    // interpretarlo come JSON — un blocco Cloudflare (error code 1015)
    // risponde con testo semplice, non JSON, quindi il parse va protetto
    // (stessa diagnostica già usata in discord-dm-relay.js/safeErrorDetail_).
    const raw = await discordRes.text();
    let body = null;
    try {
      body = JSON.parse(raw);
    } catch (e) {
      // risposta non-JSON — tipicamente un blocco/rate-limit Cloudflare
    }

    if (!discordRes.ok || !body) {
      const detail = (body && body.message) || (raw ? raw.slice(0, 200) : ('HTTP ' + discordRes.status));
      return response.status(200).json({ ok: false, error: 'discord_' + discordRes.status + ': ' + detail });
    }

    return response.status(200).json({
      ok: true,
      guild_name: (body.guild && body.guild.name) || null,
      member_count: body.approximate_member_count != null ? body.approximate_member_count : null,
      online_count: body.approximate_presence_count != null ? body.approximate_presence_count : null,
    });
  } catch (err) {
    return response.status(200).json({ ok: false, error: 'relay_exception: ' + err.message });
  }
}
