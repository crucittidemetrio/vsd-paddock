// VSD-Paddock Cloud — interest.list (porting di apps-script/ChampionshipInterest.js)
// Pubblica (team da sessione o team_slug). Campi staff (discord, note, stato,
// driver_id=driver_code) solo se il chiamante è staff/admin.
// #469: sorgente recuperato dal deploy live (v16) e versionato. Lo staff veniva
// riconosciuto solo con sessione Supabase (che nessuno ha): ora anche via token
// legacy, altrimenti l'admin vedeva la lista "pubblica" senza contatti/note.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const LEGACY_API_URL = 'https://script.google.com/macros/s/AKfycbyMXxEjZfm5EIsGUnKxpwtBtoeR4hwMG7Pl8ZESF8yG569SS0aIdsWqyu9PdBgR14vLiA/exec';

async function resolveLegacyDriver(serviceClient: any, legacyToken: string | undefined) {
  if (!legacyToken) return null;
  try {
    const r = await fetch(LEGACY_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'auth.verify', token: legacyToken, payload: {} }),
    });
    const j = await r.json();
    const driverCode = j?.ok && j.data?.valid ? j.data?.driver?.driver_id : null;
    if (!driverCode) return null;
    const { data: d } = await serviceClient
      .from('drivers')
      .select('id, team_id, driver_code, role')
      .eq('driver_code', driverCode)
      .maybeSingle();
    if (!d) return null;
    return { id: d.id, team_id: d.team_id, role: j.data.driver.role || d.role };
  } catch {
    return null;
  }
}

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
      const lg = await resolveLegacyDriver(serviceClient, payload?.legacy_token);
      if (lg) {
        teamId = lg.team_id;
        isStaff = lg.role === 'staff' || lg.role === 'admin';
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
      .from('championship_interest')
      .select('id, driver_id, display_name, category, vehicle, discord_handle, note, registered_at, status')
      .eq('team_id', teamId)
      .eq('championship_key', key)
      .neq('status', 'withdrawn');
    if (error) return json({ ok: false, error: error.message }, 400);

    const codeByUuid: Record<string, string> = {};
    if (isStaff && (all ?? []).some((p: any) => p.driver_id)) {
      const { data: teamDrivers } = await serviceClient
        .from('drivers')
        .select('id, driver_code')
        .eq('team_id', teamId);
      (teamDrivers ?? []).forEach((d: any) => { codeByUuid[d.id] = d.driver_code; });
    }

    const data = (all ?? []).map((p: any) => {
      const base: any = {
        interest_id: p.id,
        display_name: p.display_name,
        category: p.category || '',
        vehicle: p.vehicle || '',
      };
      if (isStaff) {
        base.driver_id = (p.driver_id && codeByUuid[p.driver_id]) || '';
        base.discord_handle = p.discord_handle || '';
        base.note = p.note || '';
        base.registered_at = p.registered_at;
        base.status = p.status;
      }
      return base;
    });

    return json({ ok: true, data: { interests: data, count: (all ?? []).length } });
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

