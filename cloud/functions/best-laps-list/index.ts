// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — laps.list (porting di apps-script/BestLaps.js)
// ═══════════════════════════════════════════════════════════
// Logica di riferimento reale (handleLapsList):
//   - auth richiesto
//   - ritorna TUTTI i lap del team, ordinati per lap_time_ms crescente
//   - nessun filtro applicativo: il frontend filtra in memoria
//
// Team scoping via RLS "best_laps: il team legge tutti i tempi" (009).
//
// FIX #331 (stesso pattern di #329/#330): best_laps.driver_id in
// Postgres è lo UUID interno (FK drivers.id), ma tutto il frontend
// (useBestLaps.js: activeDriverIdSet(...).has(l.driver_id), filtro per
// filters.driver_id, AdminBestLaps.jsx: driversById[lap.driver_id])
// si aspetta il codice pilota (VSD005) sotto quel nome — join su
// drivers, driver_code esposto come driver_id.
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

    const { data, error } = await supabase
      .from('best_laps')
      .select('*, drivers!best_laps_driver_id_fkey(driver_code)')
      .eq('team_id', me.team_id)
      .order('lap_time_ms', { ascending: true });

    if (error) return json({ ok: false, error: error.message }, 400);

    const laps = (data ?? []).map((l: any) => {
      const { drivers, ...rest } = l;
      return { ...rest, driver_id: drivers?.driver_code ?? l.driver_id };
    });

    return json({ ok: true, data: { laps, count: laps.length } });
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
