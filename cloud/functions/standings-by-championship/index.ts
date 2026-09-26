// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — standings.byChampionship (porting fedele di
// apps-script/Standings.js, handleStandingsByChampionship)
// ═══════════════════════════════════════════════════════════
// Sorgente:
//  - Se championships.standings_json è valorizzato → parsing JSON
//    LMU (autorevole), poi augmentato con statistiche per-gara da
//    race_results (modalità ibrida, mergeRaceStats_)
//  - Altrimenti → compute da race_results (fallback)
// In entrambi i casi, points_adjustments_json viene applicato sopra
// (applyAdjustments_) prima di ordinare/posizionare.
//
// standings_json/points_adjustments_json sono jsonb nativo qui (vedi
// 018_championships.sql) — niente JSON.parse/stringify espliciti
// come nel sorgente, il resto della logica è porting 1:1.
//
// matchDriverNameStrict_ (NO fuzzy, a differenza di matchDriverName_
// usato in race-results-import): su un campionato esterno un nome
// generico come "Marco" darebbe falsi positivi col fuzzy — meglio
// mancare un match che marcare VSD chi non lo è.
//
// FIX (#332, stesso pattern di best-laps-list in #331): tutto il
// calcolo interno (matchedDriverId, mergeRaceStats, applyAdjustments)
// continua a lavorare con l'uuid interno (necessario perché
// race_results.driver_id nel DB è l'uuid raw), ma driver_id nel
// contratto pubblico è sempre driver_code (VSD00X) — v1 esponeva
// l'uuid raw, rotto per ChampionshipDetail.jsx che confronta contro
// driverMap keyed by driver_code. Aliasing applicato come ULTIMO
// step, subito prima di ogni return, così la logica interna
// (matching/merge/adjustments) resta invariata.
//
// FIX (21/09/2026, segnalato da Demetrio — classifica Clash of
// Classes/Silverstone R1 non compariva su /championships/:id):
// la query `rounds` filtrava ANCHE `event_type = 'championship'`
// oltre a `championship_id`. Verificato via SQL su tutte le righe
// reali di `races`: championship_id è SEMPRE null per eventi non-
// campionato (4fun/8h Daytona/IMSA/test) e SEMPRE valorizzato solo
// per le 40 gare 'championship' + le 3 gare Clash of Classes (che nel
// DB hanno event_type 'Clash of Class'/'Clash of Classes', mai
// 'championship', voce libera senza enum) — quindi championship_id da
// solo è già uno scoping sufficiente e corretto, l'ulteriore filtro
// su event_type escludeva SOLO Clash of Classes senza alcun beneficio
// reale (nessun'altra riga con championship_id valorizzato ha mai un
// event_type diverso da questi due). Rimosso `.eq('event_type', ...)`
// dalla query `rounds`: ora qualunque evento con questo championship_id
// entra nel calcolo, indipendentemente da come è etichettato.
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const LEGACY_API_URL = 'https://script.google.com/macros/s/AKfycbyMXxEjZfm5EIsGUnKxpwtBtoeR4hwMG7Pl8ZESF8yG569SS0aIdsWqyu9PdBgR14vLiA/exec';

// FIX (26/09/2026, segnalato da Demetrio — "Auth richiesto" aprendo
// /championships/:id anche da loggato): stesso identico gap già chiuso
// in races-get (#385), messenger-send (#392), roster-update-self
// (#360) e tutto il dominio Best Laps/Academy (#359) — questa era
// rimasta l'unica funzione del gruppo Championships/Standings senza
// il fallback sul token legacy, nonostante academy-ranking,
// season-recap e race-results-list (stesso dominio, stesso giro di
// cutover #332) lo avessero già. Stesso fallback identico.
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

const CLASS_PRIORITY = ['Hypercar', 'LMP1', 'LMP2', 'LMP3', 'GTE', 'LMGTE Pro', 'LMGTE AM', 'LMGT3', 'GT3', 'GT4', 'TCR'];

function classSortKey(className: string): (a: string, b: string) => number {
  return (a, b) => {
    const ai = CLASS_PRIORITY.indexOf(a);
    const bi = CLASS_PRIORITY.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  };
}

function matchDriverNameStrict(externalName: unknown, matchMap: Record<string, string>): string | null {
  if (!externalName) return null;
  const name = String(externalName).toLowerCase().trim();
  return matchMap[name] || null;
}

