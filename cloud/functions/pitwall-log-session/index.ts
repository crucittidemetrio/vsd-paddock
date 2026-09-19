// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — pitwall.logSession (porting di apps-script/PitwallSessions.js)
// ═══════════════════════════════════════════════════════════
// Logica di riferimento reale (handlePitwallLogSession + importPitwallSession_):
//   - auth richiesto, SOLO staff/admin (chi gestisce il bridge scrive
//     per tutta la griglia, non solo per sé)
//   - session_id obbligatorio, payload.drivers non vuoto
//   - per ogni driver: risolve driver_name → driver_id (SOLO nel team
//     del chiamante) con lo stesso algoritmo di matchDriverName_
//     (match esatto, poi "nome i.", poi prefisso cognome da real_name)
//   - dedup per (session_id, driver_key): se esiste già una riga per
//     quella sessione+pilota, la sovrascrive (bridge riavviato sulla
//     stessa sessione) invece di duplicare
//
// DIFFERENZA dal sistema reale: là il fuzzy-match gira su TUTTI i
// driver del foglio; qui è ristretto al team del chiamante (stesso
// principio di isolamento multi-tenant usato in best-laps-add per
// driver_code).
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function matchDriverName(externalName: unknown, matchMap: Record<string, string>): string | null {
  if (!externalName) return null;
  const name = String(externalName).toLowerCase().trim();

  // 1. Match esatto.
  if (matchMap[name]) return matchMap[name];

  const parts = name.split(/\s+/);

  // 2a. Nome esterno già in forma "nome i.".
  if (parts.length === 2 && /^[a-z]\.?$/.test(parts[1])) {
    const variant = `${parts[0]} ${parts[1].charAt(0)}.`;
    if (matchMap[variant]) return matchMap[variant];
  }

  // 2b. Nome esterno di 2 parole, confronto per prefisso contro il
  // cognome vero (chiavi a 2 parole da real_name).
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

  // 3. Nome esterno di una sola parola.
  if (parts.length === 1 && matchMap[parts[0]]) {
    return matchMap[parts[0]];
  }

  return null;
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
    const sessionId = String(payload?.session_id || '').trim();
    if (!sessionId) return json({ ok: false, error: 'session_id mancante' }, 400);
    if (!Array.isArray(payload?.drivers) || payload.drivers.length === 0) {
      return json({ ok: false, error: 'Nessun pilota nel payload' }, 400);
    }

    const { data: me, error: meErr } = await supabase
      .from('drivers')
      .select('team_id, role')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (meErr) return json({ ok: false, error: meErr.message }, 400);
    if (!me) return json({ ok: false, error: 'Driver non collegato a questo account' }, 404);
    if (me.role !== 'staff' && me.role !== 'admin') {
      return json({ ok: false, error: 'Permessi insufficienti' }, 403);
    }

    // Mappa nome→driver_id, ristretta al team del chiamante.
    const { data: teamDrivers, error: driversErr } = await supabase
      .from('drivers')
      .select('id, display_name, real_name')
      .eq('team_id', me.team_id);
    if (driversErr) return json({ ok: false, error: driversErr.message }, 400);

    const matchMap: Record<string, string> = {};
    (teamDrivers ?? []).forEach((d: any) => {
      if (d.display_name) {
        const key = String(d.display_name).toLowerCase().trim();
        if (!matchMap[key]) matchMap[key] = d.id;
      }
      if (d.real_name) {
        const rkey = String(d.real_name).toLowerCase().trim();
        if (!matchMap[rkey]) matchMap[rkey] = d.id;
      }
    });

    // Righe esistenti per questa sessione, per dedup (chiave: driver_id
    // se matchato, altrimenti driver_name_external lowercased).
    const { data: existingRows, error: existingErr } = await supabase
      .from('pitwall_sessions')
      .select('id, driver_id, driver_name_external')
      .eq('team_id', me.team_id)
      .eq('session_id', sessionId);
    if (existingErr) return json({ ok: false, error: existingErr.message }, 400);

    const existingByKey: Record<string, string> = {};
    (existingRows ?? []).forEach((r: any) => {
      const key = r.driver_id || String(r.driver_name_external || '').toLowerCase().trim();
      if (key) existingByKey[key] = r.id;
    });

    const capturedAt = payload.captured_at || new Date().toISOString();
    const trackName = payload.track_name || null;
    const sim = payload.sim || 'LMU';
    const sessionType = payload.session_type !== undefined ? Number(payload.session_type) : null;

    const newRows: Record<string, unknown>[] = [];
    const updates: { id: string; values: Record<string, unknown> }[] = [];
    let vsdCount = 0;

    for (const d of payload.drivers as any[]) {
      const matchedDriverId = matchDriverName(d.driver_name, matchMap);
      const driverKey = matchedDriverId || String(d.driver_name || '').toLowerCase().trim();
      if (!driverKey) continue;
      if (matchedDriverId) vsdCount++;

      const row = {
        team_id: me.team_id,
        session_id: sessionId,
        captured_at: capturedAt,
        track_name: trackName,
        sim,
        session_type: sessionType,
        driver_id: matchedDriverId,
        driver_name_external: d.driver_name || null,
        is_vsd_driver: Boolean(matchedDriverId),
        vehicle_name: d.vehicle_name || null,
        vehicle_class: d.vehicle_class || null,
        best_lap_time_ms: d.best_lap_time_ms !== undefined && d.best_lap_time_ms !== null ? Number(d.best_lap_time_ms) : null,
        laps_completed: d.laps !== undefined ? Number(d.laps) : null,
        final_place: d.final_place !== undefined ? Number(d.final_place) : null,
        updated_at: new Date().toISOString(),
      };

      if (existingByKey[driverKey]) {
        updates.push({ id: existingByKey[driverKey], values: row });
      } else {
        newRows.push(row);
      }
    }

    for (const u of updates) {
      const { error } = await supabase.from('pitwall_sessions').update(u.values).eq('id', u.id);
      if (error) return json({ ok: false, error: error.message }, 400);
    }

    if (newRows.length > 0) {
      const { error } = await supabase.from('pitwall_sessions').insert(newRows);
      if (error) return json({ ok: false, error: error.message }, 400);
    }

    const total = newRows.length + updates.length;

    return json({
      ok: true,
      data: {
        session_id: sessionId,
        imported: total,
        new: newRows.length,
        updated: updates.length,
        vsd_matched: vsdCount,
        external: total - vsdCount,
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
