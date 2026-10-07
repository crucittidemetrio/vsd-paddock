// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — clash.standings
// ═══════════════════════════════════════════════════════════
// Auth: NESSUNA richiesta. Pattern team_slug/service-role.
//
// #463 (07/10/2026): la classifica è ora DERIVATA dai risultati importati
// (race_results del campionato Clash, gli stessi della pagina generica
// del campionato) invece che da clash_results — dato inserito una volta.
//
//  - Punti-posizione: tabella regolamento sulla posizione di classe
//    (finish_position, già per classe in race_results).
//  - Giro veloce: il punto extra lo calcola SimGrid
//    (point_total - points_given + penalty_points) → letto, non ricalcolato.
//  - Bonus che SimGrid NON calcola, aggiunti qui:
//      · pole (+1): miglior tempo valido (>0) in qualifica della classe
//      · finisher (+1): non DNF, non DNS, almeno 1 giro in gara
//  - DNS: escluso dalla classifica (SimGrid gli assegna -2, non da regolamento).
//  - Posizione assoluta: ordine per giri (desc) poi tempo totale (asc),
//    tra tutti i classificati di entrambe le classi.
//  - Stagione: payload.championship_id oppure, in assenza, il campionato
//    attivo della serie 'clash-of-classes' (altrimenti il più recente).
//    Numero di round = numero di gare del campionato (varia per stagione).
//
// driver_id in uscita = driver_code (contratto pubblico, #333) se il
// pilota è nel roster, altrimenti ''.
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const CLASH_SERIES = 'clash-of-classes';
const CLASS_MAP: Record<string, 'GTE' | 'GT3'> = { LMGTE: 'GTE', GTE: 'GTE', LMGT3: 'GT3', GT3: 'GT3' };

const CLASH_POSITION_POINTS_TABLE: Record<number, number> = {
  1: 20, 2: 17, 3: 15, 4: 13, 5: 11,
  6: 10, 7: 9, 8: 8, 9: 7, 10: 6,
  11: 5, 12: 4, 13: 3, 14: 2,
};

function positionPoints(pos: unknown): number {
  const p = Number(pos);
  if (!p || p < 1) return 0;
  return CLASH_POSITION_POINTS_TABLE[p] !== undefined ? CLASH_POSITION_POINTS_TABLE[p] : 1;
}

