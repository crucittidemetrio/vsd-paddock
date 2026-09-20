// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — push.subscribe (porting fedele di
// apps-script/Push.js, handlePushSubscribe)
// ═══════════════════════════════════════════════════════════
// Auth: login richiesto (qualsiasi pilota). Upsert per
// (driver_id, endpoint) via vincolo DB unique — un pilota può avere
// più device (telefono + desktop). DEVIAZIONE: upsert via constraint
// DB invece della scansione manuale delle righe del sorgente, stesso
// esito, più robusto.
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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
      .select('id, team_id')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (meErr) return json({ ok: false, error: meErr.message }, 400);
    if (!me) return json({ ok: false, error: 'Driver non collegato a questo account' }, 404);

    const payload = await req.json().catch(() => ({}));
    const endpoint = String(payload?.endpoint || '').trim();
    const p256dh = payload?.keys?.p256dh;
    const authKey = payload?.keys?.auth;
    if (!endpoint || !p256dh || !authKey) {
      return json({ ok: false, error: 'endpoint e keys.p256dh/keys.auth sono obbligatori' }, 400);
    }

    const { data: existing } = await supabase
      .from('push_subscriptions')
      .select('id')
      .eq('driver_id', me.id)
      .eq('endpoint', endpoint)
      .maybeSingle();
    if (existing) return json({ ok: true, data: { subscribed: true, already_existed: true } });

    const { error } = await supabase
      .from('push_subscriptions')
      .insert({
        team_id: me.team_id,
        driver_id: me.id,
        endpoint,
        p256dh,
        auth_key: authKey,
        user_agent: String(payload?.user_agent || '') || null,
      });
    if (error) return json({ ok: false, error: error.message }, 400);

    return json({ ok: true, data: { subscribed: true, already_existed: false } });
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
