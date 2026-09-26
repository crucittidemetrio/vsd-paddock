// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — standings.progression (porting fedele di
// apps-script/Standings.js, handleStandingsProgression)
// ═══════════════════════════════════════════════════════════
// Ricostruita SEMPRE da race_results.point_total, mai da
// standings_json (il JSON LMU porta solo posizione/dns/dnf per
// round, non i punti di quel round). L'asse X è la singola GARA
// (non il round): un round endurance con Race 1 + Race 2 produce
// due punti distinti in sequenza.
// payload: { championship_id, class_name? } — se class_name è
// omesso, usa la classe con più risultati registrati.
//
// FIX (#332, stesso pattern di best-laps-list in #331): driver_id nel
// contratto pubblico è sempre driver_code (VSD00X), mai l'uuid interno
// (colonna race_results.driver_id). v1 esponeva l'uuid raw in
// series[].driver_id — nessun consumer lo usa ancora direttamente ma
// per coerenza col resto del dominio (#329-331) va allineato ora.
//
// FIX (26/09/2026, trovato verificando dal vivo il fix gemello su
// standings-by-championship, segnalato da Demetrio — "Auth richiesto"
// aprendo /championships/:id): questo file NON esisteva nel repo git
// locale (drift — solo il deploy live lo aveva), e come
// standings-by-championship non aveva MAI ricevuto il fallback sul
// token legacy nonostante lo stesso identico giro di cutover (#332)
// lo avesse già dato a championships-list/race-results-list/
// academy-ranking/season-recap. Stesso fallback identico, più lo
// scoping team_id esplicito richiesto quando si usa il client
// service-role (RLS bypassata).
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
          .select('id, team_id')
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

    const championshipId = payload?.championship_id ? String(payload.championship_id) : '';
    if (!championshipId) return json({ ok: false, error: 'championship_id mancante' }, 400);

    const { data: championship, error: champErr } = await supabase
      .from('championships')
      .select('*')
      .eq('id', championshipId)
      .eq('team_id', me.team_id)
      .maybeSingle();
    if (champErr) return json({ ok: false, error: champErr.message }, 400);
    if (!championship) return json({ ok: false, error: 'Campionato non trovato: ' + championshipId }, 404);

    const { data: allRaces, error: racesErr } = await supabase
      .from('races')
      .select('race_id, race_name, round, race_number, date')
      .eq('championship_id', championshipId)
      .eq('event_type', 'championship');
    if (racesErr) return json({ ok: false, error: racesErr.message }, 400);

    const roundsSorted = (allRaces ?? [])
      .slice()
      .sort((a: any, b: any) => {
        const ar = Number(a.round) || 999;
        const br = Number(b.round) || 999;
        if (ar !== br) return ar - br;
        const an = Number(a.race_number) || 1;
        const bn = Number(b.race_number) || 1;
        if (an !== bn) return an - bn;
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      });

    const rounds = roundsSorted.map((r: any, i: number) => {
      const round = Number(r.round) || null;
      const raceNumber = Number(r.race_number) || 1;
      return {
        index: i,
        race_id: r.race_id,
        race_name: r.race_name,
        round,
        race_number: raceNumber,
        date: r.date,
        label: round ? `R${round}${raceNumber > 1 ? '.' + raceNumber : ''}` : r.race_id,
      };
    });

    if (rounds.length === 0) {
      return json({ ok: true, data: { championship, class_name: null, rounds: [], series: [] } });
    }

    const raceIndexById: Record<string, number> = {};
    rounds.forEach((r) => { raceIndexById[r.race_id] = r.index; });

    const { data: allResults, error: resErr } = await supabase
      .from('race_results')
      .select('race_id, session_type, car_class, driver_id, driver_name_external, is_vsd_driver, dns, point_total')
      .in('race_id', Object.keys(raceIndexById));
    if (resErr) return json({ ok: false, error: resErr.message }, 400);
    const relevant = (allResults ?? []).filter((r: any) => r.session_type === 'race');

    let className = payload?.class_name ? String(payload.class_name) : null;
    if (!className) {
      const counts: Record<string, number> = {};
      relevant.forEach((r: any) => { const cls = r.car_class || 'Unknown'; counts[cls] = (counts[cls] || 0) + 1; });
      className = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || null;
    }
    const classResults = className ? relevant.filter((r: any) => (r.car_class || 'Unknown') === className) : relevant;

    const { data: teamDrivers, error: driversErr } = await supabase
      .from('drivers')
      .select('id, driver_code, display_name')
      .eq('team_id', me.team_id);
    if (driversErr) return json({ ok: false, error: driversErr.message }, 400);
    const driverMap: Record<string, any> = {};
    (teamDrivers ?? []).forEach((d: any) => { driverMap[d.id] = d; });

    const byDriver: Record<string, any> = {};
    classResults.forEach((r: any) => {
      const isVsd = !!r.is_vsd_driver;
      const driverKey = isVsd ? r.driver_id : (r.driver_name_external || 'UNKNOWN');
      if (!byDriver[driverKey]) {
        const driverInfo = isVsd ? driverMap[driverKey] : null;
        byDriver[driverKey] = {
          driver_id: isVsd ? (driverInfo?.driver_code || '') : '',
          display_name: driverInfo ? driverInfo.display_name : (r.driver_name_external || driverKey),
          is_vsd: isVsd,
          pointsByRaceIndex: {} as Record<number, number>,
        };
      }
      if (r.dns) return;
      const idx = raceIndexById[r.race_id];
      const pts = Number(r.point_total) || 0;
      byDriver[driverKey].pointsByRaceIndex[idx] = (byDriver[driverKey].pointsByRaceIndex[idx] || 0) + pts;
    });

    const series = Object.values(byDriver)
      .map((d: any) => {
        let cum = 0;
        const points = rounds.map((r) => { cum += (d.pointsByRaceIndex[r.index] || 0); return cum; });
        return { driver_id: d.driver_id, display_name: d.display_name, is_vsd: d.is_vsd, total: cum, points };
      })
      .sort((a: any, b: any) => b.total - a.total);

    return json({
      ok: true,
      data: {
        championship,
        class_name: className,
        rounds: rounds.map((r) => ({ race_id: r.race_id, label: r.label, round: r.round, race_number: r.race_number, date: r.date })),
        series,
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
