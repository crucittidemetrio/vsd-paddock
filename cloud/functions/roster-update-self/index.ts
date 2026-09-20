// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — roster.updateSelf (porting di apps-script/Roster.js)
// ═══════════════════════════════════════════════════════════
// Logica di riferimento reale (handleRosterUpdateSelf in Roster.js):
//   - auth richiesto
//   - driver_id SEMPRE dal contesto (chi chiama), MAI dal payload —
//     qui il "contesto" è l'utente autenticato: si risolve la sua
//     riga drivers via auth_user_id = auth.uid(), non via un id
//     passato dal client.
//   - whitelist campi auto-modificabili: bio, instagram, facebook,
//     roster_track
//   - campi testo troncati a 500 caratteri
//   - roster_track non valido → ignorato silenziosamente, non blocca
//     gli altri campi
//
// La whitelist è applicata due volte, per design (difesa in
// profondità, stesso pattern della migration 004): qui a livello
// applicativo (solo questi 4 campi vengono letti dal payload), e a
// livello Postgres via column-level GRANT UPDATE (bio, instagram,
// facebook, roster_track) — anche un bug qui non permetterebbe di
// scrivere role/status/can_message perché il DB stesso lo rifiuta.
//
// FIX #360 (20/09/2026 — segnalato da Demetrio: "ho cambiato da
// Roster Competitivo a Roster Amatoriale ma non lo cambia"): questa
// funzione richiedeva SEMPRE una sessione Supabase reale, esattamente
// il gap #331/#358/#359 — ma qui era PEGGIO in silenzio, perché
// roster.updateSelf era stato deliberatamente escluso dal cutover
// #329 per questo stesso motivo (nessun fallback), quindi il salvataggio
// "Modifica profilo" andava SEMPRE al vecchio backend Apps Script
// (scrittura sul foglio Google), mentre roster.get/roster.list (letti
// dalla stessa pagina per mostrare il profilo) leggono da Supabase fin
// da #329 — il salvataggio sembrava non avere effetto per QUALSIASI
// pilota reale, non solo Demetrio, dal giorno del cutover Roster.
// Stesso resolveLegacyDriver di cloud/functions/social-manager, ma qui
// il fallback SCRIVE (non solo legge): se risolto, l'update avviene
// via client service-role, scoping esplicito su driver_code invece che
// su auth_user_id.
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

const ROSTER_SELF_EDITABLE_FIELDS = ['bio', 'instagram', 'facebook', 'roster_track'];
const ROSTER_TRACK_VALUES = ['competitivo', 'amatoriale'];
const TEXT_FIELDS = ['bio', 'instagram', 'facebook'];

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

    const updates: Record<string, unknown> = {};
    for (const field of ROSTER_SELF_EDITABLE_FIELDS) {
      if (!(field in payload)) continue;
      let value = payload[field];

      if (field === 'roster_track') {
        if (ROSTER_TRACK_VALUES.includes(value)) {
          updates[field] = value;
        }
        continue;
      }

      if (TEXT_FIELDS.includes(field)) {
        value = value === null || value === undefined ? '' : String(value).slice(0, 500);
      }

      updates[field] = value;
    }

    if (Object.keys(updates).length === 0) {
      return json({ ok: false, error: 'Nessun campo valido da aggiornare' }, 400);
    }

    updates.updated_at = new Date().toISOString();

    // driver_id sempre dal contesto (me.id, risolto sopra da sessione reale
    // o da fallback legacy), mai dal payload.
    const { data, error } = await supabase
      .from('drivers')
      .update(updates)
      .eq('id', me.id)
      .select()
      .maybeSingle();

    if (error) return json({ ok: false, error: error.message }, 400);
    if (!data) return json({ ok: false, error: 'Driver non collegato a questo account' }, 404);

    return json({ ok: true, data: { driver: data } });
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
