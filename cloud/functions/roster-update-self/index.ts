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
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

    // driver_id sempre dal contesto (auth_user_id del chiamante), mai dal payload.
    const { data, error } = await supabase
      .from('drivers')
      .update(updates)
      .eq('auth_user_id', user.id)
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
