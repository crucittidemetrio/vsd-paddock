// VSD-Paddock Cloud — consent.socialFlags (porting di apps-script/Consent.js)
// Pubblica (serve al Roster anche per visitatori anonimi): team dalla sessione
// o da team_slug (iniettato dal client). flags chiavizzati per driver_code
// (v2 fix: prima uuid → foto mai mostrate). Il flag dice solo se il pilota ha
// acconsentito alla pubblicazione social.
// #469: sorgente recuperato dal deploy live (v16) e versionato.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CONSENT_VERSION = 'v1-2026-08-08';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const payload = await req.json().catch(() => ({}));

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

    const { data: consents, error } = await serviceClient
      .from('consents')
      .select('driver_id, social_consent')
      .eq('team_id', teamId)
      .eq('consent_version', CONSENT_VERSION);
    if (error) return json({ ok: false, error: error.message }, 400);

    const { data: teamDrivers, error: drvErr } = await serviceClient
      .from('drivers')
      .select('id, driver_code')
      .eq('team_id', teamId);
    if (drvErr) return json({ ok: false, error: drvErr.message }, 400);
    const codeByUuid: Record<string, string> = {};
    (teamDrivers ?? []).forEach((d: any) => { codeByUuid[d.id] = d.driver_code; });

    const flags: Record<string, boolean> = {};
    (consents ?? []).forEach((c: any) => {
      const code = codeByUuid[c.driver_id];
      if (code) flags[code] = !!c.social_consent;
    });

    return json({ ok: true, data: { required_version: CONSENT_VERSION, flags } });
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

