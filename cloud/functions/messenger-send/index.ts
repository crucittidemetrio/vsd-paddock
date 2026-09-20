// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — messenger.send (porting fedele di
// apps-script/DiscordMessenger.js, handleMessengerSend)
// ═══════════════════════════════════════════════════════════
// Auth: staff/admin OPPURE can_message=true. mode='channel' posta su
// un webhook fisso (env var, mai un nome passato dal client).
// mode='dm' passa dal relay Vercel discord-dm-relay (stesso motivo
// del sorgente: un webhook non può apire DM, serve un vero Bot).
// Secrets richiesti (da configurare separatamente):
// DISCORD_WEBHOOK_ADMIN_URL, DISCORD_WEBHOOK_BARSPORT_URL,
// DISCORD_WEBHOOK_GESTIONE_GARE_URL, DISCORD_RELAY_URL, DISCORD_RELAY_SECRET
//
// FIX #335 (20/09/2026, trovato PRIMA del cutover frontend, mai
// esposto a utenti reali): il ramo mode='dm' con target='few'/'single'
// risolveva i destinatari con `.in('id', payload.driver_ids)` — ma
// AdminMessenger.jsx costruisce selectedIds da roster.list().driver_id,
// che nel contratto pubblico è SEMPRE driver_code ("VSD005", vedi FIX
// #330 in supabaseApi.js), mai l'uuid interno `drivers.id`. Query su
// una colonna uuid con valori tipo "VSD005" avrebbe fallito (errore
// Postgres invalid input syntax) o comunque trovato zero destinatari
// — stesso identico bug-pattern già corretto altrove (#331/#333/#334)
// prima ancora del cutover. Risolto: risoluzione driver_code→uuid
// scoped al team prima della query; alias uuid→driver_code anche in
// uscita (sent[]/failed[].driver_id) per coerenza col contratto.
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MESSENGER_TEXT_MAX_LEN = 1900;

const VSD_COLORS: Record<string, number> = {
  cyan: 0x00d9ff,
  green: 0x4ade80,
  orange: 0xfbbf24,
  red: 0xf87171,
  blue: 0x3b82f6,
  purple: 0xa855f7,
};

const CHANNEL_WEBHOOK_PROPS: Record<string, string> = {
  staff: 'DISCORD_WEBHOOK_ADMIN_URL',
  barsport: 'DISCORD_WEBHOOK_BARSPORT_URL',
  gestione_gare: 'DISCORD_WEBHOOK_GESTIONE_GARE_URL',
};

