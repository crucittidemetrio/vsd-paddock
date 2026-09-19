// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — roster.list (porting di apps-script/Roster.js)
// ═══════════════════════════════════════════════════════════
// Logica di riferimento reale (handleRosterList in Roster.js):
//   - rimosso (removed_at) → visibile solo se includeRemoved
//   - altrimenti → visibile se includeInactive/includeRemoved, o se status='active'
//   - sempre livello PUBLIC, anche per staff/admin (il dettaglio privato
//     sta in roster-get)
//
// FIX (19/09/2026, segnalato da Demetrio): il campo esposto qui era
// `is_ex_driver`, ma TUTTO il frontend (Roster.jsx, DriverCard.jsx,
// TeamRecords.jsx, Compare.jsx, DriverProfile.jsx, Landing.jsx,
// LapsDrilldown.jsx, BestLaps.jsx, Calendar.jsx, driverStatus.js,
// RaceResultsSection.jsx — praticamente ogni consumer) si aspetta
// `is_ex_vsd` (nome ereditato da Apps Script). Essendo sempre
// undefined, Roster.jsx metteva TUTTI i piloti (inclusi i veri
// ex-VSD rimossi) dentro activeDrivers invece che exDrivers: la
// sezione "Ex Piloti" risultava sempre vuota/nascosta e il conteggio
// "piloti totali" li includeva. Stesso principio delle fix driver_id
// #329/#330/#331: alias nella risposta, MAI il frontend.
//
// REVISIONE #329 (cutover Pubblico+Roster, sessione 18/09/2026): la
// versione originale richiedeva SEMPRE `Authorization` (401 se
// assente) e si appoggiava a RLS+security_invoker sulla vista
// drivers_public. Scoperto in validazione che questo rompe il
// comportamento reale del sito live, dove /roster è una rotta
// pubblica (nessun <ProtectedRoute>) e un visitatore anonimo la vede
// oggi senza login (Apps Script costruisce comunque un ctx anonimo,
// stesso pattern già documentato in #259 per stints.list). Inoltre
// un semplice "grant select su drivers_public ad anon" NON basta:
// la vista filtra con `team_id = current_driver_team_id()`, e
// quella funzione risolve il team leggendo `auth.uid()` — per un
// chiamante anonimo restituisce sempre NULL, quindi zero righe
// comunque. Riscritto per riusare lo STESSO pattern già consolidato
// per Clash of Classes/ChampionshipInterest/Showcase: client SERVICE
// ROLE (bypassa RLS) + risoluzione team via sessione autenticata
// (auth_user_id) O, per chiamate anonime, `team_slug` esplicito nel
// payload. Nessuna differenza di risposta per il chiamante rispetto
// a prima (stesso shape {drivers, count}, stesse colonne pubbliche).
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Stesse colonne esposte dalla vista drivers_public (002_roster_policies.sql).
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

    const includeInactive = payload?.includeInactive === true || payload?.includeInactive === 'true';
    const includeRemoved = payload?.includeRemoved === true || payload?.includeRemoved === 'true';

    const { data, error } = await serviceClient
      .from('drivers')
      .select(PUBLIC_COLUMNS.join(', '))
      .eq('team_id', teamId)
      .eq('is_system_account', false);
    if (error) return json({ ok: false, error: error.message }, 400);

    const filtered = (data ?? []).map((d: any) => ({ ...d, is_ex_vsd: !!d.removed_at })).filter((d: any) => {
      if (d.removed_at) return includeRemoved;
      if (includeInactive || includeRemoved) return true;
      return d.status === 'active';
    });

    filtered.sort((a: any, b: any) =>
      String(a.display_name || '').toLowerCase().localeCompare(String(b.display_name || '').toLowerCase()),
    );

    return json({ ok: true, data: { drivers: filtered, count: filtered.length } });
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
