// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — races.updateGallery (porting di apps-script/Races.js)
// ═══════════════════════════════════════════════════════════
// Logica di riferimento reale (handleRacesUpdateGallery):
//   - auth richiesto, STAFF-O-ADMIN (ctx.isStaff — stesso gate di
//     updatePoster, più permissivo dell'admin-only di add/update/
//     remove — vedi nota in 015_races.sql)
//   - payload.gallery_urls: array; ogni URL trim+normalizzato
//     (Drive share link → diretto), deve iniziare con http(s)://
//   - massimo 20 immagini
//   - sovrascrive sempre l'intera lista (mai merge incrementale)
//
// DIFFERENZA rispetto al sorgente: là gallery_urls è una singola
// cella CSV (cleanUrls.join(',')); qui è un text[] nativo — stessa
// informazione, tipo più corretto (vedi 015_races.sql).
//
// Stesso pattern service-role di races-update-poster per bypassare
// la RLS admin-only e permettere la scrittura allo staff, con
// isolamento multi-tenant verificato a mano (team_id match) prima
// della scrittura.
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    const raceId = payload?.race_id ? String(payload.race_id) : '';
    if (!raceId) return json({ ok: false, error: 'race_id mancante' }, 400);

    const rawUrls = Array.isArray(payload?.gallery_urls) ? payload.gallery_urls : [];
    const cleanUrls: string[] = [];
    for (const raw of rawUrls) {
      const trimmed = String(raw ?? '').trim();
      if (!trimmed) continue;
      const normalized = normalizeDrivePosterUrl(trimmed);
      if (!/^https?:\/\//.test(normalized)) {
        return json({ ok: false, error: `URL non valido: "${trimmed}" deve iniziare con http:// o https://` }, 400);
      }
      cleanUrls.push(normalized);
    }
    if (cleanUrls.length > 20) {
      return json({ ok: false, error: 'Massimo 20 immagini per galleria' }, 400);
    }

    const { data: me, error: meErr } = await supabase
      .from('drivers')
      .select('team_id, role')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (meErr) return json({ ok: false, error: meErr.message }, 400);
    if (!me) return json({ ok: false, error: 'Driver non collegato a questo account' }, 404);
    if (me.role !== 'staff' && me.role !== 'admin') {
      return json({ ok: false, error: 'Forbidden: solo staff o admin può modificare la galleria' }, 403);
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

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
      .update({ gallery_urls: cleanUrls })
      .eq('race_id', raceId);
    if (updateErr) return json({ ok: false, error: updateErr.message }, 400);

    return json({ ok: true, data: { race_id: raceId, gallery_urls: cleanUrls } });
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
