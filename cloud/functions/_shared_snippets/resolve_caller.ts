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
