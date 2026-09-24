// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — incidents.resolve (v3 — form nativo in-app, #351)
// ═══════════════════════════════════════════════════════════
// AdminIncidents.jsx (handleSave) manda `complaint_key` (mai
// `report_id`) e `penalized_driver_id` come driver_code (da
// incidents-list, coerente col resto del progetto) — risolto qui a
// uuid prima dell'upsert, stesso principio #333.
//
// v3 (24/09/2026): aggiunto fallback token legacy — stesso gap
// ricorrente #331/#358/#359/#392 (nessuno staff reale ha mai una
// sessione Supabase autentica, solo il token legacy Discord OAuth via
// Apps Script). Senza questo fallback, NESSUN membro reale dello
// staff poteva formalizzare una segnalazione: ogni salvataggio in
// AdminIncidents.jsx falliva con 401 "Auth richiesto" silenzioso.
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

const VALID_STATUSES = ['open', 'reviewing', 'closed'];

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
          .select('id, team_id, role')
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
      return json({ ok: false, error: 'Accesso riservato allo staff' }, 403);
    }

    const reportId = payload?.complaint_key ? String(payload.complaint_key) : '';
    const status = payload?.status ? String(payload.status) : '';
    if (!reportId) return json({ ok: false, error: 'complaint_key obbligatorio' }, 400);
    if (!VALID_STATUSES.includes(status)) {
      return json({ ok: false, error: 'status non valido — atteso uno tra: ' + VALID_STATUSES.join(', ') }, 400);
    }

    const { data: report, error: reportErr } = await supabase
      .from('incident_reports')
      .select('id')
      .eq('id', reportId)
      .eq('team_id', me.team_id)
      .maybeSingle();
    if (reportErr) return json({ ok: false, error: reportErr.message }, 400);
    if (!report) return json({ ok: false, error: 'Segnalazione non trovata: ' + reportId }, 404);

    let penalizedDriverId: string | null = null;
    const penalizedCode = payload?.penalized_driver_id ? String(payload.penalized_driver_id).trim() : '';
    if (penalizedCode) {
      const { data: penalized, error: penErr } = await supabase
        .from('drivers')
        .select('id')
        .eq('driver_code', penalizedCode)
        .eq('team_id', me.team_id)
        .maybeSingle();
      if (penErr) return json({ ok: false, error: penErr.message }, 400);
      if (!penalized) return json({ ok: false, error: 'penalized_driver_id non trovato nel roster: ' + penalizedCode }, 400);
      penalizedDriverId = penalized.id;
    }

    const now = new Date().toISOString();
    const row = {
      team_id: me.team_id,
      report_id: reportId,
      status,
      penalty_type: payload?.penalty_type ? String(payload.penalty_type) : null,
      penalty_detail: payload?.penalty_detail ? String(payload.penalty_detail) : null,
      staff_notes: payload?.staff_notes ? String(payload.staff_notes) : null,
      resolved_by: me.id,
      resolved_at: now,
      evidence_url: payload?.evidence_url ? String(payload.evidence_url).trim().slice(0, 500) : null,
      sim: payload?.sim ? String(payload.sim) : null,
      penalized_driver_id: penalizedDriverId,
    };

    const { data, error } = await supabase
      .from('incident_resolutions')
      .upsert(row, { onConflict: 'report_id' })
      .select()
      .maybeSingle();
    if (error) return json({ ok: false, error: error.message }, 400);

    return json({ ok: true, data: { complaint_key: reportId, status: data.status, resolved_at: data.resolved_at } });
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
