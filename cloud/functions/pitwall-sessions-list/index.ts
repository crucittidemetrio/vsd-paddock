// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — pitwall.sessions (porting di apps-script/PitwallSessions.js)
// ═══════════════════════════════════════════════════════════
// Logica di riferimento reale (handlePitwallSessions):
//   - auth richiesto (chiunque nel team, non solo staff)
//   - raggruppa le righe per session_id, ordina per captured_at
//     decrescente (più recenti prima)
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const payload = await req.json().catch(() => ({}));
    const caller = await resolveCaller(req, payload);
    if (!caller) return json({ ok: false, error: 'Auth richiesto' }, 401);
    const supabase = caller.client;

    const { data, error } = await supabase
      .from('pitwall_sessions')
      .select('session_id, track_name, sim, session_type, captured_at')
      .eq('team_id', caller.teamId);
    if (error) return json({ ok: false, error: error.message }, 400);

    const bySession: Record<string, any> = {};
    (data ?? []).forEach((r: any) => {
      const sid = String(r.session_id || '').trim();
      if (!sid) return;
      if (!bySession[sid]) {
        bySession[sid] = {
          session_id: sid,
          track_name: r.track_name || '',
          sim: r.sim || '',
          session_type: r.session_type,
          captured_at: r.captured_at || '',
          driver_count: 0,
        };
      }
      bySession[sid].driver_count++;
    });

    const sessions = Object.values(bySession).sort((a: any, b: any) =>
      String(b.captured_at).localeCompare(String(a.captured_at)),
    );

    return json({ ok: true, data: { sessions } });
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