const CHANNEL_LABELS: Record<string, string> = {
  staff: '⛔ Staff-only',
  barsport: '🍻 Bar-sport',
  gestione_gare: '🏁 Gestione gare',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function postToDiscordWebhook(payload: unknown, envName: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const url = Deno.env.get(envName);
    if (!url) return { ok: false, error: 'webhook_not_configured' };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) return { ok: true };
    return { ok: false, error: 'http_' + res.status };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function discordSendDm(discordId: string, messagePayload: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const relayUrl = Deno.env.get('DISCORD_RELAY_URL');
    const relaySecret = Deno.env.get('DISCORD_RELAY_SECRET');
    if (!relayUrl || !relaySecret) return { ok: false, error: 'relay_non_configurato' };
    const res = await fetch(relayUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-discord-relay-secret': relaySecret },
      body: JSON.stringify({ discordId, messagePayload }),
    });
    if (res.status < 200 || res.status >= 300) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: 'http_' + res.status + '_relay: ' + text.slice(0, 200) };
    }
    const body = await res.json().catch(() => ({ ok: false }));
    if (!body.ok) return { ok: false, error: body.error || 'relay_error_sconosciuto' };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function logAudit(supabase: any, teamId: string, driverId: string | null, action: string, target: string, summary: string, details?: unknown) {
  try {
    let detailsText = summary;
    if (details) detailsText += ' | ' + JSON.stringify(details);
    await supabase.from('audit_log').insert({
      team_id: teamId,
      driver_id: driverId,
      action,
      target_id: target,
      details: detailsText,
    });
  } catch (_e) {
    // fault-tolerant: un errore di logging non deve mai bloccare l'azione reale
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ ok: false, error: 'Auth richiesto' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return json({ ok: false, error: 'Auth richiesto' }, 401);

    const { data: me, error: meErr } = await supabase
      .from('drivers')
      .select('id, team_id, role, display_name, can_message')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (meErr) return json({ ok: false, error: meErr.message }, 400);
    if (!me) return json({ ok: false, error: 'Driver non collegato a questo account' }, 404);

    const isStaff = me.role === 'staff' || me.role === 'admin';
    if (!isStaff && !me.can_message) {
      return json({ ok: false, error: 'Operazione riservata a staff, admin o piloti abilitati al Messenger' }, 403);
    }

    const payload = await req.json().catch(() => ({}));
    const mode = String(payload?.mode || '').trim();
    const text = String(payload?.text || '').trim().slice(0, MESSENGER_TEXT_MAX_LEN);
    if (!text) return json({ ok: false, error: 'Testo del messaggio obbligatorio' }, 400);

    const senderName = me.display_name || me.id || 'Staff';
    const color = VSD_COLORS[String(payload?.color)] || VSD_COLORS.cyan;

    if (mode === 'channel') {
      const channelKey = String(payload?.channel_key || '').trim();
      const envName = CHANNEL_WEBHOOK_PROPS[channelKey];
      if (!envName) return json({ ok: false, error: 'channel_key non valido: ' + channelKey }, 400);

      const embed = {
        author: { name: 'VSD Paddock' },
        description: text,
        color,
        timestamp: new Date().toISOString(),
        footer: { text: 'Inviato da ' + senderName },
      };
      const result = await postToDiscordWebhook({ embeds: [embed] }, envName);
      if (!result.ok) return json({ ok: false, error: 'Invio fallito: ' + result.error }, 400);

      await logAudit(supabase, me.team_id, me.id, 'messenger.send', channelKey,
        senderName + ': Messaggio postato su ' + (CHANNEL_LABELS[channelKey] || channelKey) + ': "' + text.slice(0, 80) + (text.length > 80 ? '…' : '') + '"');

      return json({ ok: true, data: { mode: 'channel', channel_key: channelKey } });
    }

    if (mode === 'dm') {
      if (!Deno.env.get('DISCORD_RELAY_URL') || !Deno.env.get('DISCORD_RELAY_SECRET')) {
        return json({ ok: false, error: 'Relay DM non configurato (DISCORD_RELAY_URL/DISCORD_RELAY_SECRET mancanti)' }, 400);
      }

      const target = String(payload?.target || 'few').trim();
      let recipients: any[] = [];

      if (target === 'all') {
        if (payload?.confirm !== true) return json({ ok: false, error: 'Conferma richiesta per un invio broadcast a tutti i piloti attivi' }, 400);
        const { data: drivers } = await supabase
          .from('drivers')
          .select('id, display_name, discord_id, driver_code')
          .eq('team_id', me.team_id)
          .eq('status', 'active')
          .is('removed_at', null);
        recipients = drivers ?? [];
      } else {
        // FIX #335: payload.driver_ids sono driver_code ("VSD005"), non
        // l'uuid interno drivers.id — stesso contratto pubblico di ogni
        // altro dominio (roster.list().driver_id).
        const codes = Array.isArray(payload?.driver_ids) ? payload.driver_ids.map(String) : [];
        if (codes.length === 0) return json({ ok: false, error: 'Nessun destinatario selezionato' }, 400);
        if (target === 'single' && codes.length > 1) return json({ ok: false, error: 'target "single" ammette un solo destinatario' }, 400);
        const { data: drivers } = await supabase
          .from('drivers')
          .select('id, display_name, discord_id, driver_code')
          .eq('team_id', me.team_id)
          .in('driver_code', codes);
        recipients = drivers ?? [];
      }

      if (recipients.length === 0) return json({ ok: false, error: 'Nessun pilota trovato tra i destinatari indicati' }, 400);

      const embed = {
        author: { name: 'VSD Paddock' },
        description: text,
        color,
        timestamp: new Date().toISOString(),
        footer: { text: 'Messaggio diretto da ' + senderName + ' · VSD Paddock' },
      };

      const sent: any[] = [];
      const failed: any[] = [];

      for (let i = 0; i < recipients.length; i++) {
        const driver = recipients[i];
        const discordId = String(driver.discord_id || '').trim();
        // FIX #335: driver_id esposto al frontend è sempre driver_code.
        const driverCode = driver.driver_code || driver.id;
        if (!discordId) {
          failed.push({ driver_id: driverCode, display_name: driver.display_name, reason: 'discord_non_collegato' });
          continue;
        }
        const result = await discordSendDm(discordId, { embeds: [embed] });
        if (result.ok) {
          sent.push({ driver_id: driverCode, display_name: driver.display_name });
        } else {
          failed.push({ driver_id: driverCode, display_name: driver.display_name, reason: result.error });
        }
        if (i < recipients.length - 1) await new Promise((r) => setTimeout(r, 400));
      }

      await logAudit(supabase, me.team_id, me.id, 'messenger.send', target,
        senderName + ': DM a ' + sent.length + '/' + recipients.length + ' piloti (' + failed.length + ' falliti): "' + text.slice(0, 80) + (text.length > 80 ? '…' : '') + '"',
        { sent: sent.map((s) => s.driver_id), failed });

      return json({ ok: true, data: { mode: 'dm', sent: sent.length, total: recipients.length, failed } });
    }

    return json({ ok: false, error: 'mode non valido: usa "channel" o "dm"' }, 400);
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
