// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — races.add (porting di apps-script/Races.js)
// ═══════════════════════════════════════════════════════════
// Logica di riferimento reale (handleRacesAdd):
//   - auth richiesto, SOLO ADMIN (_esIsStaff_ reale è admin-only,
//     nonostante il nome — vedi nota in 015_races.sql)
//   - campi obbligatori: race_name, sim, date, format, status
//   - date deve essere parsabile
//   - race_id generato: scan di RACE(\d+), max+1, zero-padded a 3 cifre
//
// DIFFERENZE deliberate rispetto al sistema reale:
//   - Validazione status contro l'enum del check constraint (il
//     sorgente reale accetta qualunque stringa non vuota) — coerente
//     con lo schema Postgres, messaggio d'errore più chiaro di un
//     generico errore DB.
//   - Generazione race_id: qui il PK è condiviso da TUTTI i team (non
//     solo VSD, vedi ADR multi-tenant), quindi lo scan del massimo
//     usa un client SERVICE ROLE che bypassa la RLS per vedere le
//     race_id di TUTTI i team, non solo del chiamante — altrimenti
//     due team diversi genererebbero entrambi "RACE001" e la seconda
//     insert fallirebbe per collisione di primary key. L'INSERT vero
//     e proprio invece usa il client con JWT dell'utente, così la RLS
//     (team_id + admin) resta comunque una seconda barriera.
//   - Campi opzionali assenti: qui vengono scritti come null (non ''
//     come nel foglio reale) — coerente con l'indice parziale
//     `where championship_id is not null` in 015_races.sql e con lo
//     stile del resto di cloud/ (es. best-laps-add).
//   - poster_url QUI VIENE normalizzato (drive share link → diretto),
//     stessa funzione di races-update-poster — cambio deciso il
//     26/09/2026 dopo il bug ERA S3 (14 gare create con link Drive
//     grezzo come poster_url, immagine non renderizzabile): fedeltà
//     al sorgente legacy va bene finché non produce un bug visibile
//     per lo staff. Ora races.add normalizza sempre in scrittura.
//   - Fallback token legacy (aggiunto 26/09/2026 insieme a races-update,
//     bug "Cambia Stato" → Auth richiesto): stesso pattern del resto
//     del sito, nessuno staff reale ha una sessione Supabase autentica.
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

// Converte un link di condivisione Google Drive (.../file/d/{id}/view
// o ...?id={id}) nel formato diretto embeddabile come <img src>.
// Stessa logica di races-update-poster/index.ts.
function normalizeDrivePosterUrl(url: string): string {
  if (!url) return url;
  const str = String(url).trim();
  if (!str) return str;
  let match = str.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return `https://lh3.googleusercontent.com/d/${match[1]}`;
  match = str.match(/drive\.google\.com\/(?:open|uc|thumbnail)\?(?:[^&]*&)*id=([a-zA-Z0-9_-]+)/);
  if (match) return `https://lh3.googleusercontent.com/d/${match[1]}`;
  return str;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const REQUIRED_FIELDS = ['race_name', 'sim', 'date', 'format', 'status'];
const VALID_STATUSES = ['scheduled', 'live', 'completed', 'cancelled'];
const RACE_ID_RE = /^RACE(\d+)$/;

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
          .select('id, team_id, role')
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
    if (me.role !== 'admin') {
      return json({ ok: false, error: 'Permessi insufficienti' }, 403);
    }

    for (const field of REQUIRED_FIELDS) {
      const v = payload?.[field];
      if (v === undefined || v === null || String(v).trim() === '') {
        return json({ ok: false, error: `Campo obbligatorio mancante o vuoto: ${field}` }, 400);
      }
    }
    if (isNaN(new Date(payload.date).getTime())) {
      return json({ ok: false, error: 'Campo date non parsabile come data valida' }, 400);
    }
    if (!VALID_STATUSES.includes(String(payload.status))) {
      return json({ ok: false, error: 'status non valido — atteso uno tra: ' + VALID_STATUSES.join(', ') }, 400);
    }

    // Scan globale (tutti i team) per garantire l'unicità del PK
    // condiviso race_id — vedi nota in testa al file.
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: allIds, error: scanErr } = await serviceClient.from('races').select('race_id');
    if (scanErr) return json({ ok: false, error: scanErr.message }, 400);

    let maxId = 0;
    for (const row of allIds ?? []) {
      const m = String((row as any).race_id).match(RACE_ID_RE);
      if (m) {
        const num = parseInt(m[1], 10);
        if (num > maxId) maxId = num;
      }
    }
    const newRaceId = 'RACE' + String(maxId + 1).padStart(3, '0');

    const insertRow = {
      race_id: newRaceId,
      team_id: me.team_id,
      sim: String(payload.sim),
      round: payload.round ? String(payload.round) : null,
      race_name: String(payload.race_name),
      track_id: payload.track_id ? String(payload.track_id) : null,
      car_id: payload.car_id ? String(payload.car_id) : null,
      date: new Date(payload.date).toISOString(),
      duration_minutes: payload.duration_minutes !== undefined && payload.duration_minutes !== null
        ? Number(payload.duration_minutes) : 0,
      format: String(payload.format),
      status: String(payload.status),
      broadcast_url: payload.broadcast_url ? String(payload.broadcast_url) : null,
      notes: payload.notes ? String(payload.notes) : null,
      weather: payload.weather ? String(payload.weather) : null,
      event_type: payload.event_type ? String(payload.event_type) : null,
      championship_id: payload.championship_id ? String(payload.championship_id) : null,
      poster_url: payload.poster_url ? normalizeDrivePosterUrl(String(payload.poster_url)) : null,
    };

    const { data, error } = await supabase.from('races').insert(insertRow).select().maybeSingle();
    if (error) return json({ ok: false, error: error.message }, 400);

    return json({ ok: true, data: { race_id: newRaceId, race: data } });
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
