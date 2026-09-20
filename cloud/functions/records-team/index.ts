// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — records.team / Muro dei Record (porting di apps-script/Records.js)
// ═══════════════════════════════════════════════════════════
// Logica di riferimento reale (handleTeamRecords):
//   - auth richiesto
//   - per ogni (sim, track_id, race_class) il giro più veloce tra i
//     tesserati ATTUALMENTE attivi (esclusi rimossi/non-attivi/
//     account di sistema)
//   - include_ex_vsd: bypassa il filtro "solo attivi" e mostra anche
//     ex piloti come detentori — onorato SOLO se l'utente è admin,
//     mai in base al payload da solo
//   - car_id senza race_class assegnato → bucket "non classificato"
//     (race_class: null), non escluso
//   - verified: true se garage61_lap_id valorizzato (qui sempre
//     false per ora: il sync Garage61 non è ancora portato, vedi 009)
//
// DIFFERENZA dal sistema reale: là "VSD001" è l'account di sistema
// hardcoded; qui si usa drivers.is_system_account (flag esplicito
// già presente dallo schema fondamenta, 001) — stesso principio già
// applicato dal commento originale su quella colonna.
//
// FIX #331 (stesso pattern di #329/#330): best_laps.driver_id è lo
// UUID interno, ma il frontend (TeamRecords.jsx e qualsiasi consumer
// futuro) si aspetta il codice pilota sotto quel nome — driverMap è
// già una select('*') su drivers, quindi driver_code è già
// disponibile senza query aggiuntive.
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Fallback token legacy (#331 fix, 20/09/2026 — vedi nota completa in
// cloud/functions/social-manager/index.ts): nessun pilota reale ha mai
// una sessione Supabase reale, solo il token legacy Discord OAuth via
// Apps Script. Stesso pattern già usato per le 19 Edge Function di
// #334 e per il dispatcher social-manager.
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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const payload = await req.json().catch(() => ({}));
    const authHeader = req.headers.get('Authorization');
    let supabase: any = null;
    let me: any = null;

    if (authHeader) {
      supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: meRow } = await supabase
          .from('drivers')
          .select('id, team_id, role, display_name, driver_code')
          .eq('auth_user_id', user.id)
          .maybeSingle();
        me = meRow || null;
      }
    }

    if (!me) {
      const legacyServiceClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const legacyMe = await resolveLegacyDriver(legacyServiceClient, payload?.legacy_token);
      if (legacyMe) {
        me = legacyMe;
        supabase = legacyServiceClient;
      }
    }

    if (!me) return json({ ok: false, error: 'Auth richiesto' }, 401);

    const simFilter = payload?.sim ? String(payload.sim) : null;

    const isAdmin = me.role === 'admin';
    const includeExVsd = isAdmin && (payload?.include_ex_vsd === true || payload?.include_ex_vsd === 'true');

    let lapsQuery = supabase.from('best_laps').select('*').eq('team_id', me.team_id);
    if (simFilter) lapsQuery = lapsQuery.eq('sim', simFilter);
    const { data: laps, error: lapsErr } = await lapsQuery;
    if (lapsErr) return json({ ok: false, error: lapsErr.message }, 400);

    const { data: drivers, error: driversErr } = await supabase.from('drivers').select('*').eq('team_id', me.team_id);
    if (driversErr) return json({ ok: false, error: driversErr.message }, 400);

    const { data: cars, error: carsErr } = await supabase.from('cars').select('car_id, race_class');
    if (carsErr) return json({ ok: false, error: carsErr.message }, 400);

    const driverMap: Record<string, any> = {};
    (drivers ?? []).forEach((d: any) => { driverMap[d.id] = d; });

    const carRaceClass: Record<string, string | null> = {};
    (cars ?? []).forEach((c: any) => {
      if (c.car_id) carRaceClass[c.car_id] = (c.race_class && String(c.race_class).trim()) || null;
    });

    function isExVsd(driverId: string): boolean {
      const d = driverMap[driverId];
      if (!d) return false;
      return Boolean(d.removed_at) || d.status !== 'active';
    }

    function isEligible(driverId: string): boolean {
      const d = driverMap[driverId];
      if (!d) return false;
      if (d.is_system_account) return false;
      if (includeExVsd) return true;
      return !isExVsd(driverId);
    }

    const filtered = (laps ?? []).filter((l: any) => {
      if (!l.driver_id || !l.sim || !l.track_id) return false;
      const ms = Number(l.lap_time_ms);
      if (!ms || ms <= 0) return false;
      return isEligible(l.driver_id);
    });

    const recordsByKey: Record<string, { lap: any; race_class: string | null }> = {};
    filtered.forEach((l: any) => {
      const raceClass = carRaceClass[l.car_id] ?? null;
      const key = `${l.sim}|${l.track_id}|${raceClass || ''}`;
      const ms = Number(l.lap_time_ms);
      if (!recordsByKey[key] || ms < Number(recordsByKey[key].lap.lap_time_ms)) {
        recordsByKey[key] = { lap: l, race_class: raceClass };
      }
    });

    const records = Object.values(recordsByKey)
      .map(entry => {
        const l = entry.lap;
        const d = driverMap[l.driver_id];
        return {
          sim: l.sim,
          track_id: l.track_id,
          race_class: entry.race_class,
          driver_id: (d && d.driver_code) || l.driver_id,
          display_name: (d && d.display_name) || l.driver_id,
          lap_time_ms: Number(l.lap_time_ms),
          lap_time_display: l.lap_time_display || '',
          car_id: l.car_id || '',
          set_date: l.set_date || '',
          verified: Boolean(l.garage61_lap_id),
          is_ex_vsd: isExVsd(l.driver_id),
        };
      })
      .sort((a, b) =>
        a.sim.localeCompare(b.sim) ||
        a.track_id.localeCompare(b.track_id) ||
        String(a.race_class || 'zzz').localeCompare(String(b.race_class || 'zzz')),
      );

    return json({ ok: true, data: { records, count: records.length } });
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
