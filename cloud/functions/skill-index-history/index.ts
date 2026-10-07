// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — skillIndex.history (porting di apps-script/SkillIndex.js)
// ═══════════════════════════════════════════════════════════
// Serie storica Skill Index di un pilota (grafico sul profilo).
// payload.driver_id = driver_code; risolto in uuid prima della query,
// output aliasato al driver_code (#332).
//
// #468 (07/10/2026): sorgente versionato + fallback token legacy (prima
// solo sessione Supabase → "Auth richiesto" per tutti i piloti reali).
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// #468 — risoluzione chiamante: sessione Supabase OPPURE token legacy
// (Apps Script auth.verify). Nessun pilota reale ha una sessione Supabase:
// senza il ramo legacy queste funzioni rispondevano sempre "Auth richiesto".
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

async function resolveCaller(req: Request, payload: any): Promise<{ client: any; driverId: string; teamId: string; role: string } | null> {
  const url = Deno.env.get('SUPABASE_URL')!;
  const authHeader = req.headers.get('Authorization');
  if (authHeader) {
    const uc = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await uc.auth.getUser();
    if (user) {
      const { data: d } = await uc.from('drivers').select('id, team_id, role').eq('auth_user_id', user.id).maybeSingle();
      if (d) return { client: uc, driverId: d.id, teamId: d.team_id, role: d.role };
    }
  }
  const sc = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const lg = await resolveLegacyDriver(sc, payload?.legacy_token);
  if (lg) return { client: sc, driverId: lg.id, teamId: lg.team_id, role: lg.role };
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const payload = await req.json().catch(() => ({}));
    const caller = await resolveCaller(req, payload);
    if (!caller) return json({ ok: false, error: 'Auth richiesto' }, 401);
    const supabase = caller.client;

    const driverCodeParam = payload?.driver_id ? String(payload.driver_id).trim() : '';
    if (!driverCodeParam) return json({ ok: false, error: 'driver_id mancante' }, 400);

    const { data: driver, error: driverErr } = await supabase
      .from('drivers')
      .select('id, driver_code')
      .eq('driver_code', driverCodeParam)
      .eq('team_id', caller.teamId)
      .maybeSingle();
    if (driverErr) return json({ ok: false, error: driverErr.message }, 400);
    if (!driver) return json({ ok: false, error: 'Driver non trovato: ' + driverCodeParam }, 404);

    const { data: snapshots, error } = await supabase
      .from('skill_index_history')
      .select('driver_id, score, races_counted, avg_finish_pct, podium_rate, avg_incidents, snapshot_date')
      .eq('driver_id', driver.id)
      .eq('team_id', caller.teamId)
      .order('snapshot_date', { ascending: true });
    if (error) return json({ ok: false, error: error.message }, 400);

    const aliased = (snapshots ?? []).map((s: any) => ({ ...s, driver_id: driver.driver_code }));

    return json({ ok: true, data: { snapshots: aliased, count: aliased.length } });
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
