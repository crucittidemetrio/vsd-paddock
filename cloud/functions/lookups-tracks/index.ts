// ════════════════════════════════════════════════════════
// VSD-Paddock Cloud — lookups.tracks (porting di apps-script/Lookups.js)
// ════════════════════════════════════════════════════════
// Catalogo GLOBALE (tabella tracks non è team-scoped, vedi 009), dato
// non sensibile: da #458 (04/10/2026, segnalato da Demetrio: nel form
// "Nuovo Lap" i tracciati/auto di ACE e iRacing non si caricavano)
// la funzione è PUBBLICA — client service role, nessuna auth. Prima
// richiedeva sessione Supabase o legacy_token verificato via Apps
// Script: una round-trip extra lenta/instabile per un catalogo che non
// ha nulla da proteggere. Filtro: active = true + sim opzionale.
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

    let query = supabase.from('tracks').select('*').eq('active', true);
    if (sim) query = query.eq('sim', sim);

    const { data, error } = await query;
    if (error) return json({ ok: false, error: error.message }, 400);

    const tracks = (data ?? []).sort((a: any, b: any) =>
      String(a.track_name || '').toLowerCase().localeCompare(String(b.track_name || '').toLowerCase()),
    );

    return json({ ok: true, data: { tracks, count: tracks.length } });
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
