// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — clash.participants.update (porting fedele di
// apps-script/ClashOfClasses.js, handleClashParticipantsUpdate)
// ═══════════════════════════════════════════════════════════
// Auth: staff/admin. Cambio classe senza vehicle nello stesso payload
// e vecchia vettura non più ammessa nella nuova classe → vehicle
// azzerato (fedele al sorgente). Output aliasato a driver_code (#333).
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

    const participantId = payload?.participant_id ? String(payload.participant_id).trim() : '';
    if (!participantId) return json({ ok: false, error: 'participant_id obbligatorio' }, 400);

    const { data: row, error: rowErr } = await supabase
      .from('clash_participants')
      .select('*')
      .eq('id', participantId)
      .eq('team_id', me.team_id)
      .maybeSingle();
    if (rowErr) return json({ ok: false, error: rowErr.message }, 400);
    if (!row) return json({ ok: false, error: 'Iscritto non trovato: ' + participantId }, 404);

    const updates: Record<string, unknown> = {};
    let targetClass = row.class;

    if (payload.class !== undefined) {
      const cls = String(payload.class || '').trim().toUpperCase();
      if (CLASH_VALID_CLASSES.indexOf(cls) === -1) {
        return json({ ok: false, error: 'Classe non valida. Ammesse: ' + CLASH_VALID_CLASSES.join(', ') }, 400);
      }
      updates.class = cls;
      targetClass = cls;
      if (payload.vehicle === undefined && row.vehicle) {
        const stillValid = (CLASH_VEHICLES_BY_CLASS[cls] || []).indexOf(row.vehicle) !== -1;
        if (!stillValid) updates.vehicle = null;
      }
    }
    if (payload.vehicle !== undefined) {
      const vehicleCheck = validateVehicle(payload.vehicle, targetClass);
      if (!vehicleCheck.ok) return json({ ok: false, error: vehicleCheck.error }, 400);
      updates.vehicle = vehicleCheck.value || null;
    }
    if (payload.display_name !== undefined) {
      const name = String(payload.display_name || '').trim();
      if (!name) return json({ ok: false, error: 'display_name non può essere vuoto' }, 400);
      updates.display_name = name;
    }
    if (payload.discord_handle !== undefined) {
      updates.discord_handle = String(payload.discord_handle || '').trim() || null;
    }

    const { data, error } = await supabase
      .from('clash_participants')
      .update(updates)
      .eq('id', participantId)
      .eq('team_id', me.team_id)
      .select()
      .maybeSingle();
    if (error) return json({ ok: false, error: error.message }, 400);

    let driverCode = '';
    if (data.driver_id) {
      const { data: d } = await supabase.from('drivers').select('driver_code').eq('id', data.driver_id).maybeSingle();
      driverCode = d?.driver_code || '';
    }

    return json({
      ok: true,
      data: {
        participant_id: data.id,
        display_name: data.display_name,
        class: data.class,
        vehicle: data.vehicle || '',
        discord_handle: data.discord_handle || '',
        driver_id: driverCode,
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
