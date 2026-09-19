// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — incidents.list (porting ADATTATO di
// apps-script/Incidents.js, handleIncidentsList)
// ═══════════════════════════════════════════════════════════
// Unisce incident_reports con lo stato formalizzato in
// incident_resolutions. La RLS su incident_reports/incident_resolutions
// già limita le RIGHE visibili (staff/admin tutto, pilota solo le
// proprie) — qui replichiamo comunque l'oscuramento a livello di
// COLONNA di staff_notes per i non-staff, fedele al sorgente reale
// (RLS filtra righe, non colonne).
//
// A differenza del sorgente reale non esiste più un "verdetto storico"
// testuale libero (era una colonna del Google Form ora sostituito) —
// senza resolution una segnalazione è semplicemente 'open', niente
// derivazione closed-da-verdetto.
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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
    const statusFilter = payload?.status ? String(payload.status) : null;

    const { data: me, error: meErr } = await supabase
      .from('drivers')
      .select('role')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (meErr) return json({ ok: false, error: meErr.message }, 400);
    if (!me) return json({ ok: false, error: 'Driver non collegato a questo account' }, 404);
    const isStaff = me.role === 'staff' || me.role === 'admin';

    const { data: reports, error: reportsErr } = await supabase
      .from('incident_reports')
      .select('*'); // RLS: staff/admin tutto il team, pilota solo le proprie
    if (reportsErr) return json({ ok: false, error: reportsErr.message }, 400);

    const reportIds = (reports ?? []).map((r: any) => r.id);
    let resolutions: any[] = [];
    if (reportIds.length > 0) {
      const { data: resData, error: resErr } = await supabase
        .from('incident_resolutions')
        .select('*')
        .in('report_id', reportIds);
      if (resErr) return json({ ok: false, error: resErr.message }, 400);
      resolutions = resData ?? [];
    }
    const resByReportId: Record<string, any> = {};
    resolutions.forEach((r: any) => { resByReportId[r.report_id] = r; });

    let incidents = (reports ?? []).map((rep: any) => {
      const res = resByReportId[rep.id];
      const base: Record<string, unknown> = {
        report_id: rep.id,
        created_at: rep.created_at,
        reporter_driver_id: rep.reporter_driver_id,
        against_driver_id: rep.against_driver_id,
        against_name_external: rep.against_name_external,
        race_date: rep.race_date,
        track_id: rep.track_id,
        lap: rep.lap,
        time_in_race: rep.time_in_race,
        incident_type: rep.incident_type,
        description: rep.description,
        championship_id: rep.championship_id,
        status: res ? res.status : 'open',
        penalty_type: res ? res.penalty_type : null,
        penalty_detail: res ? res.penalty_detail : null,
        resolved_by: res ? res.resolved_by : null,
        resolved_at: res ? res.resolved_at : null,
        evidence_url: res ? res.evidence_url : null,
        sim: res ? res.sim : null,
        penalized_driver_id: res ? res.penalized_driver_id : null,
        formalized: !!res,
      };
      // staff_notes: deliberazione interna, visibile SOLO a staff/admin —
      // fedele al sorgente (dove veniva rimossa via destructuring per i piloti).
      if (isStaff) base.staff_notes = res ? res.staff_notes : null;
      return base;
    });

    if (statusFilter) incidents = incidents.filter((i: any) => i.status === statusFilter);

    incidents.sort((a: any, b: any) => {
      if (a.status === 'open' && b.status !== 'open') return -1;
      if (a.status !== 'open' && b.status === 'open') return 1;
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });

    return json({ ok: true, data: { incidents, count: incidents.length } });
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
