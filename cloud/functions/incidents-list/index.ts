// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — incidents.list (v4 — sistema unificato)
// ═══════════════════════════════════════════════════════════
// FIX CRITICO (24/09/2026, trovato validando la richiesta di
// unificazione di Demetrio): questa funzione era rimasta ferma al
// contratto v1/pre-#351 (report_id, against_name_external, nessun
// reporter_sim/against/complaint_key), mentre incidents-report e
// incidents-resolve erano già stati aggiornati al v2/v3 (complaint_key,
// reporter_sim, against — vedi note in quei file). AdminIncidents.jsx
// si aspetta da sempre complaint_key/reporter_sim/against/championship/
// track: con questo contratto vecchio li riceveva sempre undefined,
// e la risoluzione (handleSave invia `complaint_key: inc.complaint_key`)
// falliva silenziosamente con "complaint_key obbligatorio" — NESSUNA
// segnalazione era risolvibile dallo staff, bug mai notato perché il
// registro sembrava comunque "funzionare" (mostrava le card, solo con
// campi vuoti al posto di segnalante/segnalato).
//
// v4: contratto allineato a reporter-report/resolve + nuovi campi
// dell'unificazione (race_id, clash_round, source, replay_url,
// reporter_discord). `championship`/`track` restano gli ID grezzi
// (championship_id/track_id) — la UI admin già lo trattava come label
// diretta prima del drift, e risolvere il nome reale richiederebbe un
// secondo giro di query non essenziale per il flusso di risoluzione.
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Fallback token legacy (stesso pattern #331/#358/#359).
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

    let usingLegacyFallback = false;
    if (!me) {
      const legacyServiceClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const legacyMe = await resolveLegacyDriver(legacyServiceClient, payload?.legacy_token);
      if (legacyMe) {
        me = legacyMe;
        supabase = legacyServiceClient;
        usingLegacyFallback = true;
      }
    }

    if (!me) return json({ ok: false, error: 'Auth richiesto' }, 401);

    const statusFilter = payload?.status ? String(payload.status) : null;
    const isStaff = me.role === 'staff' || me.role === 'admin';

    // Con client service-role (fallback legacy) la RLS è bypassata:
    // replichiamo qui esplicitamente lo stesso scoping che la RLS
    // applicherebbe con una sessione reale (staff/admin: tutto il team;
    // pilota: solo le proprie segnalazioni, come segnalante o segnalato).
    let reportsQuery = supabase.from('incident_reports').select('*').eq('team_id', me.team_id);
    if (usingLegacyFallback && !isStaff) {
      reportsQuery = reportsQuery.or(`reporter_driver_id.eq.${me.id},against_driver_id.eq.${me.id}`);
    }
    const { data: reports, error: reportsErr } = await reportsQuery;
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
        complaint_key: rep.id,
        created_at: rep.created_at,
        reporter_driver_id: rep.reporter_driver_id,
        reporter_sim: rep.reporter_sim,
        reporter_discord: rep.reporter_discord,
        against_driver_id: rep.against_driver_id,
        against: rep.against,
        race_date: rep.race_date,
        track: rep.track_id,
        lap: rep.lap,
        time_in_race: rep.time_in_race,
        incident_type: rep.incident_type,
        description: rep.description,
        championship: rep.championship_id,
        race_id: rep.race_id,
        clash_round: rep.clash_round,
        replay_url: rep.replay_url,
        source: rep.source,
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
      // staff_notes: deliberazione interna, visibile SOLO a staff/admin.
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
