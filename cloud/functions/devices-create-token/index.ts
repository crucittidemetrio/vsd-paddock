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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ ok: false, error: 'Auth richiesto — solo piloti loggati possono generare un token companion' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return json({ ok: false, error: 'Auth richiesto — solo piloti loggati possono generare un token companion' }, 401);

    const { data: me, error: meErr } = await supabase
      .from('drivers')
      .select('id, team_id')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (meErr) return json({ ok: false, error: meErr.message }, 400);
    if (!me) return json({ ok: false, error: 'Driver non collegato a questo account' }, 404);

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
        note: 'Incolla questo token nel file di config del companion app fuel/energy. Valido 180 giorni — rigenerabile in qualsiasi momento dal tuo profilo. Non condividerlo: chi lo ha può scrivere campioni consumo a tuo nome.',
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
