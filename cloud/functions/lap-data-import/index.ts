// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — lapData.import (porting fedele di
// apps-script/LapData.js, handleLapDataImport/importLapData_)
// ═══════════════════════════════════════════════════════════
// Auth: staff/admin (stesso livello di raceResults.import). Import
// CSV per-giro dal plugin SimHub. Parser RFC4180-ish identico al
// sorgente (parseLapDataCsv_). matchDriverName riusa esattamente
// l'algoritmo già validato in race-results-import (fuzzy
// nome+iniziale cognome). Dedup (session_id, driver_key, lap_number)
// via Set costruito leggendo le righe esistenti della sessione —
// stesso approccio del sorgente, non un vincolo DB (vedi schema 025).
//
// FIX #336 (20/09/2026, trovato PRIMA del cutover frontend, mai
// esposto a utenti reali): payload.driver_id_override arriva dal
// frontend (AdminImportLapData.jsx, select popolato da roster.list())
// come driver_code ("VSD005", contratto pubblico, vedi FIX #330) — ma
// veniva confrontato con `.eq('id', driverIdOverride)`, colonna uuid
// di drivers. Con un driver_code non uuid la query Postgres avrebbe
// fallito silenziosamente (nessuna riga trovata → errore "sconosciuto"
// anche per un pilota valido) e, se mai passata, il valore stringa
// sarebbe finito in lap_data.driver_id (uuid) causando un errore
// Postgres invalid input syntax al primo insert — stesso bug-pattern
// già corretto in #331/#333/#334/#335. Risolto: driver_code→uuid
// risolto scoped al team PRIMA del controllo di esistenza.
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function parseLapDataCsv(csvText: string): { headers: string[]; records: Record<string, string>[] } {
  const text = String(csvText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') { inQuotes = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }
    field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmptyRows = rows.filter((r) => r.some((v) => String(v).trim() !== ''));
  if (nonEmptyRows.length === 0) return { headers: [], records: [] };

  const headers = nonEmptyRows[0].map((h) => String(h).trim());
  const records = nonEmptyRows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => { obj[h] = r[idx] !== undefined ? String(r[idx]).trim() : ''; });
    return obj;
  });

  return { headers, records };
}

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

