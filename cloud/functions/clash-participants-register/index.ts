// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — clash.participants.register
// ═══════════════════════════════════════════════════════════
// Auth: opzionale. Loggato → iscrizione legata al proprio driver_id.
// Anonimo → team_slug + display_name (community non tesserata).
// Client SERVICE ROLE (lettura/scrittura pubblica controllata).
//
// #333: output driver_id = driver_code.
// #466 (stagioni): l'iscrizione si lega al campionato attivo della serie
// 'clash-of-classes' (o a payload.championship_id); niente iscrizioni a
// una stagione conclusa. Duplicati e griglia piena sono per stagione.
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const CLASH_MAX_GRID = 22;
const CLASH_SERIES = 'clash-of-classes';
const CLASH_VALID_CLASSES = ['GTE', 'GT3'];

const CLASH_VEHICLES_BY_CLASS: Record<string, string[]> = {
  GTE: [
    'Aston Martin Vantage GTE',
    'Chevrolet Corvette C8.R',
    'Ferrari 488 GTE Evo',
    'Porsche 911 RSR-19',
  ],
  GT3: [
    'Aston Martin Vantage AMR LMGT3 Evo',
    'BMW M4 LMGT3',
    'BMW M4 LMGT3 Evo',
    'Chevrolet Corvette Z06 LMGT3.R',
    'Ferrari 296 LMGT3',
    'Ferrari 296 LMGT3 Evo',
    'Ford Mustang LMGT3',
    'Ford Mustang LMGT3 Evo',
    'Lamborghini Huaracán LMGT3 Evo 2',
    'Lexus RC F LMGT3',
    'Mercedes-AMG LMGT3',
    'McLaren 720S LMGT3 Evo',
    'Porsche 911 LMGT3 R (992)',
    'Porsche 911 LMGT3 R (992) 2026',
  ],
};

function validateVehicle(vehicle: unknown, cls: string): { ok: true; value: string } | { ok: false; error: string } {
  const v = String(vehicle || '').trim();
  if (!v) return { ok: true, value: '' };
  const allowed = CLASH_VEHICLES_BY_CLASS[cls] || [];
  if (allowed.indexOf(v) === -1) {
    return { ok: false, error: `Vettura non ammessa per la classe ${cls}. Ammesse: ${allowed.join(', ')}` };
  }
  return { ok: true, value: v };
}

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

    const cls = String(payload?.class || '').trim().toUpperCase();
    if (CLASH_VALID_CLASSES.indexOf(cls) === -1) {
      return json({ ok: false, error: 'Classe non valida. Ammesse: ' + CLASH_VALID_CLASSES.join(', ') }, 400);
    }
    const vehicleCheck = validateVehicle(payload?.vehicle, cls);
    if (!vehicleCheck.ok) return json({ ok: false, error: vehicleCheck.error }, 400);
    const vehicle = vehicleCheck.value;

    let teamId: string | null = null;
    let driverId: string | null = null;
    let driverCode: string = '';
    let displayName = String(payload?.display_name || '').trim();

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
          .select('id, team_id, display_name, driver_code')
          .eq('auth_user_id', user.id)
          .maybeSingle();
        if (me) {
          teamId = me.team_id;
          driverId = me.id;
          driverCode = me.driver_code || '';
          if (!displayName) displayName = me.display_name || '';
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
    if (!championship) return json({ ok: false, error: 'Nessuna stagione Clash of Classes aperta alle iscrizioni' }, 400);
    if (championship.status === 'completed' || championship.status === 'cancelled') {
      return json({ ok: false, error: 'Le iscrizioni a questa stagione sono chiuse' }, 400);
    }

    if (!displayName) return json({ ok: false, error: 'Nome pilota mancante' }, 400);
    const discordHandle = String(payload?.discord_handle || '').trim();

    const { data: existing, error: existErr } = await serviceClient
      .from('clash_participants')
      .select('driver_id, display_name, class')
      .eq('team_id', teamId)
      .eq('championship_id', championship.id)
      .neq('status', 'withdrawn');
    if (existErr) return json({ ok: false, error: existErr.message }, 400);

    if ((existing ?? []).length >= CLASH_MAX_GRID) {
      return json({ ok: false, error: `Griglia al completo (${CLASH_MAX_GRID}/${CLASH_MAX_GRID})` }, 400);
    }

    const nameKey = displayName.toLowerCase();
    const dup = (existing ?? []).find((p: any) =>
      (driverId && p.driver_id === driverId) ||
      String(p.display_name || '').trim().toLowerCase() === nameKey,
    );
    if (dup) return json({ ok: false, error: 'Sei già iscritto a Clash of Classes (classe ' + dup.class + ')' }, 400);

    const insertRow = {
      team_id: teamId,
      championship_id: championship.id,
      driver_id: driverId,
      display_name: displayName,
      class: cls,
      discord_handle: discordHandle || null,
      vehicle: vehicle || null,
      status: 'registered',
    };

    const { data, error } = await serviceClient.from('clash_participants').insert(insertRow).select().maybeSingle();
    if (error) return json({ ok: false, error: error.message }, 400);

    return json({
      ok: true,
      data: {
        participant_id: data.id,
        driver_id: driverCode || '',
        display_name: data.display_name,
        class: data.class,
        vehicle: data.vehicle || '',
        registered_at: data.registered_at,
        status: data.status,
        championship_id: championship.id,
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
