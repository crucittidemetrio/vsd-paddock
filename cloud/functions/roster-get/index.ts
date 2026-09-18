// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — roster.get (porting di apps-script/Roster.js)
// ═══════════════════════════════════════════════════════════
// Logica di riferimento reale (handleRosterGet in Roster.js):
//   - livello 'private' se isStaff O isSelf, altrimenti 'public'
//
// REVISIONE #329 (cutover Pubblico+Roster, sessione 18/09/2026):
// stesso motivo di roster-list — la versione precedente richiedeva
// sempre Authorization e si appoggiava a RLS sulla tabella base
// `drivers` (self-o-staff) con fallback alla vista drivers_public;
// entrambe le strade tornavano zero righe per un chiamante anonimo
// (RLS/vista dipendono da auth.uid()), rompendo /roster/:driverId
// pubblico che oggi funziona senza login. Riscritto con lo stesso
// pattern service-role + team_slug di roster-list: qui il
// livello "privato vs pubblico" non è più una conseguenza
// strutturale della RLS ma un check applicativo esplicito
// (isSelf/isStaff), perché il client service-role bypassa la RLS
// per definizione.
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PUBLIC_COLUMNS = [
  'id', 'team_id', 'driver_code', 'display_name', 'role', 'status', 'join_date',
  'nationality', 'preferred_sims', 'specialties', 'avatar_url', 'bio',
  'iracing_id', 'lmu_id', 'ace_id', 'discord_id', 'race_number',
  'instagram', 'facebook', 'roster_track', 'removed_at',
];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const payload = await req.json().catch(() => ({}));
    const driverCode = String(payload?.driver_id || '').trim();
    if (!driverCode) return json({ ok: false, error: 'driver_id mancante' }, 400);

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    let teamId: string | null = null;
    let callerDriverCode: string | null = null;
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
          .select('team_id, driver_code, role')
          .eq('auth_user_id', user.id)
          .maybeSingle();
        if (me) {
          teamId = me.team_id;
          callerDriverCode = me.driver_code;
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

    const isSelf = callerDriverCode !== null && callerDriverCode === driverCode;
    const columns = (isSelf || isStaff) ? '*' : PUBLIC_COLUMNS.join(', ');

    const { data: row, error } = await serviceClient
      .from('drivers')
      .select(columns)
      .eq('team_id', teamId)
      .eq('driver_code', driverCode)
      .maybeSingle();

    if (error) return json({ ok: false, error: error.message }, 400);
    if (!row) return json({ ok: false, error: 'Pilota non trovato: ' + driverCode }, 404);

    return json({ ok: true, data: { driver: { ...row, is_ex_driver: !!row.removed_at } } });
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
