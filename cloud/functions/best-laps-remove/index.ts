// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — laps.remove (porting di apps-script/BestLaps.js)
// ═══════════════════════════════════════════════════════════
// Logica di riferimento reale (handleLapsRemove):
//   - auth richiesto, SOLO staff/admin
//   - lap_id obbligatorio
//   - hard delete
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

    const payload = await req.json().catch(() => ({}));
    const lapId = String(payload?.lap_id || '').trim();
    if (!lapId) return json({ ok: false, error: 'Campo lap_id obbligatorio per la rimozione' }, 400);

    const { data: me, error: meErr } = await supabase
      .from('drivers')
      .select('role')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (meErr) return json({ ok: false, error: meErr.message }, 400);
    if (!me) return json({ ok: false, error: 'Driver non collegato a questo account' }, 404);
    if (me.role !== 'staff' && me.role !== 'admin') {
      return json({ ok: false, error: 'Permessi insufficienti' }, 403);
    }

    const { data: existing, error: findErr } = await supabase
      .from('best_laps')
      .select('id')
      .eq('id', lapId)
      .maybeSingle();
    if (findErr) return json({ ok: false, error: findErr.message }, 400);
    if (!existing) return json({ ok: false, error: 'Lap non trovato: ' + lapId }, 404);

    const { error: deleteErr } = await supabase.from('best_laps').delete().eq('id', lapId);
    if (deleteErr) return json({ ok: false, error: deleteErr.message }, 400);

    return json({ ok: true, data: { lap_id: lapId, deleted: true } });
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
