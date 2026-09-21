// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — elo-safety-backfill (#369)
// One-shot/rilanciabile: rigioca in ordine cronologico tutti i
// race_results (session_type='race') e incident_resolutions risolte
// per (ri)costruire da zero driver_elo_ratings/driver_elo_history e
// driver_safety_ranks/driver_safety_rank_history. Vedi commento di
// contesto completo in cloud/schema/031_elo_safety_rank.sql.
//
// Idempotente: cancella prima le righe del team (+ sim se passato) in
// tutte e 4 le tabelle, poi ricostruisce. Safe da rilanciare quante
// volte serve (bug nel calcolo, nuova gara storica scoperta tardi).
//
// Elo: gruppo di confronto = (race_id, car_class) — stessa unità
// class-relative di PM in academy-ranking. K-factor per il pilota
// dipende da QUANTE gare ha già fatto in quel sim PRIMA di questa
// (40 prime 10, 24 dalle 11 alle 30, 16 dopo). DNS escluso (nessun
// dato), DNF incluso (posizione relativa comunque significativa).
//
// Safety Rank: due flussi di eventi indipendenti, fusi per timestamp
// e processati in ordine per (driver, sim):
//   - ogni riga race_results (session_type='race') = +1 occasione di
//     gara pulita, timestamp = set_date;
//   - ogni incident_resolutions con penalty_type noto E resolved_at
//     valorizzato (non ancora risolte = ignorate) = decremento,
//     timestamp = resolved_at.
// NOTA ONESTA: incident_resolutions non ha una FK verso una gara
// specifica (race_id) nello schema esistente — è un limite del
// dominio Incidents originale (segnalazione libera, non legata a un
// preciso race_id), non introdotto qui. Il "+1 gara pulita" è quindi
// per-gara-completata, non "gara senza QUELLA specifica penalità" —
// la fusione cronologica dei due flussi resta comunque corretta nel
// far salire/scendere il valore nel tempo.
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

const K_FACTOR = (racesBefore: number) => (racesBefore < 10 ? 40 : racesBefore < 30 ? 24 : 16);

