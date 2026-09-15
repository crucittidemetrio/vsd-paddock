import { useCallback, useEffect, useState } from 'react';
import styles from './AdminCalendarPreview.module.css';

// ═══════════════════════════════════════════════════════════
// VSD-Paddock — Calendario/TeamSessions Preview (staff-only)
// ═══════════════════════════════════════════════════════════
// Pagina di TEST per validare il porting Calendario/TeamSessions su
// Supabase (#178/#242), stesso principio di AdminRosterPreview.jsx
// (#177): login Discord separato (Supabase Auth), token in
// sessionStorage (STESSA chiave 'vsd_preview_sb_session' di
// AdminRosterPreview — condividere la sessione tra le due pagine di
// preview evita un secondo login), chiama solo le Edge Function
// team-sessions-*/session-rsvp-*. Non tocca in alcun modo il backend
// Apps Script/Google Sheet (TeamSessionsScheduler.js) che serve il
// resto del sito: le scritture qui finiscono SOLO nel database
// Supabase.
// ═══════════════════════════════════════════════════════════

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const FUNCTIONS_BASE = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1` : null;
const SESSION_KEY = 'vsd_preview_sb_session';

const TEAM_SESSION_TYPES = ['allenamento_libero', 'allenamento_collettivo', 'qualifica', 'evento_esterno', 'riunione'];
const SESSION_RSVP_STATUSES = ['confirmed', 'declined', 'tentative'];

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

export default function AdminCalendarPreview() {
  const [session, setSession] = useState(() => readStoredSession());

  const [listResult, setListResult] = useState(null);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState(null);

  const [createForm, setCreateForm] = useState({
    type: 'allenamento_libero', title: '', datetime_start: '', duration_min: '60', sim: '', notes: '',
  });
  const [createLoading, setCreateLoading] = useState(false);
  const [createResult, setCreateResult] = useState(null);
  const [createError, setCreateError] = useState(null);

  const [removeId, setRemoveId] = useState('');
  const [removeLoading, setRemoveLoading] = useState(false);
  const [removeResult, setRemoveResult] = useState(null);
  const [removeError, setRemoveError] = useState(null);

  const [rsvpSessionId, setRsvpSessionId] = useState('');
  const [rsvpListResult, setRsvpListResult] = useState(null);
  const [rsvpListLoading, setRsvpListLoading] = useState(false);
  const [rsvpListError, setRsvpListError] = useState(null);

  const [rsvpSetForm, setRsvpSetForm] = useState({ session_id: '', status: 'confirmed', note: '' });
  const [rsvpSetLoading, setRsvpSetLoading] = useState(false);
  const [rsvpSetResult, setRsvpSetResult] = useState(null);
  const [rsvpSetError, setRsvpSetError] = useState(null);

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
    setListResult(null);
    setCreateResult(null);
    setRemoveResult(null);
    setRsvpListResult(null);
    setRsvpSetResult(null);
  }

  async function loadSessions() {
    setListLoading(true);
    setListError(null);
    const { status, json } = await callFn('team-sessions-list', {});
    setListLoading(false);
    if (status !== 200 || !json?.ok) {
      setListError(json?.error || `Errore ${status}`);
      return;
    }
    setListResult(json.data);
  }

  async function createSession(e) {
    e.preventDefault();
    setCreateLoading(true);
    setCreateError(null);
    const payload = {
      type: createForm.type,
      title: createForm.title,
      datetime_start: createForm.datetime_start ? new Date(createForm.datetime_start).toISOString() : '',
      duration_min: createForm.duration_min ? Number(createForm.duration_min) : undefined,
      sim: createForm.sim || undefined,
      notes: createForm.notes || undefined,
    };
    const { status, json } = await callFn('team-sessions-create', payload);
    setCreateLoading(false);
    if (status !== 200 || !json?.ok) {
      setCreateError(json?.error || `Errore ${status}`);
      setCreateResult(null);
      return;
    }
    setCreateResult(json.data.session);
  }

  async function removeSession(e) {
    e.preventDefault();
    if (!removeId.trim()) return;
    setRemoveLoading(true);
    setRemoveError(null);
    const { status, json } = await callFn('team-sessions-remove', { session_id: removeId.trim() });
    setRemoveLoading(false);
    if (status !== 200 || !json?.ok) {
      setRemoveError(json?.error || `Errore ${status}`);
      setRemoveResult(null);
      return;
    }
    setRemoveResult(json.data);
  }

  async function loadRsvps(e) {
    e.preventDefault();
    if (!rsvpSessionId.trim()) return;
    setRsvpListLoading(true);
    setRsvpListError(null);
    const { status, json } = await callFn('session-rsvp-list', { session_id: rsvpSessionId.trim() });
    setRsvpListLoading(false);
    if (status !== 200 || !json?.ok) {
      setRsvpListError(json?.error || `Errore ${status}`);
      return;
    }
    setRsvpListResult(json.data);
  }

  async function setRsvp(e) {
    e.preventDefault();
    if (!rsvpSetForm.session_id.trim()) return;
    setRsvpSetLoading(true);
    setRsvpSetError(null);
    const { status, json } = await callFn('session-rsvp-set', {
      session_id: rsvpSetForm.session_id.trim(),
      status: rsvpSetForm.status,
      note: rsvpSetForm.note || undefined,
    });
    setRsvpSetLoading(false);
    if (status !== 200 || !json?.ok) {
      setRsvpSetError(json?.error || `Errore ${status}`);
      setRsvpSetResult(null);
      return;
    }
    setRsvpSetResult(json.data.rsvp);
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
        <h1 className={styles.title}>Calendario / Team Sessions Preview</h1>
        <p className={styles.sub}>
          Pagina di test per il nuovo backend Supabase (#178/#242). Login Discord separato dal sito, dati reali ma
          scritture isolate: quello che crei/cancelli qui NON si sincronizza col foglio Google TeamSessions usato
          dal sito pubblico finché la migrazione non è completa. Condivide la sessione di test con Roster Preview.
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
            <h2 className={styles.cardTitle}>teamSessions.list</h2>
            <div className={styles.filterRow}>
              <button className={styles.btnPrimary} onClick={loadSessions} disabled={listLoading}>
                {listLoading ? 'Carico…' : 'Carica sessioni'}
              </button>
            </div>
            {listError && <div className={styles.errorBox}>{listError}</div>}
            {listResult && (
              <>
                <p className={styles.resultMeta}>{listResult.count} sessioni</p>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Tipo</th>
                        <th>Titolo</th>
                        <th>Quando</th>
                        <th>Durata</th>
                        <th>Autore</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listResult.sessions.map(s => (
                        <tr key={s.id}>
                          <td>{s.id}</td>
                          <td>{s.type}</td>
                          <td>{s.title}</td>
                          <td>{new Date(s.datetime_start).toLocaleString('it-IT')}</td>
                          <td>{s.duration_min} min</td>
                          <td>{s.created_by || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>teamSessions.create</h2>
            <p className={styles.emptyText}>
              I tipi "Allenamento libero/collettivo" sono creabili da qualunque driver; gli altri (qualifica,
              evento esterno, riunione) richiedono staff/admin — provalo con un account non-staff per verificare
              che venga rifiutato.
            </p>
            <form className={styles.form} onSubmit={createSession}>
              <label className={styles.formLabel}>
                Tipo
                <select
                  className={styles.textInput}
                  value={createForm.type}
                  onChange={e => setCreateForm(f => ({ ...f, type: e.target.value }))}
                >
                  {TEAM_SESSION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className={styles.formLabel}>
                Titolo
                <input
                  className={styles.textInput}
                  value={createForm.title}
                  onChange={e => setCreateForm(f => ({ ...f, title: e.target.value }))}
                  required
                />
              </label>
              <label className={styles.formLabel}>
                Data/ora inizio
                <input
                  type="datetime-local"
                  className={styles.textInput}
                  value={createForm.datetime_start}
                  onChange={e => setCreateForm(f => ({ ...f, datetime_start: e.target.value }))}
                  required
                />
              </label>
              <label className={styles.formLabel}>
                Durata (min)
                <input
                  type="number"
                  className={styles.textInput}
                  value={createForm.duration_min}
                  onChange={e => setCreateForm(f => ({ ...f, duration_min: e.target.value }))}
                />
              </label>
              <label className={styles.formLabel}>
                Sim
                <input
                  className={styles.textInput}
                  value={createForm.sim}
                  onChange={e => setCreateForm(f => ({ ...f, sim: e.target.value }))}
                  placeholder="LMU / IRC / ACE"
                />
              </label>
              <label className={styles.formLabel}>
                Note
                <textarea
                  className={styles.textArea}
                  value={createForm.notes}
                  onChange={e => setCreateForm(f => ({ ...f, notes: e.target.value }))}
                />
              </label>
              <button className={styles.btnPrimary} type="submit" disabled={createLoading}>
                {createLoading ? 'Creo…' : 'Crea sessione'}
              </button>
            </form>
            {createError && <div className={styles.errorBox}>{createError}</div>}
            {createResult && <pre className={styles.jsonBox}>{JSON.stringify(createResult, null, 2)}</pre>}
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>teamSessions.remove</h2>
            <form className={styles.filterRow} onSubmit={removeSession}>
              <input
                className={styles.textInput}
                placeholder="session id (uuid)"
                value={removeId}
                onChange={e => setRemoveId(e.target.value)}
              />
              <button className={styles.btnPrimary} type="submit" disabled={removeLoading}>
                {removeLoading ? 'Elimino…' : 'Elimina'}
              </button>
            </form>
            {removeError && <div className={styles.errorBox}>{removeError}</div>}
            {removeResult && <pre className={styles.jsonBox}>{JSON.stringify(removeResult, null, 2)}</pre>}
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>sessionRsvp.list</h2>
            <form className={styles.filterRow} onSubmit={loadRsvps}>
              <input
                className={styles.textInput}
                placeholder="session id (uuid)"
                value={rsvpSessionId}
                onChange={e => setRsvpSessionId(e.target.value)}
              />
              <button className={styles.btnPrimary} type="submit" disabled={rsvpListLoading}>
                {rsvpListLoading ? 'Carico…' : 'Carica RSVP'}
              </button>
            </form>
            {rsvpListError && <div className={styles.errorBox}>{rsvpListError}</div>}
            {rsvpListResult && (
              <>
                <p className={styles.resultMeta}>{rsvpListResult.count} risposte</p>
                <pre className={styles.jsonBox}>{JSON.stringify(rsvpListResult.rsvps, null, 2)}</pre>
              </>
            )}
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>sessionRsvp.set</h2>
            <p className={styles.emptyText}>Imposta/aggiorna la TUA risposta per una sessione (upsert).</p>
            <form className={styles.form} onSubmit={setRsvp}>
              <label className={styles.formLabel}>
                Session ID
                <input
                  className={styles.textInput}
                  value={rsvpSetForm.session_id}
                  onChange={e => setRsvpSetForm(f => ({ ...f, session_id: e.target.value }))}
                  required
                />
              </label>
              <label className={styles.formLabel}>
                Status
                <select
                  className={styles.textInput}
                  value={rsvpSetForm.status}
                  onChange={e => setRsvpSetForm(f => ({ ...f, status: e.target.value }))}
                >
                  {SESSION_RSVP_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label className={styles.formLabel}>
                Nota
                <input
                  className={styles.textInput}
                  value={rsvpSetForm.note}
                  onChange={e => setRsvpSetForm(f => ({ ...f, note: e.target.value }))}
                />
              </label>
              <button className={styles.btnPrimary} type="submit" disabled={rsvpSetLoading}>
                {rsvpSetLoading ? 'Salvo…' : 'Salva'}
              </button>
            </form>
            {rsvpSetError && <div className={styles.errorBox}>{rsvpSetError}</div>}
            {rsvpSetResult && <pre className={styles.jsonBox}>{JSON.stringify(rsvpSetResult, null, 2)}</pre>}
          </section>
        </>
      )}
    </div>
  );
}
