// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — fuel.logSample (porting fedele di
// apps-script/FuelLog.js, handleFuelLogSample)
// ═══════════════════════════════════════════════════════════
// Auth: richiesta (sessione Supabase normale O device token HMAC
// stateless da devices.createToken — stesso Authorization header,
// stesso principio del verifyToken() unico del sorgente). driver_id
// SEMPRE da ctx, mai dal payload, per evitare che un token compromesso
// scriva a nome di un altro pilota. verify_jwt=false a livello
// deployment perché un device token NON è un JWT Supabase valido —
// l'autenticazione reale è in resolveDriver_ qui sotto.
// Client SERVICE ROLE: un chiamante via device token non ha mai una
// sessione Supabase, quindi nessun auth.uid() disponibile per la RLS.
//
// Nota (#336): questa funzione risponde con `data.sample` = la riga
// grezza inserita (driver_id = uuid interno), MA non è consumata dal
// sito web (nessun `api.fuel.logSample(` nei componenti React — solo
// il companion app esterno la chiama) — nessun fix driver_id→driver_code
// necessario qui per il cutover frontend, a differenza di fuel-stints/
// lap-data-session che il sito legge e mostra direttamente.
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

    const payload = await req.json().catch(() => ({}));
    const raceId = String(payload?.race_id || '').trim();
    const carNumber = String(payload?.car_number || '').trim();
    const lapNumber = payload?.lap_number;
    const fuelRemaining = payload?.fuel_remaining_l;

    if (!raceId) return json({ ok: false, error: 'race_id obbligatorio' }, 400);
    if (!carNumber) return json({ ok: false, error: 'car_number obbligatorio' }, 400);
    if (lapNumber === undefined || lapNumber === null || lapNumber === '') {
      return json({ ok: false, error: 'lap_number obbligatorio' }, 400);
    }
    if (fuelRemaining === undefined || fuelRemaining === null || fuelRemaining === '') {
      return json({ ok: false, error: 'fuel_remaining_l obbligatorio' }, 400);
    }

    const num = (v: unknown) => (v !== undefined && v !== null && v !== '' ? Number(v) : null);

    const row = {
      team_id: driverCtx.team_id,
      race_id: raceId,
      car_number: carNumber,
      driver_id: driverCtx.driver_id,
      lap_number: Number(lapNumber),
      fuel_remaining_l: Number(fuelRemaining),
      fuel_capacity_l: num(payload?.fuel_capacity_l),
      virtual_energy_pct: num(payload?.virtual_energy_pct),
      track_name: payload?.track_name ? String(payload.track_name).trim() : null,
      vehicle_name: payload?.vehicle_name ? String(payload.vehicle_name).trim() : null,
      speed_min_kmh: num(payload?.speed_min_kmh),
      speed_max_kmh: num(payload?.speed_max_kmh),
      speed_avg_kmh: num(payload?.speed_avg_kmh),
      lap_time_s: num(payload?.lap_time_s),
      sector1_s: num(payload?.sector1_s),
      sector2_s: num(payload?.sector2_s),
      sector3_s: num(payload?.sector3_s),
      in_pits: payload?.in_pits === true,
      yellow_flag: payload?.yellow_flag === true,
      num_pitstops: num(payload?.num_pitstops),
      driver_name: payload?.driver_name ? String(payload.driver_name).trim() : null,
      source: 'telemetry',
    };

    const { data, error } = await serviceClient.from('fuel_log').insert(row).select().maybeSingle();
    if (error) return json({ ok: false, error: error.message }, 400);

    return json({ ok: true, data: { sample: data } });
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