function normName(raw: unknown): string {
  return String(raw || '')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\|.*$/, ' ')
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function titleCase(s: string): string {
  return s.replace(/(^|[\s'-])(\p{L})/gu, (_m, a, b) => a + b.toUpperCase());
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const payload = await req.json().catch(() => ({}));
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    let teamId: string | null = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user } } = await userClient.auth.getUser();
      if (user) {
        const { data: me } = await serviceClient
          .from('drivers')
          .select('team_id')
          .eq('auth_user_id', user.id)
          .maybeSingle();
        if (me) teamId = me.team_id;
      }
    }
    if (!teamId) {
      const teamSlug = payload?.team_slug ? String(payload.team_slug).trim() : '';
      if (!teamSlug) return json({ ok: false, error: 'team_slug obbligatorio per chiamate anonime' }, 400);
      const { data: team, error: teamErr } = await serviceClient
        .from('teams')
        .select('id')
        .eq('slug', teamSlug)
        .maybeSingle();
      if (teamErr) return json({ ok: false, error: teamErr.message }, 400);
      if (!team) return json({ ok: false, error: 'Team non trovato: ' + teamSlug }, 404);
      teamId = team.id;
    }

    // Stagione: richiesta esplicita o campionato attivo della serie
    const { data: champs, error: champsErr } = await serviceClient
      .from('championships')
      .select('id, name, season, status, start_date')
      .eq('team_id', teamId)
      .eq('series', CLASH_SERIES);
    if (champsErr) return json({ ok: false, error: champsErr.message }, 400);
    const requestedId = payload?.championship_id ? String(payload.championship_id) : '';
    const sortedChamps = (champs ?? []).slice().sort((a: any, b: any) =>
      String(b.start_date || '').localeCompare(String(a.start_date || '')));
    const championship = requestedId
      ? sortedChamps.find((c: any) => c.id === requestedId)
      : (sortedChamps.find((c: any) => c.status === 'active') || sortedChamps[0]);
    if (!championship) {
      return json({ ok: true, data: { gte: [], gt3: [], overall: [], trophy: emptyTrophy(0), championship: null } });
    }

    // Gare del campionato → round (ordine cronologico)
    const { data: races, error: racesErr } = await serviceClient
      .from('races')
      .select('race_id, date')
      .eq('team_id', teamId)
      .eq('championship_id', championship.id)
      .order('date', { ascending: true })
      .order('race_id', { ascending: true });
    if (racesErr) return json({ ok: false, error: racesErr.message }, 400);
    const roundByRace: Record<string, number> = {};
    (races ?? []).forEach((r: any, i: number) => { roundByRace[r.race_id] = i + 1; });
    const raceIds = Object.keys(roundByRace);
    const totalRounds = raceIds.length;
    const ROUNDS = Array.from({ length: totalRounds }, (_v, i) => i + 1);

    let rows: any[] = [];
    if (raceIds.length > 0) {
      const { data, error } = await serviceClient
        .from('race_results')
        .select('race_id, session_type, car_class, driver_id, driver_name_external, total_laps, best_lap_ms, total_time_ms, finish_position, points_given, penalty_points, point_total, dnf, dns')
        .eq('team_id', teamId)
        .in('race_id', raceIds);
      if (error) return json({ ok: false, error: error.message }, 400);
      rows = data ?? [];
    }

    const { data: teamDrivers, error: teamDriversErr } = await serviceClient
      .from('drivers')
      .select('id, driver_code, display_name')
      .eq('team_id', teamId);
    if (teamDriversErr) return json({ ok: false, error: teamDriversErr.message }, 400);
    const codeByUuid: Record<string, string> = {};
    (teamDrivers ?? []).forEach((d: any) => { if (d.driver_code) codeByUuid[d.id] = d.driver_code; });

    // Pole per (round, classe): miglior tempo valido in qualifica
    const poleKey: Record<string, string> = {};
    const poleBest: Record<string, number> = {};
    rows.forEach((r: any) => {
      if (r.session_type !== 'qualifying') return;
      const cls = CLASS_MAP[String(r.car_class || '').toUpperCase()];
      const lap = Number(r.best_lap_ms) || 0;
      if (!cls || lap <= 0) return;
      const k = roundByRace[r.race_id] + '|' + cls;
      if (poleBest[k] === undefined || lap < poleBest[k]) {
        poleBest[k] = lap;
        poleKey[k] = normName(r.driver_name_external);
      }
    });

    // Posizione assoluta per round: giri desc, tempo asc (solo non-DNS con giri)
    const raceRows = rows.filter((r: any) => r.session_type === 'race');
    const overallByRound: Record<number, Record<string, number>> = {};
    ROUNDS.forEach((rd) => {
      const list = raceRows
        .filter((r: any) => roundByRace[r.race_id] === rd && r.dns !== true && Number(r.total_laps) > 0)
        .sort((a: any, b: any) => {
          const dl = Number(b.total_laps) - Number(a.total_laps);
          if (dl !== 0) return dl;
          return (Number(a.total_time_ms) || Infinity) - (Number(b.total_time_ms) || Infinity);
        });
      overallByRound[rd] = {};
      list.forEach((r: any, i: number) => { overallByRound[rd][normName(r.driver_name_external)] = i + 1; });
    });

    const classAgg: Record<string, Record<string, any>> = { GTE: {}, GT3: {} };
    const overallAgg: Record<string, any> = {};
    const roundTotals: Record<number, { GTE: number; GT3: number }> = {};
    const classWins = { GTE: 0, GT3: 0 };
    const classPoles = { GTE: 0, GT3: 0 };

    raceRows.forEach((r: any) => {
      const round = roundByRace[r.race_id];
      const cls = CLASS_MAP[String(r.car_class || '').toUpperCase()];
      if (!cls || !round) return;
      if (r.dns === true) return; // non partito: fuori classifica

      const nameKey = normName(r.driver_name_external);
      if (!nameKey) return;
      const driverUuid: string = r.driver_id || '';
      const driverKey = driverUuid || nameKey;
      const displayName = titleCase(nameKey);

      const posClass = Number(r.finish_position) || null;
      const posOverall = overallByRound[round]?.[nameKey] ?? null;
      const isPole = poleKey[round + '|' + cls] === nameKey;
      const flBonus = (Number(r.point_total) || 0) - (Number(r.points_given) || 0) + (Number(r.penalty_points) || 0);
      const isFastestLap = flBonus >= 1;
      const isFinisher = r.dnf !== true && Number(r.total_laps) > 0;

      const classPts = positionPoints(posClass)
        + (isPole ? 1 : 0)
        + (isFastestLap ? 1 : 0)
        + (isFinisher ? 1 : 0);
      const overallPts = positionPoints(posOverall);

      const bucket = classAgg[cls];
      if (!bucket[driverKey]) {
        bucket[driverKey] = {
          driver_id: driverUuid, display_name: displayName, class: cls,
          total_points: 0, races_count: 0, wins: 0, podiums: 0, best_finish: null, poles: 0,
        };
      }
      const ce = bucket[driverKey];
      ce.total_points += classPts;
      ce.races_count += 1;
      if (posClass === 1) ce.wins += 1;
      if (posClass != null && posClass <= 3) ce.podiums += 1;
      if (posClass != null && (ce.best_finish === null || posClass < ce.best_finish)) ce.best_finish = posClass;
      if (isPole) ce.poles += 1;

      if (!overallAgg[driverKey]) {
        overallAgg[driverKey] = {
          driver_id: driverUuid, display_name: displayName, class: cls,
          total_points: 0, races_count: 0, wins: 0, podiums: 0, best_finish: null,
        };
      }
      const oe = overallAgg[driverKey];
      oe.total_points += overallPts;
      oe.races_count += 1;
      if (posOverall === 1) oe.wins += 1;
      if (posOverall != null && posOverall <= 3) oe.podiums += 1;
      if (posOverall != null && (oe.best_finish === null || posOverall < oe.best_finish)) oe.best_finish = posOverall;

      if (!roundTotals[round]) roundTotals[round] = { GTE: 0, GT3: 0 };
      roundTotals[round][cls] += classPts;
      if (posClass === 1) classWins[cls] += 1;
      if (isPole) classPoles[cls] += 1;
    });

    const aliasDriverId = (entry: any) => ({ ...entry, driver_id: entry.driver_id ? (codeByUuid[entry.driver_id] || '') : '' });

    const sortStandings = (list: any[]) => list.sort((a, b) => {
      if (b.total_points !== a.total_points) return b.total_points - a.total_points;
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.podiums !== a.podiums) return b.podiums - a.podiums;
      const aBest = a.best_finish == null ? 999 : a.best_finish;
      const bBest = b.best_finish == null ? 999 : b.best_finish;
      return aBest - bBest;
    }).map((r, i) => Object.assign({ position: i + 1 }, aliasDriverId(r)));

    const gte = sortStandings(Object.values(classAgg.GTE));
    const gt3 = sortStandings(Object.values(classAgg.GT3));
    const overall = sortStandings(Object.values(overallAgg));

    const byRound = ROUNDS
      .filter((rd) => roundTotals[rd])
      .map((rd) => ({ round: rd, GTE: roundTotals[rd].GTE, GT3: roundTotals[rd].GT3 }));

    const gteTotal = byRound.reduce((s, r) => s + r.GTE, 0);
    const gt3Total = byRound.reduce((s, r) => s + r.GT3, 0);

    let leadingClass: string | null = null;
    if (gteTotal !== gt3Total) {
      leadingClass = gteTotal > gt3Total ? 'GTE' : 'GT3';
    } else if (gteTotal > 0 || gt3Total > 0) {
      if (classWins.GTE !== classWins.GT3) {
        leadingClass = classWins.GTE > classWins.GT3 ? 'GTE' : 'GT3';
      } else if (classPoles.GTE !== classPoles.GT3) {
        leadingClass = classPoles.GTE > classPoles.GT3 ? 'GTE' : 'GT3';
      }
    }

    const trophy = {
      gte_total: gteTotal,
      gt3_total: gt3Total,
      by_round: byRound,
      class_wins: classWins,
      class_poles: classPoles,
      leading_class: leadingClass,
      rounds_total: totalRounds,
      decided: totalRounds > 0 && byRound.length >= totalRounds,
    };

    return json({
      ok: true,
      data: {
        gte, gt3, overall, trophy,
        championship: { id: championship.id, name: championship.name, season: championship.season, rounds_total: totalRounds },
      },
    });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});

function emptyTrophy(totalRounds: number) {
  return {
    gte_total: 0, gt3_total: 0, by_round: [], class_wins: { GTE: 0, GT3: 0 },
    class_poles: { GTE: 0, GT3: 0 }, leading_class: null, rounds_total: totalRounds, decided: false,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
