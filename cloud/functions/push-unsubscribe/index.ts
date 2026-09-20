// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — push.unsubscribe (porting fedele di
// apps-script/Push.js, handlePushUnsubscribe)
// ═══════════════════════════════════════════════════════════
// Auth: login richiesto. Rimuove la subscription del pilota loggato
// per l'endpoint indicato (device/browser corrente).
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
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (meErr) return json({ ok: false, error: meErr.message }, 400);
    if (!me) return json({ ok: false, error: 'Driver non collegato a questo account' }, 404);

    const payload = await req.json().catch(() => ({}));
    const endpoint = String(payload?.endpoint || '').trim();
    if (!endpoint) return json({ ok: false, error: 'endpoint obbligatorio' }, 400);

    const { data, error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('driver_id', me.id)
      .eq('endpoint', endpoint)
      .select();
    if (error) return json({ ok: false, error: error.message }, 400);

    if (!data || data.length === 0) {
      return json({ ok: true, data: { unsubscribed: true, note: 'nessuna subscription trovata (già rimossa?)' } });
    }
    return json({ ok: true, data: { unsubscribed: true } });
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
