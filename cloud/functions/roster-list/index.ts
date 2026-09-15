// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — roster.list (porting di apps-script/Roster.js)
// ═══════════════════════════════════════════════════════════
// Logica di riferimento reale (handleRosterList in Roster.js):
//   - auth richiesto
//   - rimosso (removed_at) → visibile solo se includeRemoved
//   - altrimenti → visibile se includeInactive/includeRemoved, o se status='active'
//   - sempre livello PUBLIC, anche per staff/admin (il dettaglio privato
//     sta in roster-get) — qui garantito strutturalmente perché la
//     query usa solo drivers_public, mai la tabella base.
//
// RLS fa il resto: drivers_public è team-scoped e security_invoker,
// quindi filtra già al team del chiamante e esclude gli account di
// sistema (is_system_account=false) — nessun filtro applicativo
// manuale necessario per quello.
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

    const payload = await req.json().catch(() => ({}));
    const includeInactive = payload?.includeInactive === true || payload?.includeInactive === 'true';
    const includeRemoved = payload?.includeRemoved === true || payload?.includeRemoved === 'true';

    const { data, error } = await supabase.from('drivers_public').select('*');
    if (error) return json({ ok: false, error: error.message }, 400);

    const filtered = (data ?? []).filter((d: any) => {
      if (d.removed_at) return includeRemoved;
      if (includeInactive || includeRemoved) return true;
      return d.status === 'active';
    });

    filtered.sort((a: any, b: any) =>
      String(a.display_name || '').toLowerCase().localeCompare(String(b.display_name || '').toLowerCase()),
    );

    return json({ ok: true, data: { drivers: filtered, count: filtered.length } });
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
