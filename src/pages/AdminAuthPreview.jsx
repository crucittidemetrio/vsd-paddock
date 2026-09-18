import { useEffect, useState } from 'react';
import styles from './AdminRosterPreview.module.css';
import {
  signInWithDiscord, signOutSupabase, getSupabaseSession,
  onSupabaseAuthStateChange, resolveDriverAndTier, extractDiscordProfile,
} from '../api/supabaseAuth';
import { supabaseConfigured } from '../api/supabaseClient';

// ═══════════════════════════════════════════════════════════
// VSD-Paddock — Auth Preview (staff-only) — #264/#327
// ═══════════════════════════════════════════════════════════
// Pagina di TEST per validare il nuovo modulo di auth reale
// (src/api/supabaseAuth.js), stesso principio isolato di
// AdminRosterPreview/AdminCalendarPreview (#177/#178): login Discord
// via Supabase Auth SDK vero (non più fetch manuale + parsing hash),
// sessione persistita da supabase-js stesso (localStorage), NON
// condivisa con AuthContext.jsx reale — il sito pubblico continua a
// usare il token Apps Script finché #329 non fa il cutover vero.
//
// Verifica: login, risoluzione driver+tier dalla riga `drivers`
// (RLS self-select), profilo Discord da user_metadata, logout,
// persistenza sessione dopo reload pagina (autoRefreshToken).
// ═══════════════════════════════════════════════════════════

export default function AdminAuthPreview() {
  const [session, setSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [driverInfo, setDriverInfo] = useState(null);
  const [resolveError, setResolveError] = useState(null);
  const [resolving, setResolving] = useState(false);
  const [loginError, setLoginError] = useState(null);

  // ── Carica la sessione corrente al mount + sottoscrive i cambi ──
  useEffect(() => {
    let cancelled = false;
    getSupabaseSession().then(s => {
      if (!cancelled) {
        setSession(s);
        setLoadingSession(false);
      }
    });
    const unsubscribe = onSupabaseAuthStateChange(s => {
      setSession(s);
      setLoadingSession(false);
    });
    return () => { cancelled = true; unsubscribe(); };
  }, []);

  // ── Risolve driver+tier ogni volta che cambia la sessione ──
  useEffect(() => {
    if (!session) {
      setDriverInfo(null);
      return;
    }
    let cancelled = false;
    setResolving(true);
    setResolveError(null);
    resolveDriverAndTier(session)
      .then(info => { if (!cancelled) setDriverInfo(info); })
      .catch(err => { if (!cancelled) setResolveError(err.message || String(err)); })
      .finally(() => { if (!cancelled) setResolving(false); });
    return () => { cancelled = true; };
  }, [session]);

  async function login() {
    setLoginError(null);
    try {
      await signInWithDiscord();
    } catch (err) {
      setLoginError(err.message || String(err));
    }
  }

  async function logout() {
    await signOutSupabase();
    setSession(null);
    setDriverInfo(null);
  }

  if (!supabaseConfigured) {
    return (
      <div className={styles.container}>
        <div className={styles.errorBox}>
          Config mancante: imposta <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> in .env.local.
        </div>
      </div>
    );
  }

  const discordProfile = session ? extractDiscordProfile(session) : null;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>STAFF ONLY · SUPABASE PREVIEW</div>
        <h1 className={styles.title}>Auth Preview — Discord OAuth reale (#327)</h1>
        <p className={styles.sub}>
          Pagina di test per il nuovo modulo <code>src/api/supabaseAuth.js</code>: login Discord tramite l&apos;SDK
          ufficiale supabase-js (non più fetch manuale), sessione persistita in localStorage da supabase-js stesso,
          risoluzione driver/tier dalla riga <code>drivers</code> via RLS self-select. Non collegato ad AuthContext
          reale — il sito pubblico continua a usare la sessione Apps Script finché #329 non fa il cutover.
        </p>
      </header>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Sessione Supabase</h2>
        {loadingSession ? (
          <p className={styles.emptyText}>Verifico sessione…</p>
        ) : session ? (
          <div className={styles.sessionRow}>
            <div className={styles.sessionInfo}>
              <span className={styles.badgeOk}>Collegato</span>
              <span className={styles.sessionUser}>
                {discordProfile?.discordUsername || session.user?.email || session.user?.id}
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
        {loginError && <div className={styles.errorBox}>{loginError}</div>}
      </section>

      {session && (
        <>
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Profilo Discord (user_metadata)</h2>
            <pre className={styles.jsonBox}>{JSON.stringify(discordProfile, null, 2)}</pre>
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Driver + Tier risolti</h2>
            {resolving && <p className={styles.emptyText}>Risolvo…</p>}
            {resolveError && <div className={styles.errorBox}>{resolveError}</div>}
            {driverInfo && (
              <>
                <p className={styles.resultMeta}>
                  tier: <strong>{driverInfo.tier}</strong> — driver: {driverInfo.driver ? driverInfo.driver.driver_code : '(nessuna riga — guest)'}
                </p>
                <pre className={styles.jsonBox}>{JSON.stringify(driverInfo, null, 2)}</pre>
              </>
            )}
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Sessione raw (per debug)</h2>
            <pre className={styles.jsonBox}>{JSON.stringify({
              access_token: session.access_token ? `${session.access_token.slice(0, 24)}…` : null,
              expires_at: session.expires_at,
              user_id: session.user?.id,
            }, null, 2)}</pre>
          </section>
        </>
      )}
    </div>
  );
}
