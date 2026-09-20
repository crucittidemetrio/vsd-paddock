// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — fuel.mySession (porting fedele di
// apps-script/FuelLog.js, handleFuelMySession)
// ═══════════════════════════════════════════════════════════
// Risolve la sessione carburante più recente del pilota loggato senza
// ID manuale. Considerata attiva solo se l'ultimo campione risale a
// meno di 30 minuti fa (FUEL_MY_SESSION_MAX_AGE_MS), fedele al
// sorgente. Guarda solo fuel_log (giri completati), non i ping live.
//
// Nota (#336): "mySession" per definizione — nessun campo driver_id
// nella risposta, nessun fix driver_id→driver_code necessario qui.
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FUEL_MY_SESSION_MAX_AGE_MS = 30 * 60 * 1000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function base64UrlDecodeToString(b64url: string): string {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmacSignBase64Url(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return base64UrlEncodeBytes(new Uint8Array(sig));
}

async function verifyDeviceToken(token: string): Promise<{ driver_id: string; team_id: string } | null> {
  try {
    const secret = Deno.env.get('DEVICE_TOKEN_SECRET');
    if (!secret) return null;
    const decoded = base64UrlDecodeToString(token);
    const lastPipe = decoded.lastIndexOf('|');
    if (lastPipe === -1) return null;
    const payload = decoded.slice(0, lastPipe);
    const signature = decoded.slice(lastPipe + 1);
    const expected = await hmacSignBase64Url(payload, secret);
    if (signature !== expected) return null;
    const parts = payload.split('|');
    if (parts.length !== 3) return null;
    const [driverId, teamId, expiresAtStr] = parts;
    const expiresAt = Number(expiresAtStr);
    if (!driverId || !teamId || !expiresAt || Date.now() > expiresAt) return null;
    return { driver_id: driverId, team_id: teamId };
  } catch (_e) {
    return null;
  }
}

async function resolveDriver(req: Request, serviceClient: any): Promise<{ driver_id: string; team_id: string } | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, '');

  const deviceCtx = await verifyDeviceToken(token);
  if (deviceCtx) return deviceCtx;

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return null;
  const { data: me } = await serviceClient.from('drivers').select('id, team_id').eq('auth_user_id', user.id).maybeSingle();
  if (!me) return null;
  return { driver_id: me.id, team_id: me.team_id };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const driverCtx = await resolveDriver(req, serviceClient);
    if (!driverCtx) return json({ ok: false, error: 'Auth richiesto' }, 401);

    const { data: rows, error } = await serviceClient
      .from('fuel_log')
      .select('*')
      .eq('team_id', driverCtx.team_id)
      .eq('driver_id', driverCtx.driver_id)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) return json({ ok: false, error: error.message }, 400);

    if (!rows || rows.length === 0) return json({ ok: true, data: { active: false } });

    const latest = rows[0];
    const ageMs = Date.now() - new Date(latest.created_at).getTime();
    if (isNaN(ageMs) || ageMs > FUEL_MY_SESSION_MAX_AGE_MS) return json({ ok: true, data: { active: false } });

    return json({
      ok: true,
      data: {
        active: true,
        race_id: latest.race_id,
        car_number: latest.car_number,
        track_name: latest.track_name || '',
        vehicle_name: latest.vehicle_name || '',
        lap_number: latest.lap_number != null ? Number(latest.lap_number) : null,
        created_at: latest.created_at,
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
