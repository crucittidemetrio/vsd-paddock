// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — devices.createToken (porting fedele di
// apps-script/Devices.js, handleDevicesCreateToken)
// ═══════════════════════════════════════════════════════════
// Auth: richiesta (qualsiasi pilota loggato, genera solo il PROPRIO
// token). Token stateless HMAC-SHA256, TTL 180 giorni, stesso
// principio del sorgente (generateTokenWithTtl_/verifyToken) — nessuna
// tabella, nessuna revoca individuale possibile (limite accettato nel
// sorgente). Richiede il secret DEVICE_TOKEN_SECRET configurato come
// Edge Function secret.
// Payload: "driver_id|team_id|expiresAtMs" — team_id in più rispetto
// al sorgente (multi-tenant qui, single-tenant là); tier/sims del
// sorgente omessi perché nessun handler fuel.* portato li legge.
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';


const LEGACY_API_URL = 'https://script.google.com/macros/s/AKfycbyMXxEjZfm5EIsGUnKxpwtBtoeR4hwMG7Pl8ZESF8yG569SS0aIdsWqyu9PdBgR14vLiA/exec';

async function resolveLegacyDriver(svc: any, legacyToken: string): Promise<{ id: string; team_id: string } | null> {
  try {
    const r = await fetch(LEGACY_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'auth.verify', token: legacyToken, payload: {} }),
      signal: AbortSignal.timeout(15000), // Apps Script a volte non risponde: mai bloccare 150 s
    });
    const j = await r.json();
    const code = j?.ok && j.data?.valid ? j.data?.driver?.driver_id : null;
    if (!code) return null;
    const { data } = await svc.from('drivers').select('id, team_id').eq('driver_code', code).maybeSingle();
    return data || null;
  } catch {
    return null;
  }
}


// ═══════════════════════════════════════════════════════════
// 22/10/2026 — session.exchange: token legacy → sessione Supabase vera
// ═══════════════════════════════════════════════════════════
// Perché: ogni Edge Function verificava il token legacy chiamando Apps
// Script (1-3 s, a volte 150 s di blocco). Con una sessione Supabase le
// funzioni usano auth.getUser (decine di ms) e Apps Script viene
// chiamato UNA volta per login invece che a ogni richiesta.
// Account Supabase creato al primo scambio (email tecnica, mai usata
// per inviare posta) e collegato a drivers.auth_user_id. Se il pilota
// ha già un account (es. Discord OAuth Supabase) si riusa quello.
const PILOT_EMAIL_DOMAIN = 'pilots.vsd-paddock.app';

async function handleSessionExchange(legacyToken: string): Promise<Response> {
  const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const me = await resolveLegacyDriver(svc, legacyToken);
  if (!me) return json({ ok: false, error: 'Token non valido' }, 401);

  const { data: drv, error: drvErr } = await svc.from('drivers')
    .select('id, driver_code, auth_user_id, removed_at').eq('id', me.id).maybeSingle();
  if (drvErr || !drv) return json({ ok: false, error: 'Pilota non trovato' }, 404);
  if (drv.removed_at) return json({ ok: false, error: 'Pilota non attivo' }, 403);

  let email: string | null = null;
  if (drv.auth_user_id) {
    const { data: u } = await svc.auth.admin.getUserById(drv.auth_user_id);
    email = u?.user?.email || null;
  }
  if (!email) {
    email = `${String(drv.driver_code || drv.id).toLowerCase()}@${PILOT_EMAIL_DOMAIN}`;
    const { data: created, error: cErr } = await svc.auth.admin.createUser({
      email, email_confirm: true, app_metadata: { vsd_driver_code: drv.driver_code, via: 'legacy_exchange' },
    });
    let userId = created?.user?.id || null;
    if (!userId) {
      // già creato in un tentativo precedente ma non collegato: lo ritrovo
      const { data: list } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
      userId = list?.users?.find((u: any) => (u.email || '').toLowerCase() === email)?.id || null;
      if (!userId) return json({ ok: false, error: 'Creazione account fallita: ' + (cErr?.message || 'sconosciuto') }, 500);
    }
    const { error: linkErr } = await svc.from('drivers').update({ auth_user_id: userId }).eq('id', drv.id).is('auth_user_id', null);
    if (linkErr) return json({ ok: false, error: linkErr.message }, 500);
  }

  const { data: link, error: lErr } = await svc.auth.admin.generateLink({ type: 'magiclink', email });
  const hashed = (link as any)?.properties?.hashed_token;
  if (lErr || !hashed) return json({ ok: false, error: 'generateLink: ' + (lErr?.message || 'nessun token') }, 500);

  const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: v, error: vErr } = await anon.auth.verifyOtp({ token_hash: hashed, type: 'magiclink' });
  if (vErr || !v?.session) return json({ ok: false, error: 'verifyOtp: ' + (vErr?.message || 'nessuna sessione') }, 500);

  return json({
    ok: true,
    data: {
      access_token: v.session.access_token,
      refresh_token: v.session.refresh_token,
      expires_at: v.session.expires_at,
      driver_code: drv.driver_code,
    },
  });
}

const DEVICE_TOKEN_TTL_MS = 180 * 24 * 60 * 60 * 1000; // 180 giorni

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlEncodeString(str: string): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(str));
}

async function hmacSignBase64Url(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return base64UrlEncodeBytes(new Uint8Array(sig));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const payloadIn = await req.json().catch(() => ({}));
    if (payloadIn?.action === 'session.exchange') {
      if (!payloadIn.legacy_token) return json({ ok: false, error: 'legacy_token mancante' }, 400);
      return await handleSessionExchange(String(payloadIn.legacy_token));
    }
    const authHeader = req.headers.get('Authorization');
    let me: { id: string; team_id: string } | null = null;

    if (authHeader) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from('drivers').select('id, team_id').eq('auth_user_id', user.id).maybeSingle();
        me = data || null;
      }
    }

    // 20/10/2026: fallback token legacy (stesso pattern di best-laps-add):
    // nessun pilota reale ha una sessione Supabase, quindi senza questo
    // il token per il plugin SimHub/companion non si poteva generare.
    if (!me && payloadIn?.legacy_token) {
      const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      me = await resolveLegacyDriver(svc, payloadIn.legacy_token);
    }
    if (!me) return json({ ok: false, error: 'Auth richiesto — solo piloti loggati possono generare un token' }, 401);

    const secret = Deno.env.get('DEVICE_TOKEN_SECRET');
    if (!secret) return json({ ok: false, error: 'DEVICE_TOKEN_SECRET non configurato' }, 500);

    const expiresAt = Date.now() + DEVICE_TOKEN_TTL_MS;
    const payload = `${me.id}|${me.team_id}|${expiresAt}`;
    const signature = await hmacSignBase64Url(payload, secret);
    const token = base64UrlEncodeString(payload + '|' + signature);

    return json({
      ok: true,
      data: {
        token,
        expires_at: new Date(expiresAt).toISOString(),
        note: 'Incolla questo token nel plugin SimHub VSD (best lap automatici) o nel companion carburante/energia. Valido 180 giorni, rigenerabile dal tuo profilo. Non condividerlo: chi lo ha può inviare giri e consumi a tuo nome.',
      },
    });
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
