// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — clash.participants.add (porting fedele di
// apps-script/ClashOfClasses.js, handleClashParticipantsAdd)
// ═══════════════════════════════════════════════════════════
// Auth: staff/admin. Iscrizione manuale per riallineare con SimGrid.
//
// #333: payload.driver_id è driver_code (VSD00X); clash_participants.
// driver_id è uuid → risolto driver_code→uuid scoped al team prima
// dell'insert; l'output torna a esporre driver_code.
//
// #461 (07/10/2026): fallback legacy_token aggiunto (vedi
// clash-incidents-list).
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
      .select('id, team_id, role, display_name, driver_code')
      .eq('driver_code', driverCode)
      .maybeSingle();
    if (!d) return null;
    return { ...d, role: j.data.driver.role || d.role };
  } catch {
    return null;
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const CLASH_MAX_GRID = 22;
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const payload = await req.json().catch(() => ({}));
    const authHeader = req.headers.get('Authorization');
    let supabase: any = null;
    let me: any = null;

    if (authHeader) {
      supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: meRow } = await supabase
          .from('drivers')
          .select('id, team_id, role, display_name, driver_code')
          .eq('auth_user_id', user.id)
          .maybeSingle();
        me = meRow || null;
      }
    }

    if (!me) {
      const legacyServiceClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const legacyMe = await resolveLegacyDriver(legacyServiceClient, payload?.legacy_token);
      if (legacyMe) {
        me = legacyMe;
        supabase = legacyServiceClient;
      }
    }

    if (!me) return json({ ok: false, error: 'Auth richiesto' }, 401);
    if (me.role !== 'staff' && me.role !== 'admin') {
      return json({ ok: false, error: 'Operazione riservata a staff e admin' }, 403);
    }

    const cls = String(payload?.class || '').trim().toUpperCase();
    if (CLASH_VALID_CLASSES.indexOf(cls) === -1) {
      return json({ ok: false, error: 'Classe non valida. Ammesse: ' + CLASH_VALID_CLASSES.join(', ') }, 400);
    }
    const vehicleCheck = validateVehicle(payload?.vehicle, cls);
    if (!vehicleCheck.ok) return json({ ok: false, error: vehicleCheck.error }, 400);
    const vehicle = vehicleCheck.value;

    const displayName = String(payload?.display_name || '').trim();
    if (!displayName) return json({ ok: false, error: 'Nome pilota mancante' }, 400);

    const { data: teamDrivers, error: teamDriversErr } = await supabase
      .from('drivers')
      .select('id, driver_code')
      .eq('team_id', me.team_id);
    if (teamDriversErr) return json({ ok: false, error: teamDriversErr.message }, 400);
    const codeByUuid: Record<string, string> = {};
    const uuidByCode: Record<string, string> = {};
    (teamDrivers ?? []).forEach((d: any) => {
      if (d.driver_code) { codeByUuid[d.id] = d.driver_code; uuidByCode[d.driver_code] = d.id; }
    });

    const driverCodeInput = payload?.driver_id ? String(payload.driver_id).trim() : '';
    let driverId: string | null = null;
    if (driverCodeInput) {
      driverId = uuidByCode[driverCodeInput] || null;
      if (!driverId) return json({ ok: false, error: 'driver_id non trovato nel roster: ' + driverCodeInput }, 400);
    }

    const discordHandle = String(payload?.discord_handle || '').trim();

    const { data: existing, error: existErr } = await supabase
      .from('clash_participants')
      .select('driver_id, display_name, class')
      .eq('team_id', me.team_id)
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
    if (dup) {
      return json({ ok: false, error: 'Pilota già iscritto (classe ' + dup.class + ') — usa clash.participants.update per modificarlo' }, 400);
    }

    const insertRow = {
      team_id: me.team_id,
      driver_id: driverId,
      display_name: displayName,
      class: cls,
      discord_handle: discordHandle || null,
      vehicle: vehicle || null,
      status: 'registered',
    };

    const { data, error } = await supabase.from('clash_participants').insert(insertRow).select().maybeSingle();
    if (error) return json({ ok: false, error: error.message }, 400);

    return json({
      ok: true,
      data: {
        participant_id: data.id,
        driver_id: data.driver_id ? (codeByUuid[data.driver_id] || data.driver_id) : '',
        display_name: data.display_name,
        class: data.class,
        vehicle: data.vehicle || '',
        discord_handle: data.discord_handle || '',
        registered_at: data.registered_at,
        status: data.status,
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
