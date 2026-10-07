// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — races.updatePoster (porting di apps-script/Races.js)
// ═══════════════════════════════════════════════════════════
// Logica di riferimento reale (handleRacesUpdatePoster):
//   - auth richiesto, STAFF-O-ADMIN (ctx.isStaff — gate PIÙ
//     PERMISSIVO di races.add/update/remove, che sono admin-only.
//     È così anche nel sorgente reale, non un errore di porting —
//     vedi nota in 015_races.sql).
//   - normalizza l'URL (Drive share link → diretto)
//   - stringa vuota ammessa per rimuovere la poster
//   - altrimenti deve iniziare con http:// o https://
//
// NOTA ARCHITETTURALE IMPORTANTE: la RLS su races consente UPDATE
// solo agli admin (current_driver_is_admin()), perché races.update
// "generico" è admin-only nel sorgente. Ma questo endpoint dedicato
// deve permettere anche allo STAFF di scrivere poster_url. Per questo
// qui, DOPO aver verificato applicativamente ruolo (staff/admin) e
// team di appartenenza della gara, la scrittura vera avviene con un
// client SERVICE ROLE che bypassa la RLS — non con il client con JWT
// dell'utente (che verrebbe bloccato dalla policy admin-only). L'
// isolamento multi-tenant che la RLS garantirebbe altrove va quindi
// rifatto qui a mano: si verifica che race_id appartenga al team del
// chiamante PRIMA di usare il client service role, così uno staff non
// può toccare gare di un altro team.
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// #468 — risoluzione chiamante: sessione Supabase OPPURE token legacy
// (Apps Script auth.verify). Nessun pilota reale ha una sessione Supabase:
// senza il ramo legacy queste funzioni rispondevano sempre "Auth richiesto".
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

async function resolveCaller(req: Request, payload: any): Promise<{ client: any; driverId: string; teamId: string; role: string } | null> {
  const url = Deno.env.get('SUPABASE_URL')!;
  const authHeader = req.headers.get('Authorization');
  if (authHeader) {
    const uc = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await uc.auth.getUser();
    if (user) {
      const { data: d } = await uc.from('drivers').select('id, team_id, role').eq('auth_user_id', user.id).maybeSingle();
      if (d) return { client: uc, driverId: d.id, teamId: d.team_id, role: d.role };
    }
  }
  const sc = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const lg = await resolveLegacyDriver(sc, payload?.legacy_token);
  if (lg) return { client: sc, driverId: lg.id, teamId: lg.team_id, role: lg.role };
  return null;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function normalizeDrivePosterUrl(url: string): string {
  if (!url) return url;
  const str = String(url).trim();
  if (!str) return str;

  let match = str.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return `https://lh3.googleusercontent.com/d/${match[1]}`;

  match = str.match(/drive\.google\.com\/(?:open|uc|thumbnail)\?(?:[^&]*&)*id=([a-zA-Z0-9_-]+)/);
  if (match) return `https://lh3.googleusercontent.com/d/${match[1]}`;

  if (str.includes('lh3.googleusercontent.com')) return str;

  return str;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const payload = await req.json().catch(() => ({}));
    const caller = await resolveCaller(req, payload);
    if (!caller) return json({ ok: false, error: 'Auth richiesto' }, 401);
    const supabase = caller.client;

    const raceId = payload?.race_id ? String(payload.race_id) : '';
    if (!raceId) return json({ ok: false, error: 'race_id mancante' }, 400);

    const posterUrl = normalizeDrivePosterUrl(String(payload.poster_url || '').trim());
    if (posterUrl && !/^https?:\/\//.test(posterUrl)) {
      return json({ ok: false, error: 'URL non valido: deve iniziare con http:// o https://' }, 400);
    }

    const { data: me, error: meErr } = await supabase
      .from('drivers')
      .select('team_id, role')
      .eq('id', caller.driverId)
      .maybeSingle();
    if (meErr) return json({ ok: false, error: meErr.message }, 400);
    if (!me) return json({ ok: false, error: 'Driver non collegato a questo account' }, 404);
    if (me.role !== 'staff' && me.role !== 'admin') {
      return json({ ok: false, error: 'Forbidden: solo staff o admin può modificare le poster' }, 403);
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Isolamento multi-tenant manuale: la gara deve appartenere al
    // team del chiamante (la RLS qui è bypassata dal service client).
    const { data: race, error: findErr } = await serviceClient
      .from('races')
      .select('race_id, team_id')
      .eq('race_id', raceId)
      .eq('team_id', me.team_id)
      .maybeSingle();
    if (findErr) return json({ ok: false, error: findErr.message }, 400);
    if (!race) return json({ ok: false, error: 'Gara non trovata: ' + raceId }, 404);

    const { error: updateErr } = await serviceClient
      .from('races')
      .update({ poster_url: posterUrl || null })
      .eq('race_id', raceId);
    if (updateErr) return json({ ok: false, error: updateErr.message }, 400);

    return json({ ok: true, data: { race_id: raceId, poster_url: posterUrl } });
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
