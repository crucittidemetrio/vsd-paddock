// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — clash.participants.list
// ═══════════════════════════════════════════════════════════
// Auth: NESSUNA richiesta (evento community-wide). Un chiamante
// autenticato usa il proprio team_id; un anonimo passa team_slug.
// Client SERVICE ROLE per bypassare la RLS sulla lettura pubblica.
//
// #333: driver_id (solo staff) è sempre driver_code.
// #466 (stagioni): gli iscritti sono legati a un campionato
// (clash_participants.championship_id). payload.championship_id
// sceglie la stagione; in assenza, il campionato attivo della serie
// 'clash-of-classes' (altrimenti il più recente).
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const CLASH_MAX_GRID = 22;
const CLASH_SERIES = 'clash-of-classes';

async function resolveClashChampionship(serviceClient: any, teamId: string, requestedId: string) {
  const { data } = await serviceClient
    .from('championships')
    .select('id, name, season, status, start_date')
    .eq('team_id', teamId)
    .eq('series', CLASH_SERIES);
  const sorted = (data ?? []).slice().sort((a: any, b: any) =>
    String(b.start_date || '').localeCompare(String(a.start_date || '')));
  if (requestedId) return sorted.find((c: any) => c.id === requestedId) || null;
  return sorted.find((c: any) => c.status === 'active') || sorted[0] || null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const payload = await req.json().catch(() => ({}));
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    let teamId: string | null = null;
    let isStaff = false;

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
          .select('team_id, role')
          .eq('auth_user_id', user.id)
          .maybeSingle();
        if (me) {
          teamId = me.team_id;
          isStaff = me.role === 'staff' || me.role === 'admin';
        }
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

    const championship = await resolveClashChampionship(
      serviceClient, teamId!, payload?.championship_id ? String(payload.championship_id) : '',
    );
    if (!championship) {
      return json({
        ok: true,
        data: { participants: [], count: 0, counts: { GTE: 0, GT3: 0 }, max_grid: CLASH_MAX_GRID, championship: null },
      });
    }

    const { data: all, error } = await serviceClient
      .from('clash_participants')
      .select('id, driver_id, display_name, class, discord_handle, vehicle, status, registered_at')
      .eq('team_id', teamId)
      .eq('championship_id', championship.id)
      .neq('status', 'withdrawn');
    if (error) return json({ ok: false, error: error.message }, 400);

    let codeByUuid: Record<string, string> = {};
    if (isStaff) {
      const { data: teamDrivers, error: teamDriversErr } = await serviceClient
        .from('drivers')
        .select('id, driver_code')
        .eq('team_id', teamId);
      if (teamDriversErr) return json({ ok: false, error: teamDriversErr.message }, 400);
      (teamDrivers ?? []).forEach((d: any) => { if (d.driver_code) codeByUuid[d.id] = d.driver_code; });
    }

    const data = (all ?? []).map((p: any) => {
      const base: any = {
        participant_id: p.id,
        display_name: p.display_name,
        class: p.class,
        vehicle: p.vehicle || '',
      };
      if (isStaff) {
        base.driver_id = p.driver_id ? (codeByUuid[p.driver_id] || p.driver_id) : '';
        base.discord_handle = p.discord_handle || '';
        base.registered_at = p.registered_at;
        base.status = p.status;
      }
      return base;
    });

    const counts = { GTE: 0, GT3: 0 };
    (all ?? []).forEach((p: any) => { if (counts[p.class as 'GTE' | 'GT3'] !== undefined) counts[p.class as 'GTE' | 'GT3']++; });

    return json({
      ok: true,
      data: {
        participants: data,
        count: (all ?? []).length,
        counts,
        max_grid: CLASH_MAX_GRID,
        championship: { id: championship.id, name: championship.name, season: championship.season, status: championship.status },
      },
    });
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