// Alias driver_id (uuid interno) → driver_code su ogni standings[]
// di ogni classe — applicato SEMPRE come ultimo step prima della
// risposta, mai propagato dentro la logica di matching/merge.
function aliasClassesDriverIds(classes: any[], codeByUuid: Record<string, string>) {
  return classes.map((cls: any) => ({
    ...cls,
    standings: cls.standings.map((s: any) => ({
      ...s,
      driver_id: s.driver_id ? (codeByUuid[s.driver_id] || s.driver_id) : s.driver_id,
    })),
  }));
}

// Porting di parseLmuStandingsJson_ — qui `data` è già un array JS
// (jsonb decodificato da supabase-js), non una stringa da parsare.
function parseLmuStandingsJson(data: any, driverNameMap: Record<string, string>, driverInfoMap: Record<string, any>) {
  if (!Array.isArray(data)) throw new Error('Atteso array di carClass groups');
  if (data.length === 0) throw new Error('Array vuoto');

  const classes = data
    .map((classGroup: any) => {
      const className = String(classGroup.carClass || 'Unknown').trim();
      const standings = (classGroup.standings || []).map((s: any) => {
        const matchedDriverId = matchDriverNameStrict(s.id, driverNameMap);
        const isVsd = !!matchedDriverId;
        const driverInfo = isVsd ? driverInfoMap[matchedDriverId as string] : null;

        const races = Array.isArray(s.races) ? s.races : [];
        let races_count = 0, wins = 0, podiums = 0, best_finish: number | null = null, dnfs = 0, dns_count = 0;

        races.forEach((r: any) => {
          if (r.position == null) return;
          if (r.dns === true) { dns_count++; return; }
          races_count++;
          if (r.dnf === true) { dnfs++; return; }
          const pos = Number(r.position);
          if (pos === 1) wins++;
          if (pos <= 3) podiums++;
          if (best_finish === null || pos < best_finish) best_finish = pos;
        });

        return {
          position: Number(s.position),
          driver_id: matchedDriverId || '',
          driver_name_external: isVsd ? '' : s.id,
          is_vsd: isVsd,
          display_name: driverInfo ? driverInfo.display_name : s.id,
          car_class: className,
          total_points: Number(s.actualPoints) || Number(s.championshipScore) || 0,
          championship_points: Number(s.championshipPoints) || 0,
          championship_penalties: Number(s.championshipPenalties) || 0,
          championship_score: Number(s.championshipScore) || 0,
          points_adjustment: Number(s.pointsAdjustment) || 0,
          races_count, wins, podiums, best_finish, dnfs, dns_count,
        };
      });
      return { class_name: className, standings };
    })
    .sort((a: any, b: any) => classSortKey(a.class_name)(a.class_name, b.class_name));

  return { classes, points_configured: true };
}

// Porting di mergeRaceStats_
function mergeRaceStats(classes: any[], relevantResults: any[]) {
  const statsMap: Record<string, any> = {};
  relevantResults.forEach((r: any) => {
    const isVsd = !!r.is_vsd_driver;
    const driverKey = isVsd ? r.driver_id : (r.driver_name_external || 'UNKNOWN');
    if (!statsMap[driverKey]) statsMap[driverKey] = { races_count: 0, wins: 0, podiums: 0, best_finish: null, dnfs: 0 };
    const stats = statsMap[driverKey];
    const isDnf = !!r.dnf;
    const isDns = !!r.dns;
    const position = Number(r.finish_position) || null;
    if (!isDns) stats.races_count++;
    if (isDnf) stats.dnfs++;
    if (position && !isDns && !isDnf) {
      if (position === 1) stats.wins++;
      if (position <= 3) stats.podiums++;
      if (stats.best_finish === null || position < stats.best_finish) stats.best_finish = position;
    }
  });

  return classes.map((cls: any) => ({
    class_name: cls.class_name,
    standings: cls.standings.map((s: any) => {
      const key = s.driver_id || s.driver_name_external || s.display_name;
      const stats = statsMap[key];
      if (!stats) return s;
      return { ...s, races_count: stats.races_count, wins: stats.wins, podiums: stats.podiums, best_finish: stats.best_finish, dnfs: stats.dnfs };
    }),
  }));
}