function numOrEmpty(v: unknown): number | null {
  return v !== undefined && v !== null && v !== '' ? Number(v) : null;
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

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return json({ ok: false, error: 'Auth richiesto' }, 401);

    const { data: me, error: meErr } = await supabase
      .from('drivers')
      .select('id, team_id, role')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (meErr) return json({ ok: false, error: meErr.message }, 400);
    if (!me) return json({ ok: false, error: 'Driver non collegato a questo account' }, 404);
    if (me.role !== 'staff' && me.role !== 'admin') {
      return json({ ok: false, error: 'Forbidden: solo staff può importare dati di passo' }, 403);
    }

    const payload = await req.json().catch(() => ({}));
    if (!payload?.csv_text) return json({ ok: false, error: 'csv_text mancante' }, 400);

    const parsed = parseLapDataCsv(String(payload.csv_text));
    if (parsed.records.length === 0) return json({ ok: false, error: 'CSV vuoto o non parsabile' }, 400);

    const requiredCols = ['session_id', 'lap_number'];
    const missingCols = requiredCols.filter((c) => parsed.headers.indexOf(c) === -1);
    if (missingCols.length > 0) {
      return json({ ok: false, error: 'Colonne CSV mancanti: ' + missingCols.join(', ') }, 400);
    }

    // FIX #336: driver_id_override arriva come driver_code dal frontend
    // (roster.list().driver_id) — risolto a uuid scoped al team prima
    // di ogni uso, mai più confrontato/scritto come stringa driver_code.
    const driverIdOverrideCode = payload.driver_id_override ? String(payload.driver_id_override).trim() : '';
    let driverIdOverride = '';
    if (driverIdOverrideCode) {
      const { data: overrideDriver } = await supabase
        .from('drivers')
        .select('id')
        .eq('driver_code', driverIdOverrideCode)
        .eq('team_id', me.team_id)
        .maybeSingle();
      if (!overrideDriver) return json({ ok: false, error: 'driver_id_override sconosciuto: ' + driverIdOverrideCode }, 400);
      driverIdOverride = overrideDriver.id;
    }

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

    // Dedup: legge le righe già presenti per QUALSIASI session_id
    // citato nel CSV (di solito uno solo), fedele al sorgente che scansiona
    // l'intera tab (qui limitato per session_id per restare efficiente,
    // stesso risultato perché il dedup key include già session_id).
    const sessionIdsInCsv = Array.from(new Set(parsed.records.map((r) => String(r.session_id || '').trim()).filter(Boolean)));
    const { data: existingRows, error: existErr } = await supabase
      .from('lap_data')
      .select('session_id, driver_id, driver_name_external, lap_number')
      .eq('team_id', me.team_id)
      .in('session_id', sessionIdsInCsv.length ? sessionIdsInCsv : ['__none__']);
    if (existErr) return json({ ok: false, error: existErr.message }, 400);

    const existingKeys = new Set<string>();
    (existingRows ?? []).forEach((row: any) => {
      const driverKey = row.driver_id || String(row.driver_name_external || '').trim().toLowerCase();
      const lap = String(row.lap_number || '').trim();
      if (row.session_id && lap) existingKeys.add(row.session_id + '|' + driverKey + '|' + lap);
    });

    const importedAt = new Date().toISOString();
    const rowsToInsert: Record<string, unknown>[] = [];
    let skippedCount = 0;
    let sessionId = '';
    const lapsPerDriver: Record<string, number> = {};

    parsed.records.forEach((r) => {
      const matchedDriverId = driverIdOverride || matchDriverName(r.driver_name, driverNameMap) || '';
      const driverKey = matchedDriverId || String(r.driver_name || '').toLowerCase().trim();
      const sid = String(r.session_id || '').trim();
      const lapNum = String(r.lap_number || '').trim();
      sessionId = sid || sessionId;

      const dedupKey = sid + '|' + driverKey + '|' + lapNum;
      if (dedupKey && existingKeys.has(dedupKey)) {
        skippedCount++;
        return;
      }
      if (dedupKey) existingKeys.add(dedupKey);

      const driverLabel = matchedDriverId || (r.driver_name || 'sconosciuto');
      lapsPerDriver[driverLabel] = (lapsPerDriver[driverLabel] || 0) + 1;

      rowsToInsert.push({
        team_id: me.team_id,
        session_id: sid,
        driver_id: matchedDriverId || null,
        driver_name_external: r.driver_name || null,
        is_vsd_driver: !!matchedDriverId,
        sim: r.sim || null,
        lap_number: r.lap_number !== undefined && r.lap_number !== '' ? Number(r.lap_number) : null,
        lap_time_ms: numOrEmpty(r.lap_time_ms),
        sector1_ms: numOrEmpty(r.sector1_ms),
        sector2_ms: numOrEmpty(r.sector2_ms),
        sector3_ms: numOrEmpty(r.sector3_ms),
        speed_min_kmh: numOrEmpty(r.speed_min_kmh),
        speed_max_kmh: numOrEmpty(r.speed_max_kmh),
        speed_avg_kmh: numOrEmpty(r.speed_avg_kmh),
        in_pits: String(r.in_pits || '').toUpperCase() === 'TRUE',
        yellow_flag: String(r.yellow_flag || '').toUpperCase() === 'TRUE',
        track_temp_c: numOrEmpty(r.track_temp_c),
        air_temp_c: numOrEmpty(r.air_temp_c),
        fuel_l: numOrEmpty(r.fuel_l),
        source_timestamp: r.timestamp_iso || null,
        imported_at: importedAt,
      });
    });

    if (rowsToInsert.length === 0) {
      return json({ ok: true, data: { imported: 0, vsd_matched: 0, external: 0, session_id: sessionId, skipped_duplicates: skippedCount, laps_per_driver: {} } });
    }

    const { error: insertErr } = await supabase.from('lap_data').insert(rowsToInsert);
    if (insertErr) return json({ ok: false, error: insertErr.message }, 400);

    const vsdCount = rowsToInsert.filter((r: any) => r.is_vsd_driver).length;

    return json({
      ok: true,
      data: {
        imported: rowsToInsert.length,
        vsd_matched: vsdCount,
        external: rowsToInsert.length - vsdCount,
        session_id: sessionId,
        skipped_duplicates: skippedCount,
        laps_per_driver: lapsPerDriver,
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
