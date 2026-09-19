// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — incidents.resolve (porting fedele di
// apps-script/Incidents.js, handleIncidentsResolve)
// ═══════════════════════════════════════════════════════════
// Auth: staff/admin. Upsert per report_id (un solo record di
// risoluzione per segnalazione, unique constraint su report_id).
//
// evidence_url: link opzionale a una clip usata come prova — VISIBILE
// anche ai piloti coinvolti (non solo staff), diversamente da
// staff_notes che è nota interna. sim/penalized_driver_id alimentano
// una futura Fase Punti Penalità (non ancora portata) — opzionali,
// se assenti l'incidente non contribuisce a nessun calcolo.
//
// logAudit_() e le notifiche Discord (notifyIncidentResolved_,
// notifyIncidentResolvedPush_) del sorgente reale NON sono portate
// qui — dipendono da domini non ancora portati (AuditLog/Discord/Push,
// Fase 3 #256). Gap noto e documentato, non una svista.
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const VALID_STATUSES = ['open', 'reviewing', 'closed'];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ ok: false, error: 'Auth richiesto' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) return json({ ok: false, error: 'Auth richiesto' }, 401);

    const payload = await req.json().catch(() => ({}));
    const reportId = payload?.report_id ? String(payload.report_id) : '';
    const status = payload?.status ? String(payload.status) : '';
    if (!reportId) return json({ ok: false, error: 'report_id obbligatorio' }, 400);
    if (!VALID_STATUSES.includes(status)) {
      return json({ ok: false, error: 'status non valido — atteso uno tra: ' + VALID_STATUSES.join(', ') }, 400);
    }

    const { data: me, error: meErr } = await supabase
      .from('drivers')
      .select('id, team_id, role')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (meErr) return json({ ok: false, error: meErr.message }, 400);
    if (!me) return json({ ok: false, error: 'Driver non collegato a questo account' }, 404);
    if (me.role !== 'staff' && me.role !== 'admin') {
      return json({ ok: false, error: 'Accesso riservato allo staff' }, 403);
    }

    const { data: report, error: reportErr } = await supabase
      .from('incident_reports')
      .select('id')
      .eq('id', reportId)
      .eq('team_id', me.team_id)
      .maybeSingle();
    if (reportErr) return json({ ok: false, error: reportErr.message }, 400);
    if (!report) return json({ ok: false, error: 'Segnalazione non trovata: ' + reportId }, 404);

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
      penalized_driver_id: payload?.penalized_driver_id ? String(payload.penalized_driver_id) : null,
    };

    const { data, error } = await supabase
      .from('incident_resolutions')
      .upsert(row, { onConflict: 'report_id' })
      .select()
      .maybeSingle();
    if (error) return json({ ok: false, error: error.message }, 400);

    return json({ ok: true, data: { resolution: data } });
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