// Porting di applyAdjustments_
function applyAdjustments(classes: any[], adjustments: any[]) {
  if (!adjustments || adjustments.length === 0) return classes;

  return classes.map((cls: any) => {
    const standings = cls.standings.map((s: any) => {
      const driverKey = s.driver_id || s.driver_name_external || s.display_name;
      const relevant = adjustments.filter((a: any) => a.car_class === cls.class_name && (a.driver_key === driverKey || a.driver_key === s.display_name));
      if (relevant.length === 0) return s;
      const totalDelta = relevant.reduce((sum: number, a: any) => sum + (Number(a.delta) || 0), 0);
      return { ...s, total_points: (s.total_points || 0) + totalDelta, points_adjustments: relevant };
    });

    const sorted = standings
      .sort((a: any, b: any) => {
        if (b.total_points !== a.total_points) return b.total_points - a.total_points;
        if ((b.wins || 0) !== (a.wins || 0)) return (b.wins || 0) - (a.wins || 0);
        if ((b.podiums || 0) !== (a.podiums || 0)) return (b.podiums || 0) - (a.podiums || 0);
        return (a.best_finish || 999) - (b.best_finish || 999);
      })
      .map((s: any, idx: number) => ({ ...s, position: idx + 1 }));

    return { ...cls, standings: sorted };
  });
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

    const championshipId = payload?.championship_id ? String(payload.championship_id) : '';
    if (!championshipId) return json({ ok: false, error: 'championship_id mancante' }, 400);

    // Con client service-role (fallback legacy) la RLS è bypassata: lo
    // scoping team_id va applicato esplicitamente qui, stesso principio
    // di races-get/races-list.
    const { data: championship, error: champErr } = await supabase
      .from('championships')
      .select('*')
      .eq('id', championshipId)
      .eq('team_id', me.team_id)
      .maybeSingle();
    if (champErr) return json({ ok: false, error: champErr.message }, 400);
    if (!championship) return json({ ok: false, error: 'Campionato non trovato: ' + championshipId }, 404);

    // Mappa uuid→driver_code per l'aliasing finale dell'output.
    const { data: codeDrivers, error: codeDriversErr } = await supabase
      .from('drivers')
      .select('id, driver_code')
      .eq('team_id', me.team_id);
    if (codeDriversErr) return json({ ok: false, error: codeDriversErr.message }, 400);
    const codeByUuid: Record<string, string> = {};
    (codeDrivers ?? []).forEach((d: any) => { if (d.driver_code) codeByUuid[d.id] = d.driver_code; });

    const { data: allRaces, error: racesErr } = await supabase
      .from('races')
      .select('race_id, race_name, round, race_number, date, track_id, status')
      .eq('championship_id', championshipId);
    if (racesErr) return json({ ok: false, error: racesErr.message }, 400);

    const rounds = (allRaces ?? [])
      .slice()
      .sort((a: any, b: any) => {
        const ar = Number(a.round) || 999;
        const br = Number(b.round) || 999;
        if (ar !== br) return ar - br;
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      })
      .map((r: any) => ({
        race_id: r.race_id,
        race_name: r.race_name,
        round: Number(r.round) || null,
        race_number: Number(r.race_number) || 1,
        date: r.date,
        track_id: r.track_id,
        status: r.status,
      }));

    const adjustments = Array.isArray(championship.points_adjustments_json) ? championship.points_adjustments_json : [];

    const roundRaceIds = new Set(rounds.map((r: any) => r.race_id));

    // ─── 1. Sorgente autorevole: standings_json importato da LMU ───
    if (championship.standings_json) {
      try {
        const { data: teamDrivers, error: driversErr } = await supabase
          .from('drivers')
          .select('id, display_name, real_name')
          .eq('team_id', me.team_id);
        if (driversErr) throw new Error(driversErr.message);

        const driverNameMap: Record<string, string> = {};
        const driverInfoMap: Record<string, any> = {};
        (teamDrivers ?? []).forEach((d: any) => {
          driverInfoMap[d.id] = d;
          if (d.display_name) { const k = String(d.display_name).toLowerCase().trim(); if (!driverNameMap[k]) driverNameMap[k] = d.id; }
          if (d.real_name) { const k = String(d.real_name).toLowerCase().trim(); if (!driverNameMap[k]) driverNameMap[k] = d.id; }
        });

        const parsed = parseLmuStandingsJson(championship.standings_json, driverNameMap, driverInfoMap);
        let classes = applyAdjustments(parsed.classes, adjustments);

        if (rounds.length > 0) {
          const { data: allResults, error: resErr } = await supabase
            .from('race_results')
            .select('race_id, session_type, driver_id, driver_name_external, is_vsd_driver, finish_position, dnf, dns')
            .in('race_id', Array.from(roundRaceIds));
          if (resErr) throw new Error(resErr.message);
          const relevantResults = (allResults ?? []).filter((r: any) => r.session_type === 'race');
          if (relevantResults.length > 0) classes = mergeRaceStats(classes, relevantResults);
        }

        return json({
          ok: true,
          data: { championship, classes: aliasClassesDriverIds(classes, codeByUuid), rounds, points_configured: true, source: 'lmu_import', adjustments },
        });
      } catch (e) {
        // Parse fallito: fallback al compute, fedele al sorgente (log + continua).
        console.log('parse standings_json fallito, fallback al compute:', String(e));
      }
    }

    // ─── 2. Fallback: compute da race_results ───
    if (rounds.length === 0) {
      return json({ ok: true, data: { championship, classes: [], rounds: [], points_configured: false, source: 'computed', adjustments } });
    }

    const { data: allResults, error: resErr } = await supabase
      .from('race_results')
      .select('race_id, session_type, driver_id, driver_name_external, is_vsd_driver, car_class, finish_position, dnf, dns, point_total')
      .in('race_id', Array.from(roundRaceIds));
    if (resErr) return json({ ok: false, error: resErr.message }, 400);
    const relevantResults = (allResults ?? []).filter((r: any) => r.session_type === 'race');

    const { data: teamDrivers2, error: driversErr2 } = await supabase
      .from('drivers')
      .select('id, display_name')
      .eq('team_id', me.team_id);
    if (driversErr2) return json({ ok: false, error: driversErr2.message }, 400);
    const driverMap: Record<string, any> = {};
    (teamDrivers2 ?? []).forEach((d: any) => { driverMap[d.id] = d; });

    const aggregates: Record<string, any> = {};
    relevantResults.forEach((r: any) => {
      const isVsd = !!r.is_vsd_driver;
      const driverKey = isVsd ? r.driver_id : (r.driver_name_external || 'UNKNOWN');
      const carClass = r.car_class || 'Unknown';
      const aggKey = `${driverKey}__${carClass}`;

      if (!aggregates[aggKey]) {
        aggregates[aggKey] = {
          driver_id: isVsd ? r.driver_id : '',
          driver_name_external: isVsd ? '' : r.driver_name_external,
          is_vsd: isVsd,
          car_class: carClass,
          total_points: 0, races_count: 0, wins: 0, podiums: 0, best_finish: null, dnfs: 0, dns_count: 0,
        };
      }
      const agg = aggregates[aggKey];
      const isDnf = !!r.dnf;
      const isDns = !!r.dns;
      const points = Number(r.point_total) || 0;
      const position = Number(r.finish_position) || null;

      if (!isDns) agg.races_count++;
      if (isDnf) agg.dnfs++;
      if (isDns) agg.dns_count++;
      agg.total_points += points;

      if (position && !isDns) {
        if (position === 1) agg.wins++;
        if (position <= 3) agg.podiums++;
        if (agg.best_finish === null || position < agg.best_finish) agg.best_finish = position;
      }
    });

    const classesMap: Record<string, any[]> = {};
    Object.values(aggregates).forEach((agg: any) => {
      const driverInfo = agg.driver_id ? driverMap[agg.driver_id] : null;
      const display_name = driverInfo ? driverInfo.display_name : agg.driver_name_external;
      if (!classesMap[agg.car_class]) classesMap[agg.car_class] = [];
      classesMap[agg.car_class].push({ ...agg, display_name });
    });

    const classes = Object.keys(classesMap)
      .sort((a, b) => {
        const ai = CLASS_PRIORITY.indexOf(a);
        const bi = CLASS_PRIORITY.indexOf(b);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return a.localeCompare(b);
      })
      .map((className) => {
        const standings = classesMap[className]
          .sort((a: any, b: any) => {
            if (b.total_points !== a.total_points) return b.total_points - a.total_points;
            if (b.wins !== a.wins) return b.wins - a.wins;
            if (b.podiums !== a.podiums) return b.podiums - a.podiums;
            return (a.best_finish || 999) - (b.best_finish || 999);
          })
          .map((s: any, idx: number) => ({ ...s, position: idx + 1 }));
        return { class_name: className, standings };
      });

    const pointsConfigured = Object.values(aggregates).some((a: any) => a.total_points > 0);
    const classesWithAdj = applyAdjustments(classes, adjustments);

    return json({
      ok: true,
      data: { championship, classes: aliasClassesDriverIds(classesWithAdj, codeByUuid), rounds, points_configured: pointsConfigured, source: 'computed', adjustments },
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
