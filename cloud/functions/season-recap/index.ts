// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — recap.mine (porting fedele di
// apps-script/SeasonRecap.js, handleSeasonRecap)
// ═══════════════════════════════════════════════════════════
// Riepilogo stagionale PERSONALE del pilota loggato, calcolato a
// runtime da race_results — nessuna tabella dedicata. Solo il
// proprio recap (mai quello di un altro pilota, stesso scope
// ridotto Fase 1 del sorgente). Confine stagione: stesso criterio
// del sorgente (SEASON_2026_START, 1 gennaio 2026, riuso dello
// stesso concetto già in uso altrove). Cross-sim per i conteggi
// (gare/podi/DNF) — legittimo qui, a differenza del VR, perché sono
// solo conteggi personali. Solo session_type === 'race'.
//
// FIX 21/09/2026 (segnalato da Demetrio, "sistema non più utilizzabile
// da notebook"): aggiunto fallback token legacy, stesso pattern
// #331/#358/#359 — mai incluso qui perché il file non era mai stato
// sincronizzato in git (gap di drift, stesso pattern di audit-log-list
// in #335). Senza sessione Supabase reale la pagina Season Recap
// mostrava "Auth richiesto" con 401 silenzioso per qualunque pilota
// con solo il token legacy.
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

const RECAP_SEASON_START = '2026-01-01';

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

    const { data: allResults, error: resErr } = await supabase
      .from('race_results')
      .select('race_id, sim, track_id, car_class, finish_position, best_lap_ms, best_lap_display, dnf, set_date')
      .eq('team_id', me.team_id)
      .eq('driver_id', me.id)
      .eq('session_type', 'race')
      .gte('set_date', RECAP_SEASON_START);
    if (resErr) return json({ ok: false, error: resErr.message }, 400);
    const results = allResults ?? [];

    const races = results.length;
    const podiums = results.filter((r: any) => { const pos = Number(r.finish_position); return pos >= 1 && pos <= 3; }).length;
    const dnfs = results.filter((r: any) => !!r.dnf).length;

    let bestFinish: any = null;
    results.forEach((r: any) => {
      const pos = Number(r.finish_position);
      if (!pos || pos < 1) return;
      if (!bestFinish || pos < bestFinish.position) {
        bestFinish = { position: pos, race_id: r.race_id, track_id: r.track_id || '', sim: r.sim || '', car_class: r.car_class || '' };
      }
    });

    let bestLap: any = null;
    results.forEach((r: any) => {
      const ms = Number(r.best_lap_ms);
      if (!ms || ms <= 0) return;
      if (!bestLap || ms < bestLap.ms) {
        bestLap = { ms, display: r.best_lap_display || '', race_id: r.race_id, track_id: r.track_id || '', sim: r.sim || '' };
      }
    });

    const trackCounts: Record<string, number> = {};
    results.forEach((r: any) => { if (!r.track_id) return; trackCounts[r.track_id] = (trackCounts[r.track_id] || 0) + 1; });
    let mostRacedTrack: any = null;
    Object.keys(trackCounts).forEach((trackId) => {
      if (!mostRacedTrack || trackCounts[trackId] > mostRacedTrack.count) mostRacedTrack = { track_id: trackId, count: trackCounts[trackId] };
    });

    const simCounts: Record<string, number> = {};
    results.forEach((r: any) => { if (!r.sim) return; simCounts[r.sim] = (simCounts[r.sim] || 0) + 1; });
    const bySim = Object.keys(simCounts).map((sim) => ({ sim, races: simCounts[sim] })).sort((a, b) => b.races - a.races);

    return json({
      ok: true,
      data: { season_start: RECAP_SEASON_START, races, podiums, dnfs, bestFinish, bestLap, mostRacedTrack, bySim },
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
