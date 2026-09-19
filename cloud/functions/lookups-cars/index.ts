// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — lookups.cars (porting di apps-script/Lookups.js)
// ═══════════════════════════════════════════════════════════
// Logica di riferimento reale (handleLookupsCars):
//   - auth richiesto
//   - default: solo active = true
//   - filtro opzionale sim
//   - ordina per car_name (case-insensitive)
//
// Catalogo GLOBALE (tabella cars non è team-scoped, vedi 009): un
// select semplice, nessun filtro di team da applicare.
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
    const sim = payload?.sim ? String(payload.sim) : null;

    let query = supabase.from('cars').select('*').eq('active', true);
    if (sim) query = query.eq('sim', sim);

    const { data, error } = await query;
    if (error) return json({ ok: false, error: error.message }, 400);

    const cars = (data ?? []).sort((a: any, b: any) =>
      String(a.car_name || '').toLowerCase().localeCompare(String(b.car_name || '').toLowerCase()),
    );

    return json({ ok: true, data: { cars, count: cars.length } });
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
