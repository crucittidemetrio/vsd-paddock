// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — skillIndex.snapshot
// ═══════════════════════════════════════════════════════════
// Sostituisce runSkillIndexSnapshot (trigger settimanale Apps Script):
// calcolo on-demand, staff/admin. Upsert idempotente per
// (team_id, driver_id, snapshot_date). Stessa formula di skill-index-list.
//
// #469 (07/10/2026): sorgente recuperato dal deploy live (v15) e
// versionato. Aggiunti fallback token legacy e paginazione >1000 righe.
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// #468 — risoluzione chiamante: sessione Supabase OPPURE token legacy
// (Apps Script auth.verify). Nessun pilota reale ha una sessione Supabase:
// senza il ramo legacy queste funzioni rispondevano sempre "Auth richiesto".
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

async function resolveCaller(req: Request, payload: any): Promise<{ client: any; driverId: string; teamId: string; role: string } | null> {
  const url = Deno.env.get('SUPABASE_URL')!;
  const authHeader = req.headers.get('Authorization');
  if (authHeader) {
    const uc = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await uc.auth.getUser();
    if (user) {
      const { data: d } = await uc.from('drivers').select('id, team_id, role').eq('auth_user_id', user.id).maybeSingle();
      if (d) return { client: uc, driverId: d.id, teamId: d.team_id, role: d.role };
    }
  }
  const sc = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const lg = await resolveLegacyDriver(sc, payload?.legacy_token);
  if (lg) return { client: sc, driverId: lg.id, teamId: lg.team_id, role: lg.role };
  return null;
}


// #468: PostgREST tronca le select a 1000 righe (max_rows). race_results
// è già a ~900 righe: senza paginazione i calcoli perderebbero dati in
// silenzio. factory() deve ricostruire la query a ogni pagina.
async function fetchAllRows(factory: () => any): Promise<{ data: any[] | null; error: any }> {
  const PAGE = 1000;
  const out: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await factory().range(from, from + PAGE - 1);
    if (error) return { data: null, error };
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return { data: out, error: null };
}


const SKILL_INDEX_MIN_RACES = 3;
const SKILL_INDEX_RECENT_N = 15;
const SKILL_INDEX_INCIDENT_CAP = 3;
const SKILL_INDEX_WEIGHTS = { finishPct: 0.55, podiumRate: 0.25, incidentFactor: 0.20 };

function computeFieldSizes(results: any[]): Record<string, number> {
  const sizes: Record<string, number> = {};
  results.forEach((r: any) => {
    if (r.session_type !== 'race') return;
    const key = r.race_id + '__' + r.car_class;
    sizes[key] = (sizes[key] || 0) + 1;
  });
  return sizes;
}

function computeDriverSkill(driverId: string, results: any[], fieldSizes: Record<string, number>) {
  const races = results
    .filter((r: any) => r.driver_id === driverId && r.session_type === 'race' && !r.dns)
    .sort((a: any, b: any) => String(b.set_date || b.imported_at || '').localeCompare(String(a.set_date || a.imported_at || '')))
    .slice(0, SKILL_INDEX_RECENT_N);

  if (races.length < SKILL_INDEX_MIN_RACES) return null;

  let finishPctSum = 0, finishPctCount = 0, podiums = 0, incidentsSum = 0, incidentsKnown = 0;

  races.forEach((r: any) => {
    const pos = Number(r.finish_position);
    const fieldSize = fieldSizes[r.race_id + '__' + r.car_class] || 0;
    if (!isNaN(pos) && pos > 0 && fieldSize >= 3) {
      const pct = 1 - (pos - 1) / (fieldSize - 1);
      finishPctSum += Math.max(0, Math.min(1, pct));
      finishPctCount++;
      if (pos <= 3) podiums++;
    }
    if (r.incidents !== '' && r.incidents != null && !isNaN(Number(r.incidents))) {
      incidentsSum += Number(r.incidents);
      incidentsKnown++;
    }
  });

  if (finishPctCount === 0) return null;

  const avgFinishPct = finishPctSum / finishPctCount;
  const podiumRate = podiums / finishPctCount;
  const avgIncidents = incidentsKnown > 0 ? incidentsSum / incidentsKnown : 0;
  const incidentPenalty = Math.max(0, Math.min(1, avgIncidents / SKILL_INDEX_INCIDENT_CAP));

  const score = SKILL_INDEX_WEIGHTS.finishPct * avgFinishPct + SKILL_INDEX_WEIGHTS.podiumRate * podiumRate + SKILL_INDEX_WEIGHTS.incidentFactor * (1 - incidentPenalty);

  return {
    driver_id: driverId,
    score: Math.round(score * 100),
    races_counted: finishPctCount,
    avg_finish_pct: Math.round(avgFinishPct * 100),
    podium_rate: Math.round(podiumRate * 100),
    avg_incidents: incidentsKnown > 0 ? Math.round(avgIncidents * 10) / 10 : null,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const payload = await req.json().catch(() => ({}));
    const caller = await resolveCaller(req, payload);
    if (!caller) return json({ ok: false, error: 'Auth richiesto' }, 401);
    if (caller.role !== 'staff' && caller.role !== 'admin') {
      return json({ ok: false, error: 'Forbidden: solo staff o admin può registrare uno snapshot' }, 403);
    }
    const supabase = caller.client;

    const { data: allResults, error: resErr } = await fetchAllRows(() => supabase
      .from('race_results')
      .select('result_id, race_id, car_class, session_type, driver_id, finish_position, incidents, set_date, imported_at, dns')
      .eq('team_id', caller.teamId)
      .order('result_id', { ascending: true }));
    if (resErr) return json({ ok: false, error: resErr.message }, 400);
    const results = allResults ?? [];
    const fieldSizes = computeFieldSizes(results);

    const { data: drivers, error: driversErr } = await supabase
      .from('drivers')
      .select('id')
      .eq('team_id', caller.teamId)
      .eq('status', 'active')
      .is('removed_at', null);
    if (driversErr) return json({ ok: false, error: driversErr.message }, 400);

    const today = new Date().toISOString().slice(0, 10);
    const rows: Record<string, unknown>[] = [];
    (drivers ?? []).forEach((d: any) => {
      const skill = computeDriverSkill(d.id, results, fieldSizes);
      if (!skill) return;
      rows.push({
        team_id: caller.teamId,
        driver_id: d.id,
        score: skill.score,
        races_counted: skill.races_counted,
        avg_finish_pct: skill.avg_finish_pct,
        podium_rate: skill.podium_rate,
        avg_incidents: skill.avg_incidents,
        snapshot_date: today,
      });
    });

    if (rows.length === 0) {
      return json({ ok: true, data: { created: 0 } });
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('skill_index_history')
      .upsert(rows, { onConflict: 'team_id,driver_id,snapshot_date', ignoreDuplicates: false })
      .select();
    if (insertErr) return json({ ok: false, error: insertErr.message }, 400);

    return json({ ok: true, data: { created: inserted?.length ?? rows.length } });
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
