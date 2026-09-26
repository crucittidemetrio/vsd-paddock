// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — standings.byDriver (porting fedele di
// apps-script/Standings.js, handleStandingsByDriver)
// ═══════════════════════════════════════════════════════════
// Campionati disputati da un pilota VSD: cerca il driver in ogni
// campionato (standings_json via matchDriverNameStrict_, o
// race_results quando non c'è JSON) e ritorna le partecipazioni con
// posizione, punti, classe. Auth: qualsiasi membro del team.
//
// FIX (#332, stesso pattern di best-laps-list in #331): payload.driver_id
// nel contratto pubblico è sempre driver_code (VSD00X), mai l'uuid
// interno. v1 faceva `.eq('id', driverId)` assumendo già un uuid —
// rotto per ogni chiamata reale (DriverProfile.jsx/Compare.jsx passano
// sempre il driver_code da route param). Ora si risolve driver_code
// → uuid interno subito dopo l'auth, e si usa l'uuid per tutte le
// query/confronti interni; l'output torna a esporre driver_code.
//
// FIX (26/09/2026, trovato verificando dal vivo il fix gemello su
// standings-by-championship, segnalato da Demetrio — "Auth richiesto"
// aprendo /championships/:id): questo file NON esisteva nel repo git
// locale (drift — solo il deploy live lo aveva), e come
// standings-by-championship non aveva MAI ricevuto il fallback sul
// token legacy nonostante lo stesso identico giro di cutover (#332)
// lo avesse già dato a championships-list/race-results-list/
// academy-ranking/season-recap. Stesso fallback identico, più lo
// scoping team_id esplicito sulla query `championships` (prima non
// filtrata per team — innocuo oggi con un solo team reale, ma
// scorretto in principio quando si usa il client service-role, che
// bypassa la RLS che altrimenti farebbe questo scoping da sola).
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

