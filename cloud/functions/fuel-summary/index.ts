// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — fuel.summary (porting fedele di
// apps-script/FuelLog.js, handleFuelSummary)
// ═══════════════════════════════════════════════════════════
// Consumo medio mobile + proiezione autonomia. Auth richiesta (stesso
// livello di raceCrews.list: qualsiasi pilota loggato, non solo
// staff) — sessione Supabase o device token, stesso resolveDriver di
// fuel-log-sample. Sola lettura: fuel_log (campioni per giro) +
// fuel_live_pings (ping istantaneo, ignorato se più vecchio di
// FUEL_LIVE_MAX_AGE_MS = 2 minuti, fedele a readFuelLive_).
//
// Nota (#336): la risposta non espone mai un campo driver_id (solo
// track_name/vehicle_name/serie aggregate) — nessun fix driver_id→
// driver_code necessario qui.
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FUEL_LIVE_MAX_AGE_MS = 2 * 60 * 1000;

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

function isCleanLap(sample: any): boolean {
  return sample.in_pits !== true && sample.yellow_flag !== true;
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
    const windowSize = payload?.window ? Number(payload.window) : 5;
    const targetLaps = payload?.target_laps !== undefined && payload?.target_laps !== null ? Number(payload.target_laps) : null;

    if (!raceId) return json({ ok: false, error: 'race_id obbligatorio' }, 400);
    if (!carNumber) return json({ ok: false, error: 'car_number obbligatorio' }, 400);

    const { data: rows, error } = await serviceClient
      .from('fuel_log')
      .select('*')
      .eq('team_id', driverCtx.team_id)
      .eq('race_id', raceId)
      .eq('car_number', carNumber)
      .order('lap_number', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) return json({ ok: false, error: error.message }, 400);

    const samples = (rows || []).map((s: any) => ({ ...s, lap_number: Number(s.lap_number) }));

    const { data: liveRow } = await serviceClient
      .from('fuel_live_pings')
      .select('*')
      .eq('team_id', driverCtx.team_id)
      .eq('race_id', raceId)
      .eq('car_number', carNumber)
      .maybeSingle();

    let liveReading: any = null;
    if (liveRow) {
      const ageMs = Date.now() - new Date(liveRow.ts).getTime();
      if (!isNaN(ageMs) && ageMs <= FUEL_LIVE_MAX_AGE_MS) liveReading = liveRow;
    }

    if (samples.length === 0 && !liveReading) {
      return json({ ok: true, data: { sample_count: 0, latest: null, fuel: null, energy: null, speed: null } });
    }

    const lastLapSample = samples.length ? samples[samples.length - 1] : null;

    const latest = liveReading ? {
      lap_number: liveReading.lap_number != null ? liveReading.lap_number : (lastLapSample ? lastLapSample.lap_number : null),
      fuel_remaining_l: liveReading.fuel_remaining_l,
      virtual_energy_pct: liveReading.virtual_energy_pct != null ? liveReading.virtual_energy_pct : (lastLapSample ? lastLapSample.virtual_energy_pct : null),
      track_name: liveReading.track_name || (lastLapSample ? lastLapSample.track_name : '') || '',
      vehicle_name: liveReading.vehicle_name || (lastLapSample ? lastLapSample.vehicle_name : '') || '',
      speed_min_kmh: lastLapSample ? lastLapSample.speed_min_kmh : null,
      speed_max_kmh: lastLapSample ? lastLapSample.speed_max_kmh : null,
      speed_avg_kmh: lastLapSample ? lastLapSample.speed_avg_kmh : null,
      created_at: liveRow.ts,
    } : lastLapSample;

    const fuelDeltas: number[] = [];
    const energyDeltas: number[] = [];
    const lapTimeDeltas: number[] = [];
    for (let i = 1; i < samples.length; i++) {
      const prev = samples[i - 1];
      const cur = samples[i];
      const clean = isCleanLap(cur);
      if (clean && prev.fuel_remaining_l != null && cur.fuel_remaining_l != null) {
        const d = prev.fuel_remaining_l - cur.fuel_remaining_l;
        if (d > 0) fuelDeltas.push(d);
      }
      if (clean && prev.virtual_energy_pct != null && cur.virtual_energy_pct != null) {
        const d = prev.virtual_energy_pct - cur.virtual_energy_pct;
        if (d > 0) energyDeltas.push(d);
      }
      let lapTimeS = cur.lap_time_s;
      if (lapTimeS == null) {
        const prevT = new Date(prev.created_at).getTime();
        const curT = new Date(cur.created_at).getTime();
        if (!isNaN(prevT) && !isNaN(curT) && curT > prevT) lapTimeS = (curT - prevT) / 1000;
      }
      if (lapTimeS != null) {
        cur._lapTimeS = lapTimeS;
        if (clean) lapTimeDeltas.push(lapTimeS);
      }
    }

    const recentAvg = (arr: number[]) => {
      if (arr.length === 0) return null;
      const recent = arr.slice(-windowSize);
      return recent.reduce((s, v) => s + v, 0) / recent.length;
    };

    const avgFuelPerLap = recentAvg(fuelDeltas);
    const avgEnergyPctPerLap = recentAvg(energyDeltas);
    const avgLapTimeS = recentAvg(lapTimeDeltas);

    const fuel = latest.fuel_remaining_l != null ? {
      avg_per_lap_l: avgFuelPerLap,
      laps_remaining: avgFuelPerLap ? latest.fuel_remaining_l / avgFuelPerLap : null,
      needed_for_target_l: (targetLaps != null && avgFuelPerLap)
        ? Math.max(0, targetLaps * avgFuelPerLap - latest.fuel_remaining_l)
        : null,
    } : null;

    const energy = latest.virtual_energy_pct != null ? {
      avg_pct_per_lap: avgEnergyPctPerLap,
      laps_remaining: avgEnergyPctPerLap ? latest.virtual_energy_pct / avgEnergyPctPerLap : null,
      needed_for_target_pct: (targetLaps != null && avgEnergyPctPerLap)
        ? Math.max(0, targetLaps * avgEnergyPctPerLap - latest.virtual_energy_pct)
        : null,
    } : null;

    const speedSamples = samples.filter((s: any) => s.speed_avg_kmh != null);
    const speed = speedSamples.length > 0 ? {
      session_min_kmh: Math.min(...speedSamples.map((s: any) => s.speed_min_kmh != null ? s.speed_min_kmh : s.speed_avg_kmh)),
      session_max_kmh: Math.max(...speedSamples.map((s: any) => s.speed_max_kmh != null ? s.speed_max_kmh : s.speed_avg_kmh)),
      session_avg_kmh: speedSamples.reduce((sum: number, s: any) => sum + s.speed_avg_kmh, 0) / speedSamples.length,
    } : null;

    const series = samples.map((s: any) => ({
      lap_number: s.lap_number,
      fuel_remaining_l: s.fuel_remaining_l,
      virtual_energy_pct: s.virtual_energy_pct,
      lap_time_s: s._lapTimeS != null ? s._lapTimeS : null,
    }));

    return json({ ok: true, data: { sample_count: samples.length, latest, fuel, energy, speed, series, avg_lap_time_s: avgLapTimeS, live: !!liveReading } });
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
