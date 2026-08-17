import { useState } from 'react';
import { useCandidates, useAddCandidate, useUpdateCandidate, useRemoveCandidate } from '../hooks/useCandidates';
import styles from './AdminCandidates.module.css';

const STATUSES = [
  { value: 'new', label: 'Nuovo' },
  { value: 'contacted', label: 'Contattato' },
  { value: 'trial', label: 'In prova' },
  { value: 'accepted', label: 'Accettato' },
  { value: 'rejected', label: 'Rifiutato' },
];
function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

function EmptyForm() {
  return { display_name: '', discord_username: '', contact: '', sim_preference: '', source: 'Google Form', notes: '' };
}

export default function AdminCandidates() {
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EmptyForm);
  const [formError, setFormError] = useState(null);

  const query = useCandidates(statusFilter || undefined);
  const candidates = query.data || [];
  const addMutation = useAddCandidate();
  const updateMutation = useUpdateCandidate();
  const removeMutation = useRemoveCandidate();

  const counts = STATUSES.reduce((acc, s) => {
    acc[s.value] = candidates.filter(c => c.status === s.value).length;
    return acc;
  }, {});

  function handleAddSubmit(e) {
    e.preventDefault();
    setFormError(null);
    if (!form.display_name.trim()) {
      setFormError('Il nome è obbligatorio.');
      return;
    }
    addMutation.mutate(form, {
      onSuccess: () => {
        setForm(EmptyForm());
        setShowForm(false);
      },
      onError: (err) => setFormError(err.message),
    });
  }

  function handleStatusChange(candidate_id, status) {
    updateMutation.mutate({ candidate_id, status });
  }

  function handleNotesBlur(candidate_id, notes, original) {
    if (notes === original) return;
    updateMutation.mutate({ candidate_id, notes });
  }

  function handleRemove(candidate_id, name) {
    if (!window.confirm(`Cancellare la candidatura di "${name}"? Non è reversibile.`)) return;
    removeMutation.mutate(candidate_id);
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>SELEZIONE</div>
        <h1 className={styles.title}>Pipeline candidature</h1>
        <p className={styles.sub}>
          Affianca il Google Form pubblico di "Unisciti a noi" — aggiungi qui i candidati
          promettenti visti nelle risposte del form (o arrivati via Discord, passaparola) e
          seguine lo stato. Il form resta invariato come punto di ingresso.
        </p>
      </header>

      <div className={styles.summaryRow}>
        <button
          type="button"
          className={`${styles.summaryChip} ${!statusFilter ? styles.summaryChipActive : ''}`}
          onClick={() => setStatusFilter('')}
        >
          Tutti ({candidates.length})
        </button>
        {STATUSES.map(s => (
          <button
            key={s.value}
            type="button"
            className={`${styles.summaryChip} ${statusFilter === s.value ? styles.summaryChipActive : ''}`}
            onClick={() => setStatusFilter(s.value)}
          >
            {s.label} ({counts[s.value]})
          </button>
        ))}
        <button
          type="button"
          className={styles.addBtn}
          onClick={() => setShowForm(v => !v)}
        >
          {showForm ? 'Annulla' : '+ Nuovo candidato'}
        </button>
      </div>

      {showForm && (
        <form className={styles.addForm} onSubmit={handleAddSubmit}>
          <div className={styles.formGrid}>
            <input
              type="text"
              placeholder="Nome *"
              value={form.display_name}
              onChange={e => setForm({ ...form, display_name: e.target.value })}
              className={styles.input}
            />
            <input
              type="text"
              placeholder="Discord (es. mario#1234)"
              value={form.discord_username}
              onChange={e => setForm({ ...form, discord_username: e.target.value })}
              className={styles.input}
            />
            <input
              type="text"
              placeholder="Contatto (email, ecc.)"
              value={form.contact}
              onChange={e => setForm({ ...form, contact: e.target.value })}
              className={styles.input}
            />
            <input
              type="text"
              placeholder="Sim preferiti (es. LMU, iRacing)"
              value={form.sim_preference}
              onChange={e => setForm({ ...form, sim_preference: e.target.value })}
              className={styles.input}
            />
            <select
              value={form.source}
              onChange={e => setForm({ ...form, source: e.target.value })}
              className={styles.select}
            >
              <option value="Google Form">Google Form</option>
              <option value="Discord">Discord</option>
              <option value="Passaparola">Passaparola</option>
              <option value="Altro">Altro</option>
            </select>
          </div>
          <textarea
            placeholder="Note…"
            value={form.notes}
            onChange={e => setForm({ ...form, notes: e.target.value })}
            className={styles.textarea}
            rows={2}
          />
          {formError && <div className={styles.formError}>{formError}</div>}
          <button type="submit" className={styles.submitBtn} disabled={addMutation.isPending}>
            {addMutation.isPending ? 'Salvataggio…' : 'Aggiungi candidato'}
          </button>
        </form>
      )}

      {query.isLoading && <div className={styles.loading}>Caricamento…</div>}
      {query.error && <div className={styles.errorBox}>Errore: {query.error.message}</div>}

      {!query.isLoading && !query.error && (
        <div className={styles.list}>
          {candidates.length === 0 && (
            <div className={styles.empty}>Nessun candidato in questa vista.</div>
          )}
          {candidates.map(c => (
            <CandidateRow
              key={c.candidate_id}
              candidate={c}
              onStatusChange={handleStatusChange}
              onNotesBlur={handleNotesBlur}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CandidateRow({ candidate: c, onStatusChange, onNotesBlur, onRemove }) {
  const [notes, setNotes] = useState(c.notes || '');

  return (
    <div className={`${styles.row} ${styles['status_' + c.status]}`}>
      <div className={styles.rowMain}>
        <div className={styles.rowHead}>
          <span className={styles.name}>{c.display_name}</span>
          {c.discord_username && <span className={styles.meta}>{c.discord_username}</span>}
          {c.contact && <span className={styles.meta}>{c.contact}</span>}
          {c.sim_preference && <span className={styles.metaSim}>{c.sim_preference}</span>}
        </div>
        <div className={styles.rowSub}>
          <span className={styles.sourceTag}>{c.source || 'N/D'}</span>
          <span className={styles.date}>aggiunto {fmtDate(c.created_at)}</span>
        </div>
        <textarea
          className={styles.notesInput}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          onBlur={() => onNotesBlur(c.candidate_id, notes, c.notes || '')}
          placeholder="Note staff…"
          rows={2}
        />
      </div>
      <div className={styles.rowActions}>
        <select
          className={styles.statusSelect}
          value={c.status}
          onChange={e => onStatusChange(c.candidate_id, e.target.value)}
        >
          {STATUSES.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <button
          type="button"
          className={styles.deleteBtn}
          onClick={() => onRemove(c.candidate_id, c.display_name)}
          title="Cancella candidatura"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
