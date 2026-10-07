// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — clash.results.submitRound (porting fedele di
// apps-script/ClashOfClasses.js, handleClashResultsSubmitRound)
// ═══════════════════════════════════════════════════════════
// Auth: staff/admin. Idempotente per round: cancella le righe
// esistenti del round, poi inserisce le nuove (delete+insert, non
// transazionale — fedele al sorgente).
//
// #333: results[].driver_id è driver_code (VSD00X) nel contratto
// pubblico, ma clash_results.driver_id è uuid → risolto driver_code→uuid
// scoped al team prima dell'insert.
//
// #461 (07/10/2026): fallback legacy_token aggiunto (vedi
// clash-incidents-list) — senza, "Inserimento risultati" di Gestione
// evento dava "Auth richiesto" a qualunque staff reale.
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
const CLASH_VALID_ROUNDS = [1, 2, 3];

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

    const round = Number(payload?.round);
    if (CLASH_VALID_ROUNDS.indexOf(round) === -1) {
      return json({ ok: false, error: 'round non valido. Ammessi: ' + CLASH_VALID_ROUNDS.join(', ') }, 400);
    }

    const results = Array.isArray(payload?.results) ? payload.results : [];
    if (results.length === 0) return json({ ok: false, error: 'Nessun risultato da inserire' }, 400);

    const { data: teamDrivers, error: teamDriversErr } = await supabase
      .from('drivers')
      .select('id, driver_code')
      .eq('team_id', me.team_id);
    if (teamDriversErr) return json({ ok: false, error: teamDriversErr.message }, 400);
    const uuidByCode: Record<string, string> = {};
    (teamDrivers ?? []).forEach((d: any) => { if (d.driver_code) uuidByCode[d.driver_code] = d.id; });

    const resolvedDriverIds: (string | null)[] = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const cls = String((r && r.class) || '').trim().toUpperCase();
      if (CLASH_VALID_CLASSES.indexOf(cls) === -1) {
        return json({ ok: false, error: `Riga ${i + 1}: classe non valida ("${r && r.class}")` }, 400);
      }
      if (!r.display_name && !r.driver_id) {
        return json({ ok: false, error: `Riga ${i + 1}: driver_id o display_name mancante` }, 400);
      }
      const driverCode = r.driver_id ? String(r.driver_id).trim() : '';
      if (driverCode) {
        const resolved = uuidByCode[driverCode] || null;
        if (!resolved) return json({ ok: false, error: `Riga ${i + 1}: driver_id non trovato nel roster: ${driverCode}` }, 400);
        resolvedDriverIds.push(resolved);
      } else {
        resolvedDriverIds.push(null);
      }
    }

    const { error: delErr } = await supabase
      .from('clash_results')
      .delete()
      .eq('team_id', me.team_id)
      .eq('round', round);
    if (delErr) return json({ ok: false, error: delErr.message }, 400);

    const now = new Date().toISOString();
    const rows = results.map((r: any, i: number) => ({
      team_id: me.team_id,
      round,
      driver_id: resolvedDriverIds[i],
      display_name: r.display_name || '',
      class: String(r.class).trim().toUpperCase(),
      finish_position_class: r.finish_position_class != null ? Number(r.finish_position_class) : null,
      finish_position_overall: r.finish_position_overall != null ? Number(r.finish_position_overall) : null,
      pole_class: r.pole_class === true,
      fastest_lap_class: r.fastest_lap_class === true,
      finisher: r.finisher === true,
      dnf: r.dnf === true,
      entered_by: me.id,
      entered_at: now,
    }));

    const { data, error } = await supabase.from('clash_results').insert(rows).select();
    if (error) return json({ ok: false, error: error.message }, 400);

    return json({ ok: true, data: { round, inserted: (data ?? []).length } });
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