function matchDriverNameStrict(externalName: unknown, matchMap: Record<string, string>): string | null {
  if (!externalName) return null;
  const name = String(externalName).toLowerCase().trim();
  return matchMap[name] || null;
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

    const driverCodeParam = payload?.driver_id ? String(payload.driver_id).trim() : '';
    if (!driverCodeParam) return json({ ok: false, error: 'driver_id mancante' }, 400);

    // Risolve driver_code (contratto pubblico) → uuid interno, usato per
    // tutte le query/confronti sotto.
    const { data: driver, error: driverErr } = await supabase
      .from('drivers')
      .select('id, driver_code, display_name')
      .eq('driver_code', driverCodeParam)
      .eq('team_id', me.team_id)
      .maybeSingle();
    if (driverErr) return json({ ok: false, error: driverErr.message }, 400);
    if (!driver) return json({ ok: false, error: 'Driver non trovato: ' + driverCodeParam }, 404);
    const driverId = driver.id;

    const { data: teamDrivers, error: driversErr } = await supabase
      .from('drivers')
      .select('id, display_name, real_name')
      .eq('team_id', me.team_id);
    if (driversErr) return json({ ok: false, error: driversErr.message }, 400);
    const nameMap: Record<string, string> = {};
    (teamDrivers ?? []).forEach((d: any) => {
      if (d.display_name) { const k = String(d.display_name).toLowerCase().trim(); if (!nameMap[k]) nameMap[k] = d.id; }
      if (d.real_name) { const k = String(d.real_name).toLowerCase().trim(); if (!nameMap[k]) nameMap[k] = d.id; }
    });

    const { data: championships, error: champsErr } = await supabase
      .from('championships')
      .select('*')
      .eq('team_id', me.team_id);
    if (champsErr) return json({ ok: false, error: champsErr.message }, 400);

    const { data: allRaces, error: racesErr } = await supabase
      .from('races')
      .select('race_id, championship_id, event_type')
      .not('championship_id', 'is', null)
      .eq('event_type', 'championship');
    if (racesErr) return json({ ok: false, error: racesErr.message }, 400);

    const champRaceIds: Record<string, string[]> = {};
    (allRaces ?? []).forEach((r: any) => {
      if (!champRaceIds[r.championship_id]) champRaceIds[r.championship_id] = [];
      champRaceIds[r.championship_id].push(r.race_id);
    });

    const allChampRaceIds = Object.values(champRaceIds).flat();
    let driverResults: any[] = [];
    if (allChampRaceIds.length > 0) {
      const { data: results, error: resErr } = await supabase
        .from('race_results')
        .select('race_id, finish_position, dnf, dns')
        .eq('is_vsd_driver', true)
        .eq('driver_id', driverId)
        .eq('session_type', 'race')
        .in('race_id', allChampRaceIds);
      if (resErr) return json({ ok: false, error: resErr.message }, 400);
      driverResults = results ?? [];
    }

    const resultsByRaceId: Record<string, any[]> = {};
    driverResults.forEach((r: any) => {
      if (!resultsByRaceId[r.race_id]) resultsByRaceId[r.race_id] = [];
      resultsByRaceId[r.race_id].push(r);
    });

    // Per il percorso "computed" serve anche il totale punti/classe di
    // TUTTI i risultati del pilota in quelle gare (non solo il finish),
    // quindi una seconda lettura con car_class + point_total incluse.
    let driverResultsFull: any[] = [];
    if (allChampRaceIds.length > 0) {
      const { data: resultsFull, error: resFullErr } = await supabase
        .from('race_results')
        .select('race_id, car_class, finish_position, dnf, dns, point_total')
        .eq('is_vsd_driver', true)
        .eq('driver_id', driverId)
        .eq('session_type', 'race')
        .in('race_id', allChampRaceIds);
      if (resFullErr) return json({ ok: false, error: resFullErr.message }, 400);
      driverResultsFull = resultsFull ?? [];
    }
    const fullByRaceId: Record<string, any[]> = {};
    driverResultsFull.forEach((r: any) => {
      if (!fullByRaceId[r.race_id]) fullByRaceId[r.race_id] = [];
      fullByRaceId[r.race_id].push(r);
    });

    const participations: any[] = [];

    (championships ?? []).forEach((chmp: any) => {
      if (!chmp.id) return;
      const raceIds = champRaceIds[chmp.id] || [];
      const storedJson = chmp.standings_json;

      if (storedJson) {
        if (!Array.isArray(storedJson)) return;
        storedJson.forEach((classGroup: any) => {
          const standings = classGroup.standings || [];
          standings.forEach((s: any) => {
            const matchedId = matchDriverNameStrict(s.id, nameMap);
            if (matchedId !== driverId) return;

            let champResults: any[] = [];
            raceIds.forEach((rid) => { if (resultsByRaceId[rid]) champResults = champResults.concat(resultsByRaceId[rid]); });

            let races_count = 0, wins = 0, podiums = 0;
            champResults.forEach((r: any) => {
              const isDns = !!r.dns;
              const isDnf = !!r.dnf;
              const pos = Number(r.finish_position);
              if (isDns) return;
              races_count++;
              if (isDnf) return;
              if (pos === 1) wins++;
              if (pos <= 3) podiums++;
            });

            participations.push({
              championship_id: chmp.id,
              championship_name: chmp.name,
              sim: chmp.sim,
              season: chmp.season,
              status: chmp.status,
              format: chmp.format || '',
              banner_url: chmp.banner_url || '',
              class_name: String(classGroup.carClass || 'Unknown'),
              position: Number(s.position) || null,
              total_points: Number(s.actualPoints) || Number(s.championshipScore) || 0,
              races_count, wins, podiums,
              source: 'standings_json',
            });
          });
        });
      } else if (raceIds.length > 0) {
        let champResults: any[] = [];
        raceIds.forEach((rid) => { if (fullByRaceId[rid]) champResults = champResults.concat(fullByRaceId[rid]); });
        if (champResults.length === 0) return;

        const classTotals: Record<string, any> = {};
        champResults.forEach((r: any) => {
          const cls = r.car_class || 'Unknown';
          if (!classTotals[cls]) classTotals[cls] = { points: 0, races_count: 0, wins: 0, podiums: 0 };
          const isDns = !!r.dns;
          const isDnf = !!r.dnf;
          const pos = Number(r.finish_position);
          if (isDns) return;
          classTotals[cls].races_count++;
          classTotals[cls].points += Number(r.point_total) || 0;
          if (isDnf) return;
          if (pos === 1) classTotals[cls].wins++;
          if (pos <= 3) classTotals[cls].podiums++;
        });

        Object.keys(classTotals).forEach((cls) => {
          const stats = classTotals[cls];
          participations.push({
            championship_id: chmp.id,
            championship_name: chmp.name,
            sim: chmp.sim,
            season: chmp.season,
            status: chmp.status,
            format: chmp.format || '',
            banner_url: chmp.banner_url || '',
            class_name: cls,
            position: null,
            total_points: stats.points,
            races_count: stats.races_count,
            wins: stats.wins,
            podiums: stats.podiums,
            source: 'computed',
          });
        });
      }
    });

    const statusOrder: Record<string, number> = { completed: 0, active: 1, upcoming: 2, draft: 3 };
    participations.sort((a, b) => {
      const ao = statusOrder[a.status] !== undefined ? statusOrder[a.status] : 4;
      const bo = statusOrder[b.status] !== undefined ? statusOrder[b.status] : 4;
      if (ao !== bo) return ao - bo;
      return String(b.season).localeCompare(String(a.season));
    });

    return json({ ok: true, data: { driver_id: driver.driver_code, participations } });
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
