// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — raceResults.import (porting di
// apps-script/RaceResultsImport.js, handleRaceResultsImport)
// ═══════════════════════════════════════════════════════════
// Logica di riferimento reale:
//   - auth richiesto, SOLO staff/admin (ctx.isStaff)
//   - payload: { race_id, json_data } — json_data accetta 2 formati:
//       LMU:      array [{carClass, result:[...]}]
//       iRacing:  oggetto {type:'event_result', data:{...}}
//   - matching nome-esterno→driver_id: matchDriverName_ multi-livello
//     (match esatto, poi "nome i.", poi prefisso cognome da real_name)
//   - dedup per (race_id, session_type, driver_key) — driver_key è
//     driver_id se matchato, altrimenti nome esterno lowercased
//   - iRacing: un solo JSON genera FINO A 3 sessioni (qualifying/heat/
//     race), ciascuna trasformata in formato LMU-like e passata allo
//     stesso import core; practice/warmup skippate
//
// GAP NOTI (documentati, non dimenticanze): le notifiche Discord
// post-import (notifyRaceImported_, checkAndNotifyPodiums_/
// checkAndNotifyIracingPodiums_, checkAndNotifyMilestones_,
// checkAndNotifyRaceMvp_) NON sono portate — dipendono da un dominio
// non ancora portato (Notifications/Discord #256). I dati scritti qui
// sono comunque completi: quando quel dominio arriverà potrà operare
// su questi risultati senza re-importare.
//
// GAP CHIUSO in #261: il seeding automatico di Race Reports
// (seedRaceReportsForRace_ nel sorgente) è ora replicato qui in
// seedRaceReportsForRace(), chiamato in modo non bloccante (try/catch,
// mai propagato al chiamante) dopo ogni importGroup con
// session_type==='race' — fedele a RaceResultsImport.js righe 580-659,
// che lo esegue sempre dopo un import "race" sia per LMU sia per
// iRacing, avvolto nello stesso try/catch fault-tolerant delle
// notifiche Discord.
//
// invalidateRaceLapsCache_() del sorgente reale non ha equivalente
// qui: è un invalidamento della cache applicativa di Apps Script
// (CacheService), che Postgres non usa — non è un gap, è
// semplicemente un meccanismo che non si applica a questa architettura.
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function msToLapDisplay(ms: number | null | undefined): string {
  if (ms == null || isNaN(ms as number)) return '';
  const total = Number(ms);
  if (total <= 0) return '';
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const millis = total % 1000;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function msToTimeDisplay(ms: number | null | undefined): string {
  if (ms == null || isNaN(ms as number)) return '';
  const total = Number(ms);
  if (total <= 0) return '';
  const hours = Math.floor(total / 3600000);
  const minutes = Math.floor((total % 3600000) / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const millis = total % 1000;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

// Porting fedele di matchDriverName_ (RaceResultsImport.js) — stesso
// algoritmo multi-livello già usato in pitwall-log-session, qui contro
// una matchMap driver_code-agnostica costruita da display_name/real_name.
function matchDriverName(externalName: unknown, matchMap: Record<string, string>): string | null {
  if (!externalName) return null;
  const name = String(externalName).toLowerCase().trim();

  if (matchMap[name]) return matchMap[name];

  const parts = name.split(/\s+/);

  if (parts.length === 2 && /^[a-z]\.?$/.test(parts[1])) {
    const variant = `${parts[0]} ${parts[1].charAt(0)}.`;
    if (matchMap[variant]) return matchMap[variant];
  }

  if (parts.length === 2) {
    const firstName = parts[0];
    const cleanSurname = parts[1].replace(/[^a-z]+$/g, '');
    if (cleanSurname.length >= 3) {
      for (const key in matchMap) {
        const keyParts = key.split(' ');
        if (keyParts.length !== 2) continue;
        if (keyParts[0] !== firstName) continue;
        const candidateSurname = keyParts[1].replace(/\.$/, '');
        if (candidateSurname.length > 1 && candidateSurname.indexOf(cleanSurname) === 0) {
          return matchMap[key];
        }
      }
    }
  }

  if (parts.length === 1 && matchMap[parts[0]]) {
    return matchMap[parts[0]];
  }

  return null;
}

function detectSessionType(jsonData: any[]): string | null {
  if (!Array.isArray(jsonData) || jsonData.length === 0) return null;
  const firstGroup = jsonData[0];
  if (!firstGroup?.result || !Array.isArray(firstGroup.result) || firstGroup.result.length === 0) return null;
  const hasPosition = firstGroup.result.some((r: any) => r.position != null);
  return hasPosition ? 'race' : 'qualifying';
}

function normalizeSessionType(simsessionName: string | undefined): string | null {
  const n = (simsessionName || '').toUpperCase();
  if (n.includes('QUALIF')) return 'qualifying';
  if (n.startsWith('HEAT')) return 'heat';
  if (n === 'RACE' || n === 'FEATURE') return 'race';
  return null;
}

function transformIracingResultToLMU(r: any) {
  const bestLapMs = r.best_lap_time && r.best_lap_time > 0 ? Math.round(r.best_lap_time / 10) : null;
  const reasonOut = r.reason_out || '';
  const isDnf = reasonOut !== 'Running' && reasonOut !== '';
  const isDns = r.laps_complete === 0 && r.starting_position === -1;
  const position = r.finish_position != null ? r.finish_position + 1 : null;
  const carNum = (r.livery && r.livery.car_number) || '';

  return {
    id: r.display_name || '',
    carNum,
    car: r.car_name || '',
    totalLaps: r.laps_complete || 0,
    bestLap: bestLapMs,
    totalTime: null,
    position,
    pointsGiven: null,
    penaltyPoints: null,
    pointTotal: r.champ_points || 0,
    dnf: isDnf,
    dns: isDns,
    incidents: r.incidents || 0,
  };
}

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
    if (!payload?.race_id) return json({ ok: false, error: 'race_id mancante' }, 400);
    if (!payload?.json_data) return json({ ok: false, error: 'json_data mancante' }, 400);

    let jsonData = payload.json_data;
    if (typeof jsonData === 'string') {
      try { jsonData = JSON.parse(jsonData); }
      catch (e) { return json({ ok: false, error: 'JSON non valido: ' + String(e) }, 400); }
    }

    const { data: me, error: meErr } = await supabase
      .from('drivers')
      .select('id, team_id, role')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (meErr) return json({ ok: false, error: meErr.message }, 400);
    if (!me) return json({ ok: false, error: 'Driver non collegato a questo account' }, 404);
    if (me.role !== 'staff' && me.role !== 'admin') {
      return json({ ok: false, error: 'Forbidden: solo staff può importare risultati' }, 403);
    }

    const { data: race, error: raceErr } = await supabase
      .from('races')
      .select('race_id, sim, track_id, date')
      .eq('race_id', String(payload.race_id))
      .maybeSingle();
    if (raceErr) return json({ ok: false, error: raceErr.message }, 400);
    if (!race) return json({ ok: false, error: 'Gara non trovata: ' + payload.race_id }, 404);

    // Mappa nome→driver_id, ristretta al team del chiamante.
    const { data: teamDrivers, error: driversErr } = await supabase
      .from('drivers')
      .select('id, display_name, real_name')
      .eq('team_id', me.team_id);
    if (driversErr) return json({ ok: false, error: driversErr.message }, 400);

    const driverNameMap: Record<string, string> = {};
    (teamDrivers ?? []).forEach((d: any) => {
      if (d.display_name) {
        const key = String(d.display_name).toLowerCase().trim();
        if (!driverNameMap[key]) driverNameMap[key] = d.id;
      }
      if (d.real_name) {
        const rkey = String(d.real_name).toLowerCase().trim();
        if (!driverNameMap[rkey]) driverNameMap[rkey] = d.id;
      }
    });

    // ─── Import core: un gruppo di classi LMU-like → righe race_results ───
    async function importGroup(groups: any[], meta: { race_id: string; sim: string; track_id: string; set_date: string; session_type: string }) {
      const { data: existingRows, error: existErr } = await supabase
        .from('race_results')
        .select('driver_id, driver_name_external')
        .eq('team_id', me!.team_id)
        .eq('race_id', meta.race_id)
        .eq('session_type', meta.session_type);
      if (existErr) throw new Error(existErr.message);

      const existingKeys = new Set<string>();
      (existingRows ?? []).forEach((row: any) => {
        const key = row.driver_id || String(row.driver_name_external || '').toLowerCase().trim();
        if (key) existingKeys.add(key);
      });

      const timestamp = Date.now();
      const importedAt = new Date().toISOString();
      const rowsToInsert: Record<string, unknown>[] = [];
      let skippedCount = 0;

      groups.forEach((classGroup: any, classIdx: number) => {
        const carClass = classGroup.carClass || 'Unknown';
        const results = classGroup.result || [];
        const hasExplicitPosition = results.some((r: any) => r.position != null);

        let sortedResults;
        if (hasExplicitPosition) {
          sortedResults = [...results].sort((a: any, b: any) => (a.position ?? 999) - (b.position ?? 999));
        } else {
          sortedResults = [...results].sort((a: any, b: any) => {
            const aLaps = a.totalLaps || 0;
            const bLaps = b.totalLaps || 0;
            if (bLaps !== aLaps) return bLaps - aLaps;
            const aBest = a.bestLap ?? Infinity;
            const bBest = b.bestLap ?? Infinity;
            return aBest - bBest;
          });
        }

        sortedResults.forEach((r: any, idx: number) => {
          const matchedDriverId = matchDriverName(r.id, driverNameMap);
          const driverKey = matchedDriverId || String(r.id || '').toLowerCase().trim();
          if (driverKey && existingKeys.has(driverKey)) {
            skippedCount++;
            return;
          }
          if (driverKey) existingKeys.add(driverKey);

          const finishPosition = r.position != null ? r.position : idx + 1;

          rowsToInsert.push({
            result_id: `RES-${timestamp}-${classIdx}-${idx}`,
            team_id: me!.team_id,
            race_id: meta.race_id,
            sim: meta.sim,
            track_id: meta.track_id || null,
            set_date: meta.set_date || null,
            session_type: meta.session_type,
            car_class: carClass,
            car_num: r.carNum != null && r.carNum !== '' ? Number(r.carNum) : null,
            car_external_name: r.car || null,
            driver_id: matchedDriverId,
            driver_name_external: r.id || null,
            total_laps: r.totalLaps != null ? Number(r.totalLaps) : null,
            best_lap_ms: r.bestLap != null ? Number(r.bestLap) : null,
            best_lap_display: msToLapDisplay(r.bestLap),
            total_time_ms: r.totalTime != null ? Number(r.totalTime) : null,
            total_time_display: msToTimeDisplay(r.totalTime),
            finish_position: finishPosition,
            points_given: r.pointsGiven != null ? Number(r.pointsGiven) : null,
            penalty_points: r.penaltyPoints != null ? Number(r.penaltyPoints) : null,
            point_total: r.pointTotal != null ? Number(r.pointTotal) : null,
            dnf: r.dnf === true,
            dns: r.dns === true,
            is_vsd_driver: !!matchedDriverId,
            incidents: r.incidents != null ? Number(r.incidents) : null,
            imported_at: importedAt,
            raw_payload: r,
          });
        });
      });

      if (rowsToInsert.length === 0) {
        return { imported: 0, vsd_matched: 0, external: 0, dns: 0, dnf: 0, skipped_duplicates: skippedCount, session_type: meta.session_type };
      }

      const { error: insertErr } = await supabase.from('race_results').insert(rowsToInsert);
      if (insertErr) throw new Error(insertErr.message);

      const vsdCount = rowsToInsert.filter((r: any) => r.is_vsd_driver).length;
      const dnsCount = rowsToInsert.filter((r: any) => r.dns).length;
      const dnfCount = rowsToInsert.filter((r: any) => r.dnf).length;

      return {
        imported: rowsToInsert.length,
        vsd_matched: vsdCount,
        external: rowsToInsert.length - vsdCount,
        dns: dnsCount,
        dnf: dnfCount,
        skipped_duplicates: skippedCount,
        session_type: meta.session_type,
      };
    }

    // Porting fedele di seedRaceReportsForRace_ (apps-script/seedReports.js),
    // richiamato qui in modo non bloccante esattamente come nel sorgente
    // (righe 580-659 di RaceResultsImport.js): mai propagato al chiamante,
    // un eventuale fallimento del seeding non deve far fallire l'import.
    async function seedRaceReportsForRace(raceId: string) {
      try {
        const { data: results } = await supabase
          .from('race_results')
          .select('*')
          .eq('team_id', me!.team_id)
          .eq('race_id', raceId)
          .eq('session_type', 'race');

        const { data: existingReports } = await supabase
          .from('race_reports')
          .select('driver_id')
          .eq('team_id', me!.team_id)
          .eq('race_id', raceId);
        const existingDrivers = new Set((existingReports ?? []).map((r: any) => r.driver_id));

        const draftRows: Record<string, unknown>[] = [];
        (results ?? []).forEach((rr: any) => {
          if (rr.is_vsd_driver !== true) return;
          if (rr.dns === true) return;
          if (existingDrivers.has(rr.driver_id)) return;
          existingDrivers.add(rr.driver_id);

          const isDnf = rr.dnf === true;
          draftRows.push({
            team_id: me!.team_id,
            race_id: raceId,
            driver_id: rr.driver_id,
            grid_position: rr.qual_position ?? null,
            finish_position: isDnf ? null : (rr.finish_position ?? null),
            best_lap_ms: rr.best_lap_ms ?? null,
            incident_notes: isDnf ? '⚠ DNF — investigare causa nel replay' : null,
          });
        });

        if (draftRows.length > 0) {
          await supabase.from('race_reports').insert(draftRows);
        }
      } catch (_e) {
        // Fault-tolerant, fedele al try/catch del sorgente attorno a
        // seedRaceReportsForRace_: un fallimento qui non deve mai
        // interrompere o far fallire la risposta dell'import.
      }
    }

    const isIRacingFormat = jsonData && !Array.isArray(jsonData) && jsonData.type === 'event_result';

    if (isIRacingFormat) {
      const data = jsonData.data;
      if (!data) return json({ ok: false, error: 'iRacing JSON: campo `data` mancante' }, 400);
      const sessions = data.session_results || [];
      if (sessions.length === 0) return json({ ok: false, error: 'iRacing JSON: nessuna session_results trovata' }, 400);

      const carClassDefault = (data.car_classes && data.car_classes[0] && data.car_classes[0].name) || 'Hosted All Cars';
      const aggStats: any = { imported: 0, vsd_matched: 0, external: 0, dnf: 0, dns: 0, by_session: {}, sessions_skipped: 0 };

      for (const session of sessions) {
        const sessionType = normalizeSessionType(session.simsession_name);
        if (!sessionType) { aggStats.sessions_skipped++; continue; }

        const results = session.results || [];
        const groups = [{ carClass: carClassDefault, result: results.map(transformIracingResultToLMU) }];
        const meta = {
          race_id: race.race_id,
          sim: 'IRC',
          track_id: race.track_id || '',
          set_date: (data.start_time || '').substring(0, 10) || (race.date || '').substring(0, 10),
          session_type: sessionType,
        };

        const sessionStats = await importGroup(groups, meta);
        aggStats.imported += sessionStats.imported || 0;
        aggStats.vsd_matched += sessionStats.vsd_matched || 0;
        aggStats.external += sessionStats.external || 0;
        aggStats.dnf += sessionStats.dnf || 0;
        aggStats.dns += sessionStats.dns || 0;
        aggStats.by_session[sessionType] = sessionStats.imported || 0;

        if (sessionType === 'race') {
          await seedRaceReportsForRace(race.race_id);
        }
      }

      return json({ ok: true, data: aggStats });
    }

    if (!Array.isArray(jsonData) || jsonData.length === 0) {
      return json({ ok: false, error: 'json_data deve essere un array (LMU) o un oggetto event_result (iRacing)' }, 400);
    }

    const sessionType = detectSessionType(jsonData);
    if (!sessionType) return json({ ok: false, error: 'Impossibile dedurre session_type dalla struttura JSON' }, 400);

    const meta = {
      race_id: race.race_id,
      sim: race.sim || '',
      track_id: race.track_id || '',
      set_date: (race.date || new Date().toISOString()).substring(0, 10),
      session_type: sessionType,
    };

    const stats = await importGroup(jsonData, meta);

    if (meta.session_type === 'race') {
      await seedRaceReportsForRace(meta.race_id);
    }

    return json({ ok: true, data: stats });
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
