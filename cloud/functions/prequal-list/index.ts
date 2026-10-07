// VSD-Paddock Cloud — prequal.list (porting di apps-script/PrequalCandidates.js)
// Pubblica (team da sessione o team_slug). Solo candidate_id/name/car_number/grid.
// grid (#390): griglia ERA S3 (Martedì/Mercoledì), vuoto per ACI.
// #469: sorgente recuperato dal deploy live (v16) e versionato.

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
    const key = String(payload?.championship_key || '').trim();
    if (!key) return json({ ok: false, error: 'championship_key obbligatorio' }, 400);

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    let teamId: string | null = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user } } = await userClient.auth.getUser();
      if (user) {
        const { data: me } = await serviceClient
          .from('drivers')
          .select('team_id')
          .eq('auth_user_id', user.id)
          .maybeSingle();
        if (me) teamId = me.team_id;
      }
    }
    if (!teamId) {
      const teamSlug = payload?.team_slug ? String(payload.team_slug).trim() : '';
      if (!teamSlug) return json({ ok: false, error: 'team_slug obbligatorio per chiamate anonime' }, 400);
      const { data: team, error: teamErr } = await serviceClient
        .from('teams')
        .select('id')
        .eq('slug', teamSlug)
        .maybeSingle();
      if (teamErr) return json({ ok: false, error: teamErr.message }, 400);
      if (!team) return json({ ok: false, error: 'Team non trovato: ' + teamSlug }, 404);
      teamId = team.id;
    }

    const { data: all, error } = await serviceClient
      .from('prequal_candidates')
      .select('id, name, car_number, grid')
      .eq('team_id', teamId)
      .eq('championship_key', key)
      .order('name', { ascending: true });
    if (error) return json({ ok: false, error: error.message }, 400);

    const data = (all ?? []).map((c: any) => ({
      candidate_id: c.id,
      name: c.name,
      car_number: c.car_number || '',
      grid: c.grid || '',
    }));

    return json({ ok: true, data: { candidates: data, count: data.length } });
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

