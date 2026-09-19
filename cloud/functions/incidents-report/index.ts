// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — incidents.report (intake nativo, sostituisce il
// Google Form esterno del sistema reale — vedi nota in 017_incidents.sql)
// ═══════════════════════════════════════════════════════════
// Qualsiasi membro del team autenticato può segnalare un incidente.
// reporter_driver_id è SEMPRE risolto dall'auth (mai dal payload) —
// un pilota non può segnalare "per conto di" un altro.
//
// against_driver_id, se presente, deve appartenere allo stesso team
// (verificato qui, non solo dalla RLS che non lo controlla a livello
// di riga referenziata). against_name_external è l'alternativa per un
// pilota esterno al team, non presente in roster — i due campi non si
// escludono a vicenda per constraint DB, ma il frontend userà l'uno o
// l'altro secondo il flusso (dropdown roster vs testo libero).
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
    const description = payload?.description ? String(payload.description).trim() : '';
    if (!description) return json({ ok: false, error: 'description obbligatoria' }, 400);

    const { data: me, error: meErr } = await supabase
      .from('drivers')
      .select('id, team_id')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (meErr) return json({ ok: false, error: meErr.message }, 400);
    if (!me) return json({ ok: false, error: 'Driver non collegato a questo account' }, 404);

    let againstDriverId: string | null = null;
    if (payload?.against_driver_id) {
      const { data: against, error: againstErr } = await supabase
        .from('drivers')
        .select('id')
        .eq('id', String(payload.against_driver_id))
        .eq('team_id', me.team_id)
        .maybeSingle();
      if (againstErr) return json({ ok: false, error: againstErr.message }, 400);
      if (!against) return json({ ok: false, error: 'against_driver_id non trovato nel team' }, 404);
      againstDriverId = against.id;
    }

    const insertRow = {
      team_id: me.team_id,
      reporter_driver_id: me.id,
      against_driver_id: againstDriverId,
      against_name_external: payload?.against_name_external ? String(payload.against_name_external).trim() : null,
      race_date: payload?.race_date || null,
      track_id: payload?.track_id ? String(payload.track_id) : null,
      lap: payload?.lap ? String(payload.lap) : null,
      time_in_race: payload?.time_in_race ? String(payload.time_in_race) : null,
      incident_type: payload?.incident_type ? String(payload.incident_type) : null,
      description,
      championship_id: payload?.championship_id ? String(payload.championship_id) : null,
    };

    const { data, error } = await supabase.from('incident_reports').insert(insertRow).select().maybeSingle();
    if (error) return json({ ok: false, error: error.message }, 400);

    return json({ ok: true, data: { report: data } });
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
