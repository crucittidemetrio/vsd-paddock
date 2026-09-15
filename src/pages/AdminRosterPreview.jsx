import { useCallback, useEffect, useState } from 'react';
import styles from './AdminRosterPreview.module.css';

// ═══════════════════════════════════════════════════════════
// VSD-Paddock — Roster Preview (staff-only)
// ═══════════════════════════════════════════════════════════
// Pagina di TEST per validare il porting Roster su Supabase (#177)
// prima di qualunque cutover reale. Non tocca in alcun modo il
// backend Apps Script/Google Sheet che serve il resto del sito: usa
// un login Discord SEPARATO (Supabase Auth), un token separato
// (sessionStorage, non condiviso con AuthContext) e chiama solo le 3
// Edge Function roster-*. Le scritture qui (Aggiorna il mio profilo)
// finiscono SOLO nel database Supabase — non si propagano al foglio
// Google Sheet Drivers finché non esiste una sincronizzazione
// esplicita, quindi le due copie possono divergere durante il test.
// ═══════════════════════════════════════════════════════════

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const FUNCTIONS_BASE = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1` : null;
const SESSION_KEY = 'vsd_preview_sb_session';

function decodeJwtPayload(token) {
  try {
    const part = token.split('.')[1];
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decodeURIComponent(escape(json)));
  } catch {
    return null;
  }
}

function readStoredSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function AdminRosterPreview() {
  const [session, setSession] = useState(() => readStoredSession());
  const [rosterResult, setRosterResult] = useState(null);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterError, setRosterError] = useState(null);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [includeRemoved, setIncludeRemoved] = useState(false);

  const [lookupId, setLookupId] = useState('');
  const [lookupResult, setLookupResult] = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState(null);

  const [form, setForm] = useState({ bio: '', instagram: '', facebook: '', roster_track: '' });
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveResult, setSaveResult] = useState(null);
  const [saveError, setSaveError] = useState(null);

  // ── Cattura il token dopo il redirect di Discord OAuth ──
  useEffect(() => {
    if (!window.location.hash.includes('access_token')) return;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const access_token = params.get('access_token');
    if (access_token) {
      const payload = decodeJwtPayload(access_token);
      const next = { access_token, user: payload };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
      setSession(next);
    }
    // Rimuove il token dalla URL/cronologia del browser.
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  const callFn = useCallback(async (name, body) => {
    const res = await fetch(`${FUNCTIONS_BASE}/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify(body || {}),
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
  }, [session]);

  function login() {
    const redirectTo = window.location.origin + window.location.pathname;
    window.location.href = `${SUPABASE_URL}/auth/v1/authorize?provider=discord&redirect_to=${encodeURIComponent(redirectTo)}`;
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    setSession(null);
    setRosterResult(null);
    setLookupResult(null);
    setSaveResult(null);
  }

  async function loadRoster() {
    setRosterLoading(true);
    setRosterError(null);
    const { status, json } = await callFn('roster-list', { includeInactive, includeRemoved });
    setRosterLoading(false);
    if (status !== 200 || !json?.ok) {
      setRosterError(json?.error || `Errore ${status}`);
      return;
    }
    setRosterResult(json.data);
  }

  async function lookupDriver(e) {
    e.preventDefault();
    if (!lookupId.trim()) return;
    setLookupLoading(true);
    setLookupError(null);
    const { status, json } = await callFn('roster-get', { driver_id: lookupId.trim() });
    setLookupLoading(false);
    if (status !== 200 || !json?.ok) {
      setLookupError(json?.error || `Errore ${status}`);
      setLookupResult(null);
      return;
    }
    setLookupResult(json.data.driver);
  }

  async function saveSelf(e) {
    e.preventDefault();
    setSaveLoading(true);
    setSaveError(null);
    const payload = {};
    for (const [k, v] of Object.entries(form)) {
      if (v !== '') payload[k] = v;
    }
    const { status, json } = await callFn('roster-update-self', payload);
    setSaveLoading(false);
    if (status !== 200 || !json?.ok) {
      setSaveError(json?.error || `Errore ${status}`);
      setSaveResult(null);
      return;
    }
    setSaveResult(json.data.driver);
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return (
      <div className={styles.container}>
        <div className={styles.errorBox}>
          Config mancante: imposta <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> in .env.local.
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>STAFF ONLY · SUPABASE PREVIEW</div>
        <h1 className={styles.title}>Roster Preview</h1>
        <p className={styles.sub}>
          Pagina di test per il nuovo backend Supabase (#177). Login Discord separato dal sito, dati reali ma
          scritture isolate: quello che modifichi qui NON si sincronizza col foglio Google Drivers usato dal
          sito pubblico finché la migrazione non è completa.
        </p>
      </header>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Sessione Supabase</h2>
        {session ? (
          <div className={styles.sessionRow}>
            <div className={styles.sessionInfo}>
              <span className={styles.badgeOk}>Collegato</span>
              <span className={styles.sessionUser}>
                {session.user?.user_metadata?.full_name || session.user?.email || session.user?.sub}
              </span>
            </div>
            <button className={styles.btnSecondary} onClick={logout}>Disconnetti (solo test)</button>
          </div>
        ) : (
          <div className={styles.sessionRow}>
            <p className={styles.emptyText}>Nessuna sessione di test attiva.</p>
            <button className={styles.btnPrimary} onClick={login}>Login con Discord (test)</button>
          </div>
        )}
      </section>

      {session && (
        <>
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>roster.list</h2>
            <div className={styles.filterRow}>
              <label className={styles.checkboxLabel}>
                <input type="checkbox" checked={includeInactive} onChange={e => setIncludeInactive(e.target.checked)} />
                Includi inattivi
              </label>
              <label className={styles.checkboxLabel}>
                <input type="checkbox" checked={includeRemoved} onChange={e => setIncludeRemoved(e.target.checked)} />
                Includi rimossi
              </label>
              <button className={styles.btnPrimary} onClick={loadRoster} disabled={rosterLoading}>
                {rosterLoading ? 'Carico…' : 'Carica roster'}
              </button>
            </div>
            {rosterError && <div className={styles.errorBox}>{rosterError}</div>}
            {rosterResult && (
              <>
                <p className={styles.resultMeta}>{rosterResult.count} piloti</p>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Codice</th>
                        <th>Nome</th>
                        <th>Status</th>
                        <th>Ruolo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rosterResult.drivers.map(d => (
                        <tr key={d.driver_code}>
                          <td>{d.driver_code}</td>
                          <td>{d.display_name}</td>
                          <td>{d.status}</td>
                          <td>{d.role}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>roster.get</h2>
            <form className={styles.filterRow} onSubmit={lookupDriver}>
              <input
                className={styles.textInput}
                placeholder="es. VSD005"
                value={lookupId}
                onChange={e => setLookupId(e.target.value)}
              />
              <button className={styles.btnPrimary} type="submit" disabled={lookupLoading}>
                {lookupLoading ? 'Cerco…' : 'Cerca'}
              </button>
            </form>
            {lookupError && <div className={styles.errorBox}>{lookupError}</div>}
            {lookupResult && (
              <pre className={styles.jsonBox}>{JSON.stringify(lookupResult, null, 2)}</pre>
            )}
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>roster.updateSelf</h2>
            <p className={styles.emptyText}>Aggiorna il tuo profilo collegato (bio, instagram, facebook, roster_track).</p>
            <form className={styles.form} onSubmit={saveSelf}>
              <label className={styles.formLabel}>
                Bio
                <textarea
                  className={styles.textArea}
                  value={form.bio}
                  onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                  maxLength={500}
                />
              </label>
              <label className={styles.formLabel}>
                Instagram
                <input
                  className={styles.textInput}
                  value={form.instagram}
                  onChange={e => setForm(f => ({ ...f, instagram: e.target.value }))}
                />
              </label>
              <label className={styles.formLabel}>
                Facebook
                <input
                  className={styles.textInput}
                  value={form.facebook}
                  onChange={e => setForm(f => ({ ...f, facebook: e.target.value }))}
                />
              </label>
              <label className={styles.formLabel}>
                Roster track
                <select
                  className={styles.textInput}
                  value={form.roster_track}
                  onChange={e => setForm(f => ({ ...f, roster_track: e.target.value }))}
                >
                  <option value="">(non modificare)</option>
                  <option value="competitivo">Competitivo</option>
                  <option value="amatoriale">Amatoriale</option>
                </select>
              </label>
              <button className={styles.btnPrimary} type="submit" disabled={saveLoading}>
                {saveLoading ? 'Salvo…' : 'Salva'}
              </button>
            </form>
            {saveError && <div className={styles.errorBox}>{saveError}</div>}
            {saveResult && (
              <pre className={styles.jsonBox}>{JSON.stringify(saveResult, null, 2)}</pre>
            )}
          </section>
        </>
      )}
    </div>
  );
}