const SAFETY_PENALTY: Record<string, number> = {
  'warning': -2,
  'penalità lieve': -4,
  'penalità media': -8,
  'penalità pesante': -15,
  'squalifica': -25,
};
const SAFETY_REASON: Record<string, string> = {
  'warning': 'warning',
  'penalità lieve': 'lieve',
  'penalità media': 'media',
  'penalità pesante': 'pesante',
  'squalifica': 'squalifica',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
          .select('id, team_id, role, display_name, driver_code')
          .eq('auth_user_id', user.id)
          .maybeSingle();
        me = meRow || null;
      }
    }

    const serviceClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    if (!me) {
      const legacyMe = await resolveLegacyDriver(serviceClient, payload?.legacy_token);
      if (legacyMe) me = legacyMe;
    }

    if (!me) return json({ ok: false, error: 'Auth richiesto' }, 401);
    if (me.role !== 'staff' && me.role !== 'admin') return json({ ok: false, error: 'Forbidden: solo staff/admin' }, 403);

    // Da qui in poi si lavora SEMPRE con service role (bypassa RLS,
    // scoping manuale su team_id — stesso principio del resto del
    // progetto per gli endpoint di scrittura massiva).
    const db = serviceClient;
    const teamId = me.team_id;
    const simFilter: string | null = payload?.sim ? String(payload.sim) : null;

    // ─── 1. Pulizia (idempotenza) ───
    for (const table of ['driver_elo_history', 'driver_elo_ratings', 'driver_safety_rank_history', 'driver_safety_ranks']) {
      let del = db.from(table).delete().eq('team_id', teamId);
      if (simFilter) del = del.eq('sim', simFilter);
      const { error } = await del;
      if (error) return json({ ok: false, error: `Pulizia ${table}: ${error.message}` }, 400);
    }

    // ─── 2. Dati sorgente ───
    let resultsQuery = db
      .from('race_results')
      .select('race_id, sim, car_class, driver_id, finish_position, total_laps, set_date, imported_at')
      .eq('team_id', teamId)
      .eq('session_type', 'race')
      .not('driver_id', 'is', null)
      .not('dns', 'eq', true);
    if (simFilter) resultsQuery = resultsQuery.eq('sim', simFilter);
    const { data: results, error: resErr } = await resultsQuery;
    if (resErr) return json({ ok: false, error: resErr.message }, 400);

    let resoQuery = db
      .from('incident_resolutions')
      .select('id, sim, penalized_driver_id, penalty_type, resolved_at')
      .eq('team_id', teamId)
      .not('penalized_driver_id', 'is', null)
      .not('resolved_at', 'is', null);
    if (simFilter) resoQuery = resoQuery.eq('sim', simFilter);
    const { data: resolutions, error: resoErr } = await resoQuery;
    if (resoErr) return json({ ok: false, error: resoErr.message }, 400);

    // ─── 3. Elo: raggruppa per (sim, race_id, car_class), ordina i
    //     gruppi cronologicamente, processa un gruppo alla volta ───
    const raceGroups: Record<string, any[]> = {};
    (results ?? []).forEach((r: any) => {
      const key = [r.sim, r.race_id || 'no-race-id', r.car_class].join('|');
      if (!raceGroups[key]) raceGroups[key] = [];
      raceGroups[key].push(r);
    });

    function groupTimestamp(group: any[]): number {
      const dates = group.map((r) => (r.set_date ? new Date(r.set_date).getTime() : new Date(r.imported_at).getTime()));
      return Math.min(...dates);
    }

    const sortedGroupKeys = Object.keys(raceGroups)
      .filter((k) => raceGroups[k].length >= 2) // Elo ha senso solo con ≥2 piloti a confronto
      .sort((a, b) => groupTimestamp(raceGroups[a]) - groupTimestamp(raceGroups[b]));

    const eloState: Record<string, { rating: number; races: number }> = {}; // key: driver_id|sim
    const eloHistoryRows: any[] = [];

    sortedGroupKeys.forEach((key) => {
      const group = raceGroups[key];
      const sim = group[0].sim;
      const carClass = group[0].car_class;
      const raceId = group[0].race_id;

      const withPosition = group.filter((r: any) => r.finish_position != null);
      if (withPosition.length < 2) return;

      const stateKey = (driverId: string) => `${driverId}|${sim}`;
      withPosition.forEach((r: any) => {
        if (!eloState[stateKey(r.driver_id)]) eloState[stateKey(r.driver_id)] = { rating: 1500, races: 0 };
      });

      const preRaceRating: Record<string, number> = {};
      withPosition.forEach((r: any) => { preRaceRating[r.driver_id] = eloState[stateKey(r.driver_id)].rating; });

      withPosition.forEach((r: any) => {
        const myRating = preRaceRating[r.driver_id];
        const myPos = Number(r.finish_position);
        const opponents = withPosition.filter((o: any) => o.driver_id !== r.driver_id);
        if (opponents.length === 0) return;

        let expectedSum = 0;
        let actualSum = 0;
        opponents.forEach((o: any) => {
          const oppRating = preRaceRating[o.driver_id];
          const expected = 1 / (1 + Math.pow(10, (oppRating - myRating) / 400));
          const oppPos = Number(o.finish_position);
          const actual = myPos < oppPos ? 1 : myPos > oppPos ? 0 : 0.5;
          expectedSum += expected;
          actualSum += actual;
        });

        const racesBefore = eloState[stateKey(r.driver_id)].races;
        const k = K_FACTOR(racesBefore);
        const delta = k * ((actualSum - expectedSum) / opponents.length);
        const ratingBefore = myRating;
        const ratingAfter = ratingBefore + delta;

        eloState[stateKey(r.driver_id)] = { rating: ratingAfter, races: racesBefore + 1 };

        eloHistoryRows.push({
          team_id: teamId,
          driver_id: r.driver_id,
          sim,
          race_id: raceId,
          car_class: carClass,
          rating_before: Math.round(ratingBefore * 100) / 100,
          rating_after: Math.round(ratingAfter * 100) / 100,
          delta: Math.round(delta * 100) / 100,
          k_factor: k,
          opponents_count: opponents.length,
        });
      });
    });

    // ─── 4. Safety Rank: fondi eventi gara-pulita + penalità per
    //     (driver, sim), ordina cronologicamente, applica in sequenza ───
    type SafetyEvent = { driverId: string; sim: string; ts: number; kind: 'race' | 'penalty'; raceId?: string; resolutionId?: string; penaltyType?: string };
    const events: SafetyEvent[] = [];

    (results ?? []).forEach((r: any) => {
      const ts = r.set_date ? new Date(r.set_date).getTime() : new Date(r.imported_at).getTime();
      events.push({ driverId: r.driver_id, sim: r.sim, ts, kind: 'race', raceId: r.race_id });
    });
    (resolutions ?? []).forEach((res: any) => {
      if (!SAFETY_PENALTY[res.penalty_type]) return; // 'nessuna'/vuoto/sconosciuto: nessun impatto
      events.push({
        driverId: res.penalized_driver_id, sim: res.sim, ts: new Date(res.resolved_at).getTime(),
        kind: 'penalty', resolutionId: res.id, penaltyType: res.penalty_type,
      });
    });
    events.sort((a, b) => a.ts - b.ts);

    const safetyState: Record<string, { rating: number; races: number }> = {};
    const safetyHistoryRows: any[] = [];

    events.forEach((ev) => {
      const key = `${ev.driverId}|${ev.sim}`;
      if (!safetyState[key]) safetyState[key] = { rating: 100, races: 0 };
      const before = safetyState[key].rating;

      let after = before;
      let reason: string;
      if (ev.kind === 'race') {
        after = Math.min(100, before + 1);
        reason = 'clean_race';
        safetyState[key].races += 1;
      } else {
        after = Math.max(0, before + SAFETY_PENALTY[ev.penaltyType!]);
        reason = SAFETY_REASON[ev.penaltyType!];
      }

      safetyState[key].rating = after;
      safetyHistoryRows.push({
        team_id: teamId,
        driver_id: ev.driverId,
        sim: ev.sim,
        race_id: ev.kind === 'race' ? ev.raceId : null,
        incident_resolution_id: ev.kind === 'penalty' ? ev.resolutionId : null,
        rating_before: Math.round(before * 100) / 100,
        rating_after: Math.round(after * 100) / 100,
        delta: Math.round((after - before) * 100) / 100,
        reason,
      });
    });

    // ─── 5. Scrittura: stato corrente + storico, a blocchi ───
    async function bulkInsert(table: string, rows: any[], chunkSize = 500) {
      for (let i = 0; i < rows.length; i += chunkSize) {
        const { error } = await db.from(table).insert(rows.slice(i, i + chunkSize));
        if (error) throw new Error(`${table}: ${error.message}`);
      }
    }

    const eloRatingRows = Object.keys(eloState).map((key) => {
      const [driver_id, sim] = key.split('|');
      return { team_id: teamId, driver_id, sim, rating: Math.round(eloState[key].rating * 100) / 100, races: eloState[key].races };
    });
    const safetyRatingRows = Object.keys(safetyState).map((key) => {
      const [driver_id, sim] = key.split('|');
      return { team_id: teamId, driver_id, sim, rating: safetyState[key].rating, races: safetyState[key].races };
    });

    try {
      await bulkInsert('driver_elo_history', eloHistoryRows);
      await bulkInsert('driver_elo_ratings', eloRatingRows);
      await bulkInsert('driver_safety_rank_history', safetyHistoryRows);
      await bulkInsert('driver_safety_ranks', safetyRatingRows);
    } catch (e) {
      return json({ ok: false, error: String(e) }, 400);
    }

    return json({
      ok: true,
      data: {
        sims_processed: [...new Set([...eloRatingRows.map((r) => r.sim), ...safetyRatingRows.map((r) => r.sim)])],
        elo: { drivers: eloRatingRows.length, race_groups: sortedGroupKeys.length, history_rows: eloHistoryRows.length },
        safety: { drivers: safetyRatingRows.length, events: safetyHistoryRows.length },
      },
    });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
