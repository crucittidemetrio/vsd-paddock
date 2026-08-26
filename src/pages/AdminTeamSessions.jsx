import { useState } from 'react';
import {
  useTeamSessions, useCreateTeamSession, useRemoveTeamSession,
} from '../hooks/useTeamSessions';
import { useTracks } from '../hooks/useLookups';
import styles from './AdminTeamSessions.module.css';

const TYPES = [
  { value: 'allenamento_libero', label: 'Allenamento libero' },
  { value: 'allenamento_collettivo', label: 'Allenamento collettivo' },
  { value: 'qualifica', label: 'Qualifica/Prova campionato' },
  { value: 'evento_esterno', label: 'Evento esterno' },
  { value: 'riunione', label: 'Riunione team' },
];

const SIMS = ['', 'LMU', 'IRC', 'ACE'];

function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function EmptyForm() {
  return {
    type: 'allenamento_collettivo', title: '', datetime_start: '', duration_min: '60',
    track_id: '', sim: '', discord_channel: '', notes: '',
  };
}

export default function AdminTeamSessions() {
  const [typeFilter, setTypeFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EmptyForm);
  const [formError, setFormError] = useState(null);

  const query = useTeamSessions();
  const tracksQuery = useTracks();
  const sessions = (query.data || [])
    .slice()
    .sort((a, b) => new Date(a.datetime_start) - new Date(b.datetime_start));
  const filtered = typeFilter ? sessions.filter(s => s.type === typeFilter) : sessions;

  const createMutation = useCreateTeamSession();
  const removeMutation = useRemoveTeamSession();
  // useUpdateTeamSession disponibile in ../hooks/useTeamSessions per Fase 2 (edit inline).

  const counts = TYPES.reduce((acc, t) => {
    acc[t.value] = sessions.filter(s => s.type === t.value).length;
    return acc;
  }, {});

  function handleSubmit(e) {
    e.preventDefault();
    setFormError(null);
    if (!form.title.trim()) {
      setFormError('Il titolo è obbligatorio.');
      return;
    }
    if (!form.datetime_start) {
      setFormError('Data e ora sono obbligatorie.');
      return;
    }
    const payload = {
      type: form.type,
      title: form.title.trim(),
      datetime_start: new Date(form.datetime_start).toISOString(),
      duration_min: Number(form.duration_min) || 60,
      track_id: form.track_id || undefined,
      sim: form.sim || undefined,
      discord_channel: form.discord_channel || undefined,
      notes: form.notes || undefined,
    };
    createMutation.mutate(payload, {
      onSuccess: () => {
        setForm(EmptyForm());
        setShowForm(false);
      },
      onError: (err) => setFormError(err.message),
    });
  }

  function handleRemove(session_id, title) {
    if (!window.confirm(`Cancellare la sessione "${title}"? Non è reversibile.`)) return;
    removeMutation.mutate(session_id);
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>TEAM SCHEDULER</div>
        <h1 className={styles.title}>Sessioni team</h1>
        <p className={styles.sub}>
          Allenamenti, qualifiche e riunioni pianificate dallo staff. Visibili a tutto il team
          nel Calendario — Fase 1: solo creazione/gestione, senza ancora conferma presenza (RSVP)
          né notifiche Discord automatiche.
        </p>
      </header>

      <div className={styles.summaryRow}>
        <button
          type="button"
          className={styles.addBtn}
          onClick={() => setShowForm(v => !v)}
          style={{ marginLeft: 0, marginRight: 'auto' }}
        >
          {showForm ? 'Annulla' : '+ Nuova sessione'}
        </button>
        <select
          className={styles.select}
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
        >
          <option value="">Tutti i tipi ({sessions.length})</option>
          {TYPES.map(t => (
            <option key={t.value} value={t.value}>{t.label} ({counts[t.value] || 0})</option>
          ))}
        </select>
      </div>

      {showForm && (
        <form className={styles.addForm} onSubmit={handleSubmit}>
          <div className={styles.formGrid}>
            <select
              className={styles.select}
              value={form.type}
              onChange={e => setForm({ ...form, type: e.target.value })}
            >
              {TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Titolo *"
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              className={styles.input}
            />
            <input
              type="datetime-local"
              value={form.datetime_start}
              onChange={e => setForm({ ...form, datetime_start: e.target.value })}
              className={styles.input}
            />
            <input
              type="number"
              min="10"
              step="10"
              placeholder="Durata (min)"
              value={form.duration_min}
              onChange={e => setForm({ ...form, duration_min: e.target.value })}
              className={styles.input}
            />
            <select
              className={styles.select}
              value={form.sim}
              onChange={e => setForm({ ...form, sim: e.target.value })}
            >
              {SIMS.map(s => (
                <option key={s} value={s}>{s || 'Sim (opzionale)'}</option>
              ))}
            </select>
            <select
              className={styles.select}
              value={form.track_id}
              onChange={e => setForm({ ...form, track_id: e.target.value })}
            >
              <option value="">Pista (opzionale)</option>
              {(tracksQuery.data || []).map(t => (
                <option key={t.track_id} value={t.track_id}>{t.track_name || t.track_id}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Canale Discord (opzionale)"
              value={form.discord_channel}
              onChange={e => setForm({ ...form, discord_channel: e.target.value })}
              className={styles.input}
            />
          </div>
          <textarea
            placeholder="Note…"
            value={form.notes}
            onChange={e => setForm({ ...form, notes: e.target.value })}
            className={styles.textarea}
            rows={2}
          />
          {formError && <div className={styles.formError}>{formError}</div>}
          <button type="submit" className={styles.submitBtn} disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Salvataggio…' : 'Crea sessione'}
          </button>
        </form>
      )}

      {query.isLoading && <div className={styles.loading}>Caricamento…</div>}
      {query.error && <div className={styles.errorBox}>Errore: {query.error.message}</div>}

      {!query.isLoading && !query.error && (
        <div className={styles.list}>
          {filtered.length === 0 && (
            <div className={styles.empty}>Nessuna sessione in questa vista.</div>
          )}
          {filtered.map(s => (
            <div key={s.session_id} className={`${styles.row} ${styles['type_' + s.type]}`}>
              <div className={styles.rowMain}>
                <div className={styles.rowHead}>
                  <span className={styles.name}>{s.title}</span>
                  <span className={styles.typeTag}>
                    {TYPES.find(t => t.value === s.type)?.label || s.type}
                  </span>
                  {s.sim && <span className={styles.meta}>{s.sim}</span>}
                  {s.discord_channel && <span className={styles.meta}>#{s.discord_channel}</span>}
                </div>
                <div className={styles.rowSub}>
                  <span className={styles.date}>{fmtDateTime(s.datetime_start)}</span>
                  <span className={styles.meta}>{s.duration_min} min</span>
                </div>
                {s.notes && <div className={styles.notesText}>{s.notes}</div>}
              </div>
              <div className={styles.rowActions}>
                <button
                  type="button"
                  className={styles.deleteBtn}
                  onClick={() => handleRemove(s.session_id, s.title)}
                  title="Cancella sessione"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
