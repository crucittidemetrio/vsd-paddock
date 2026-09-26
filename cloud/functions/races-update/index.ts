// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — races.update (porting di apps-script/Races.js)
// ═══════════════════════════════════════════════════════════
// Logica di riferimento reale (handleRacesUpdate):
//   - auth richiesto, SOLO ADMIN (_esIsStaff_ reale è admin-only)
//   - race_id obbligatorio, race_id/created_at MAI modificabili
//   - solo i campi presenti nel payload vengono aggiornati
//   - logAudit_() sulla modifica — QUI OMESSO: il dominio AuditLog
//     non è ancora portato in cloud/ (Fase 3, #256). Gap noto e
//     documentato, non un dimenticanza.
//
// DIFFERENZE deliberate:
//   - team_id escluso dai campi modificabili (nel sorgente non esiste
//     questo concetto, ma qui non deve mai poter essere cambiato).
//   - gallery_urls escluso: nel sorgente è una singola colonna testo
//     CSV, aggiornabile anche da qui in teoria; qui è un text[]
//     nativo con normalizzazione URL dedicata — va sempre e solo
//     attraverso races-update-gallery per evitare di scrivere un
//     valore raw incompatibile col tipo colonna.
//   - status validato contro l'enum del check constraint, con
//     messaggio d'errore chiaro invece di un errore DB generico.
//
// race_number aggiunta come campo editabile qui (migrazione
// 019_races_race_number.sql) — gap scoperto durante il porting di
// Standings.js: la colonna esiste nel foglio reale ma era stata
// omessa nel porting iniziale di Races. Il sorgente reale la scrive
// solo tramite races.update generico (mai in races.add), quindi
// races-update è l'unico posto giusto per aggiungerla.
//
// Fallback token legacy (aggiunto 26/09/2026, bug "Cambia Stato" →
// Auth richiesto): nessuno staff reale ha mai una sessione Supabase
// autentica, solo il token legacy Discord OAuth via Apps Script —
// stesso pattern già applicato a championships-update, best-laps-update
// e tanti altri domini (#331/#358/#359/#392/#422). Qui mancava, ed era
// l'unico endpoint del dominio Races rimasto scoperto (races-add ha
// lo stesso gap, races-get/races-list erano già stati corretti).
// Quando si passa dal fallback (service role, bypassa la RLS), lo
// scoping team_id va aggiunto esplicitamente sulla UPDATE.
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

// Converte un link di condivisione Google Drive nel formato diretto
// embeddabile come <img src> — stessa logica di races-add e
// races-update-poster (aggiunta qui il 26/09/2026, bug ERA S3).
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

const VALID_STATUSES = ['scheduled', 'live', 'completed', 'cancelled'];
const EDITABLE_FIELDS = [
  'sim', 'round', 'race_name', 'track_id', 'car_id', 'date', 'duration_minutes',
  'format', 'status', 'broadcast_url', 'notes', 'weather', 'event_type',
  'championship_id', 'poster_url', 'race_number',
];

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

    const raceId = payload?.race_id ? String(payload.race_id) : '';
    if (!raceId) return json({ ok: false, error: "Campo race_id obbligatorio per l'aggiornamento" }, 400);

    if (payload?.date !== undefined && isNaN(new Date(payload.date).getTime())) {
      return json({ ok: false, error: 'Campo date non parsabile come data valida' }, 400);
    }
    if (payload?.status !== undefined && !VALID_STATUSES.includes(String(payload.status))) {
      return json({ ok: false, error: 'status non valido — atteso uno tra: ' + VALID_STATUSES.join(', ') }, 400);
    }

    const updates: Record<string, unknown> = {};
    const updatedFields: string[] = [];
    for (const field of EDITABLE_FIELDS) {
      if (!(field in (payload ?? {}))) continue;
      if (field === 'date') {
        updates[field] = new Date(payload[field]).toISOString();
      } else if (field === 'duration_minutes') {
        updates[field] = Number(payload[field]);
      } else if (field === 'race_number') {
        updates[field] = payload[field] === null || payload[field] === '' ? null : Number(payload[field]);
      } else if (field === 'poster_url') {
        updates[field] = payload[field] === null || payload[field] === '' ? null : normalizeDrivePosterUrl(String(payload[field]));
      } else {
        updates[field] = payload[field] === null || payload[field] === '' ? null : String(payload[field]);
      }
      updatedFields.push(field);
    }

    if (updatedFields.length === 0) {
      return json({ ok: true, data: { race_id: raceId, updated: [] } });
    }

    const { data, error } = await supabase
      .from('races')
      .update(updates)
      .eq('race_id', raceId)
      .eq('team_id', me.team_id)
      .select()
      .maybeSingle();

    if (error) return json({ ok: false, error: error.message }, 400);
    if (!data) return json({ ok: false, error: 'Gara non trovata: ' + raceId }, 404);

    return json({ ok: true, data: { race_id: raceId, updated: updatedFields } });
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
