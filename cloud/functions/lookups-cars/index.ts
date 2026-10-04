// ════════════════════════════════════════════════════════
// VSD-Paddock Cloud — lookups.cars (porting di apps-script/Lookups.js)
// ════════════════════════════════════════════════════════
// Catalogo GLOBALE (tabella cars non è team-scoped, vedi 009), dato
// non sensibile: da #458 (04/10/2026) la funzione è PUBBLICA — vedi
// nota gemella in lookups-tracks/index.ts. Filtro: active = true +
// sim opzionale.
// ════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const payload = await req.json().catch(() => ({}));
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

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
