// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — pitwall.sessions (porting di apps-script/PitwallSessions.js)
// ═══════════════════════════════════════════════════════════
// Logica di riferimento reale (handlePitwallSessions):
//   - auth richiesto (chiunque nel team, non solo staff)
//   - raggruppa le righe per session_id, ordina per captured_at
//     decrescente (più recenti prima)
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ ok: false, error: 'Auth richiesto' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) return json({ ok: false, error: 'Auth richiesto' }, 401);

    const { data, error } = await supabase
      .from('pitwall_sessions')
      .select('session_id, track_name, sim, session_type, captured_at');
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
