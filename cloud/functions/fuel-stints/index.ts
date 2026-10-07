// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — fuel.stints (porting fedele di
// apps-script/FuelLog.js, handleFuelStints)
// ═══════════════════════════════════════════════════════════
// Raggruppa i giri in stint (confine = out-lap precedente, salto
// num_pitstops, o cambio driver) e calcola passo/degrado/consumo/
// velocità per stint, più l'hotstint (miglior passo medio tra gli
// stint con almeno FUEL_STINTS_MIN_CLEAN_LAPS_FOR_HOTSTINT giri puliti).
// Sola lettura. Stesso resolveDriver di fuel-summary.
//
// FIX #336 (20/09/2026, trovato PRIMA del cutover frontend, mai
// esposto a utenti reali): stint.driver_id era l'uuid interno
// Postgres invece del driver_code (contratto pubblico) —
// FuelPanel.jsx lo usa come fallback display (`stint.driver_name ||
// stint.driver_id`) quando driver_name manca — stesso pattern già
// visto in audit-log-list (#335), corretto qui per coerenza.
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FUEL_STINTS_MIN_CLEAN_LAPS_FOR_HOTSTINT = 3;

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

const LEGACY_API_URL = 'https://script.google.com/macros/s/AKfycbyMXxEjZfm5EIsGUnKxpwtBtoeR4hwMG7Pl8ZESF8yG569SS0aIdsWqyu9PdBgR14vLiA/exec';

async function resolveLegacyDriver(serviceClient: any, legacyToken: string | undefined) {
  if (!legacyToken) return null;
  try {
    const r = await fetch(LEGACY_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'auth.verify', token: legacyToken, payload: {} }),
    });
    const j = await r.json();
    const driverCode = j?.ok && j.data?.valid ? j.data?.driver?.driver_id : null;
    if (!driverCode) return null;
    const { data: d } = await serviceClient
      .from('drivers')
      .select('id, team_id, role, display_name, driver_code')
      .eq('driver_code', driverCode)
      .maybeSingle();
    if (!d) return null;
    return { ...d, role: j.data.driver.role || d.role };
  } catch {
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

    const payload = await req.json().catch(() => ({}));
    let driverCtx = await resolveDriver(req, serviceClient);
    if (!driverCtx) {
      // #468: fallback token legacy per la UI web (nessuna sessione Supabase reale)
      const lg = await resolveLegacyDriver(serviceClient, payload?.legacy_token);
      if (lg) driverCtx = { driver_id: lg.id, team_id: lg.team_id };
    }
    if (!driverCtx) return json({ ok: false, error: 'Auth richiesto' }, 401);

    const raceId = String(payload?.race_id || '').trim();
    const carNumber = String(payload?.car_number || '').trim();
    if (!raceId) return json({ ok: false, error: 'race_id obbligatorio' }, 400);
    if (!carNumber) return json({ ok: false, error: 'car_number obbligatorio' }, 400);

    const { data: dbRows, error } = await serviceClient
      .from('fuel_log')
      .select('*')
      .eq('team_id', driverCtx.team_id)
      .eq('race_id', raceId)
      .eq('car_number', carNumber)
      .order('lap_number', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) return json({ ok: false, error: error.message }, 400);

    // FIX #336: risoluzione batch driver_id (uuid) → driver_code, per
    // il fallback display in FuelPanel.jsx quando driver_name manca.
    const driverIdsInLog = Array.from(new Set((dbRows || []).map((s: any) => s.driver_id).filter(Boolean)));
    let driverCodeMap: Record<string, string> = {};
    if (driverIdsInLog.length > 0) {
      const { data: drivers } = await serviceClient
        .from('drivers')
        .select('id, driver_code')
        .in('id', driverIdsInLog);
      (drivers ?? []).forEach((d: any) => { driverCodeMap[d.id] = d.driver_code; });
    }

    const rows = (dbRows || []).map((s: any) => ({
      driver_id: (s.driver_id && driverCodeMap[s.driver_id]) || s.driver_id || '',
      driver_name: s.driver_name || '',
      lap_number: Number(s.lap_number),
      lap_time_s: s.lap_time_s != null ? Number(s.lap_time_s) : null,
      fuel_remaining_l: s.fuel_remaining_l != null ? Number(s.fuel_remaining_l) : null,
      speed_avg_kmh: s.speed_avg_kmh != null ? Number(s.speed_avg_kmh) : null,
      in_pits: s.in_pits === true,
      yellow_flag: s.yellow_flag === true,
      num_pitstops: s.num_pitstops != null ? Number(s.num_pitstops) : null,
      created_at: s.created_at,
    }));

    if (rows.length === 0) return json({ ok: true, data: { stints: [], hotstint: null } });

    const stintGroups: any[] = [];
    let current: any = null;
    rows.forEach((row: any, i: number) => {
      const prev = i > 0 ? rows[i - 1] : null;
      const startsNewStint = !prev
        || prev.in_pits === true
        || (prev.num_pitstops != null && row.num_pitstops != null && row.num_pitstops > prev.num_pitstops)
        || prev.driver_id !== row.driver_id;
      if (startsNewStint) {
        current = { driver_id: row.driver_id, driver_name: row.driver_name, laps: [] };
        stintGroups.push(current);
      }
      current.laps.push(row);
    });

    const stints = stintGroups.map((group: any) => {
      const laps = group.laps;
      const cleanLaps = laps.filter((lap: any, idx: number) => idx !== 0 && isCleanLap(lap) && lap.lap_time_s != null);
      const lapTimes = cleanLaps.map((l: any) => l.lap_time_s);
      const bestLapS = lapTimes.length ? Math.min(...lapTimes) : null;
      const avgLapS = lapTimes.length ? lapTimes.reduce((s: number, v: number) => s + v, 0) / lapTimes.length : null;
      const degradationS = lapTimes.length >= 2 ? (lapTimes[lapTimes.length - 1] - lapTimes[0]) : null;

      const fuelValues = laps.map((l: any) => l.fuel_remaining_l).filter((v: any) => v != null);
      const fuelUsedL = fuelValues.length >= 2 ? Math.max(0, fuelValues[0] - fuelValues[fuelValues.length - 1]) : null;

      const speedValues = cleanLaps.map((l: any) => l.speed_avg_kmh).filter((v: any) => v != null);
      const avgSpeedKmh = speedValues.length ? speedValues.reduce((s: number, v: number) => s + v, 0) / speedValues.length : null;

      return {
        driver_id: group.driver_id,
        driver_name: group.driver_name,
        start_lap: laps[0].lap_number,
        end_lap: laps[laps.length - 1].lap_number,
        lap_count: laps.length,
        clean_lap_count: cleanLaps.length,
        best_lap_s: bestLapS,
        avg_lap_s: avgLapS,
        degradation_s: degradationS,
        fuel_used_l: fuelUsedL,
        avg_speed_kmh: avgSpeedKmh,
      };
    });

    const eligible = stints.filter((s: any) => s.clean_lap_count >= FUEL_STINTS_MIN_CLEAN_LAPS_FOR_HOTSTINT && s.avg_lap_s != null);
    const hotstint = eligible.length
      ? eligible.reduce((best: any, s: any) => (s.avg_lap_s < best.avg_lap_s ? s : best))
      : null;

    return json({ ok: true, data: { stints, hotstint } });
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
