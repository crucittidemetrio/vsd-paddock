// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Relay: chi ha un ruolo Discord (#467, 10/10/2026)
// ═══════════════════════════════════════════════════════════
//
// Usato da notifications-cron (check=rosterActivity, ogni lunedì) per
// sapere quali piloti hanno il ruolo Statbot "Attivo del Mese" → segnale
// di attività Discord per lo stato attivo/inattivo automatico.
//
// Perché qui e non nella Edge Function: il bot token vive solo su Vercel
// (stesso schema di discord-dm-relay / discord-invite-stats).
//
// Nessun ID da configurare: il bot elenca i server in cui si trova,
// cerca il ruolo per NOME e poi controlla i singoli membri con
// GET /guilds/{id}/members/{user} — endpoint che NON richiede il
// privileged intent "Server Members" (a differenza del list members).
//
// Auth: header x-discord-relay-secret = DISCORD_RELAY_SECRET.
// Body: { discordIds: string[], roleName?: string }  (default "Attivo del Mese")
// Risposta: { ok, guild_id, role_id, role_name, with_role: string[], checked, errors }

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const MAX_IDS = 200;

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const secret = process.env.DISCORD_RELAY_SECRET;
  if (!secret || request.headers['x-discord-relay-secret'] !== secret) {
    return response.status(401).json({ ok: false, error: 'Non autorizzato' });
  }

  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    return response.status(500).json({ ok: false, error: 'DISCORD_BOT_TOKEN non configurato su Vercel' });
  }

  const body = request.body || {};
  const roleName = String(body.roleName || 'Attivo del Mese').trim().toLowerCase();
  const discordIds = Array.isArray(body.discordIds)
    ? body.discordIds.map((x) => String(x).trim()).filter((x) => /^\d{15,22}$/.test(x)).slice(0, MAX_IDS)
    : [];
  if (discordIds.length === 0) {
    return response.status(400).json({ ok: false, error: 'discordIds mancante o vuoto' });
  }

  const headers = { Authorization: 'Bot ' + botToken, 'User-Agent': 'VSDPaddockBot (https://vsd-paddock.vercel.app, 1.0)' };

  try {
    const guildsRes = await fetch(DISCORD_API_BASE + '/users/@me/guilds', { headers });
    if (!guildsRes.ok) {
      return response.status(200).json({ ok: false, error: 'http_' + guildsRes.status + '_guilds' });
    }
    const guilds = await guildsRes.json();

    // Trova il primo server del bot che ha un ruolo con quel nome.
    let guildId = null;
    let role = null;
    for (const g of guilds) {
      const rolesRes = await fetch(DISCORD_API_BASE + '/guilds/' + g.id + '/roles', { headers });
      if (!rolesRes.ok) continue;
      const roles = await rolesRes.json();
      const match = roles.find((r) => String(r.name || '').trim().toLowerCase() === roleName);
      if (match) { guildId = g.id; role = match; break; }
    }
    if (!role) {
      return response.status(200).json({ ok: false, error: 'Ruolo "' + roleName + '" non trovato nei server del bot' });
    }

    const withRole = [];
    const errors = [];
    for (const id of discordIds) {
      const res = await getMemberWithRetry(guildId, id, headers);
      if (res.status === 404) continue; // non è (più) nel server
      if (!res.ok) { errors.push(id + ':http_' + res.status); continue; }
      const member = await res.json();
      if (Array.isArray(member.roles) && member.roles.includes(role.id)) withRole.push(id);
    }

    return response.status(200).json({
      ok: true,
      guild_id: guildId,
      role_id: role.id,
      role_name: role.name,
      with_role: withRole,
      checked: discordIds.length,
      errors,
    });
  } catch (e) {
    return response.status(200).json({ ok: false, error: String(e) });
  }
}

// Rispetta il rate limit Discord (429 + retry_after) con un solo retry.
async function getMemberWithRetry(guildId, userId, headers) {
  const url = DISCORD_API_BASE + '/guilds/' + guildId + '/members/' + userId;
  let res = await fetch(url, { headers });
  if (res.status === 429) {
    const j = await res.json().catch(() => ({}));
    const waitMs = Math.min(5000, Math.ceil((Number(j.retry_after) || 1) * 1000));
    await new Promise((r) => setTimeout(r, waitMs));
    res = await fetch(url, { headers });
  }
  return res;
}
