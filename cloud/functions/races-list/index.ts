// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — races.list (porting di apps-script/Races.js)
// ═══════════════════════════════════════════════════════════
// Logica di riferimento reale (handleRacesList):
//   - auth richiesto (qualsiasi ruolo, nessun gate staff/admin)
//   - filtro opzionale payload.status (match esatto, nessuna
//     validazione contro un enum — coerente col sorgente)
//   - ordinamento per data crescente
//
// DIFFERENZA deliberata: championship_name è sempre null qui. Nel
// sorgente reale viene arricchito con un JOIN su getChampionshipNameMap_()
// (tab Championships). Quel dominio non è ancora portato in cloud/
// (Fase 2, task #252) — il campo resta nella risposta per compatibilità
// col frontend reale, ma è sempre null finché Championships non esiste.
// L'isolamento multi-tenant lo fa la RLS (current_driver_team_id()),
// non serve filtrare team_id qui.
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
    const statusFilter = payload?.status ? String(payload.status) : null;

    let query = supabase.from('races').select('*').order('date', { ascending: true });
    if (statusFilter) query = query.eq('status', statusFilter);

    const { data, error } = await query;
    if (error) return json({ ok: false, error: error.message }, 400);

    const races = (data ?? []).map((r: any) => ({ ...r, championship_name: null }));

    return json({ ok: true, data: { races, count: races.length } });
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
