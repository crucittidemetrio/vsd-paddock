// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — championships.add (chiude gap #387)
// ═══════════════════════════════════════════════════════════
// Il sistema reale (Apps Script) NON ha mai avuto un endpoint per
// creare campionati: i campionati venivano aggiunti a mano da chi
// aveva accesso all'editor Apps Script/al repo, con una funzione
// one-off (migrate_add_<slug>) — vedi commento in testa a
// cloud/schema/018_championships.sql, che anticipava esplicitamente
// questo gap ("un team abbonato al SaaS non ha accesso all'editor
// Apps Script/a questo repo, quindi gli servono endpoint
// championships.add/update self-service"). Questo file e
// championships-update chiudono quel gap.
//
// Gate: staff/admin, stesso pattern di championships-import-standings
// e championships-save-adjustments (già esistenti, stesso dominio).
//
// id: nel sistema reale è uno slug scelto a mano (es.
// "aciLmgt3Challenge2026"). Qui, essendo un endpoint self-service, lo
// generiamo automaticamente dal nome (slug ascii, lowercase, senza
// spazi) e garantiamo l'unicità SOLO all'interno del team chiamante
// — la PK è composita (team_id, id), quindi due team diversi possono
// avere lo stesso slug senza collisione (a differenza di races.race_id,
// che è un contatore condiviso fra tutti i team — vedi races-add).
//
// Fallback token legacy: nessun pilota/staff reale ha mai una sessione
// Supabase autentica, solo il token legacy Discord OAuth via Apps
// Script (stesso pattern #331/#358/#359/#392, vedi nota completa in
// best-laps-update/index.ts).
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

const VALID_STATUSES = ['draft', 'upcoming', 'active', 'completed'];

// Converte un link di condivisione Google Drive nel formato diretto
// embeddabile come <img src> — stessa logica usata per poster_url
// gare (aggiunta qui il 26/09/2026, bug banner ERA S3 grezzo).
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

function slugify(name: string): string {
  const ascii = String(name)
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // rimuove accenti
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return ascii || 'campionato';
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

    if (!me) {
      const legacyServiceClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const legacyMe = await resolveLegacyDriver(legacyServiceClient, payload?.legacy_token);
      if (legacyMe) {
        me = legacyMe;
        supabase = legacyServiceClient;
      }
    }

    if (!me) return json({ ok: false, error: 'Auth richiesto' }, 401);
    if (me.role !== 'staff' && me.role !== 'admin') {
      return json({ ok: false, error: 'Permessi insufficienti' }, 403);
    }

    const name = String(payload?.name || '').trim();
    if (!name) return json({ ok: false, error: 'Campo obbligatorio mancante o vuoto: name' }, 400);

    const status = payload?.status ? String(payload.status) : 'draft';
    if (!VALID_STATUSES.includes(status)) {
      return json({ ok: false, error: 'status non valido — atteso uno tra: ' + VALID_STATUSES.join(', ') }, 400);
    }

    if (payload?.start_date && isNaN(new Date(payload.start_date).getTime())) {
      return json({ ok: false, error: 'Campo start_date non parsabile come data valida' }, 400);
    }
    if (payload?.end_date && isNaN(new Date(payload.end_date).getTime())) {
      return json({ ok: false, error: 'Campo end_date non parsabile come data valida' }, 400);
    }

    // Slug base dal nome (o da payload.id se fornito esplicitamente),
    // poi -2/-3/... in caso di collisione nel team — la PK è composita
    // (team_id, id), quindi la scansione resta scoped al solo chiamante.
    const baseSlug = payload?.id ? slugify(String(payload.id)) : slugify(name);
    const { data: existingIds } = await supabase
      .from('championships')
      .select('id')
      .eq('team_id', me.team_id);
    const taken = new Set((existingIds ?? []).map((r: any) => r.id));
    let finalId = baseSlug;
    let suffix = 2;
    while (taken.has(finalId)) {
      finalId = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    const insertRow = {
      id: finalId,
      team_id: me.team_id,
      name,
      sim: payload?.sim ? String(payload.sim) : null,
      season: payload?.season ? String(payload.season) : null,
      status,
      format: payload?.format ? String(payload.format) : null,
      start_date: payload?.start_date ? new Date(payload.start_date).toISOString().slice(0, 10) : null,
      end_date: payload?.end_date ? new Date(payload.end_date).toISOString().slice(0, 10) : null,
      notes: payload?.notes ? String(payload.notes) : null,
      banner_url: payload?.banner_url ? normalizeDrivePosterUrl(String(payload.banner_url)) : null,
    };

    const { data, error } = await supabase.from('championships').insert(insertRow).select().maybeSingle();
    if (error) return json({ ok: false, error: error.message }, 400);

    return json({ ok: true, data: { championship: data } });
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
