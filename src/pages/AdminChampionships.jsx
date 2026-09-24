import { useState } from 'react';
import { useChampionships, useAddChampionship, useUpdateChampionship } from '../hooks/useChampionships';
import styles from './AdminChampionships.module.css';

// #387/#395: gap "creazione nuovo campionato senza UI" — prima di questa
// pagina i campionati venivano aggiunti a mano via editor Apps Script/repo
// (funzioni one-off migrate_add_<slug>). Ora self-service, staff/admin.

const SIMS = [
  { value: '', label: 'Tutti i sim' },
  { value: 'LMU', label: 'LMU' },
  { value: 'IRC', label: 'IRC' },
  { value: 'ACE', label: 'ACE' },
];

const STATUSES = [
  { value: 'draft', label: 'Bozza' },
  { value: 'upcoming', label: 'In arrivo' },
  { value: 'active', label: 'Attivo' },
  { value: 'completed', label: 'Concluso' },
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
  return {
    name: '', sim: '', season: '', status: 'draft', format: '',
    start_date: '', end_date: '', notes: '', banner_url: '',
  };
}

export default function AdminChampionships() {
  const [simFilter, setSimFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EmptyForm);
  const [formError, setFormError] = useState(null);

  const query = useChampionships({ sim: simFilter || undefined });
  const championships = query.data?.championships || query.data || [];
  const addMutation = useAddChampionship();
  const updateMutation = useUpdateChampionship();

  function handleAddSubmit(e) {
    e.preventDefault();
    setFormError(null);
    if (!form.name.trim()) {
      setFormError('Il nome del campionato è obbligatorio.');
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

  function handleStatusChange(id, status) {
    updateMutation.mutate({ id, status });
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>GESTIONE GARE</div>
        <h1 className={styles.title}>Campionati</h1>
        <p className={styles.sub}>
          Creazione e modifica dei campionati — prima possibile solo a mano nell'editor
          Apps Script/repo, ora self-service per staff/admin.
        </p>
      </header>

      <div className={styles.summaryRow}>
        {SIMS.map(s => (
          <button
            key={s.value}
            type="button"
            className={`${styles.summaryChip} ${simFilter === s.value ? styles.summaryChipActive : ''}`}
            onClick={() => setSimFilter(s.value)}
          >
            {s.label}
          </button>
        ))}
        <button
          type="button"
          className={styles.addBtn}
          onClick={() => setShowForm(v => !v)}
        >
          {showForm ? 'Annulla' : '+ Nuovo campionato'}
        </button>
      </div>

      {showForm && (
        <form className={styles.addForm} onSubmit={handleAddSubmit}>
          <div className={styles.formGrid}>
            <input
              type="text"
              placeholder="Nome campionato *"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className={styles.input}
            />
            <select
              className={styles.select}
              value={form.sim}
              onChange={e => setForm({ ...form, sim: e.target.value })}
            >
              <option value="">Sim…</option>
              <option value="LMU">LMU</option>
              <option value="IRC">IRC</option>
              <option value="ACE">ACE</option>
            </select>
            <input
              type="text"
              placeholder="Stagione (es. 2026)"
              value={form.season}
              onChange={e => setForm({ ...form, season: e.target.value })}
              className={styles.input}
            />
            <select
              className={styles.select}
              value={form.status}
              onChange={e => setForm({ ...form, status: e.target.value })}
            >
              {STATUSES.map(st => (
                <option key={st.value} value={st.value}>{st.label}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Formato (es. Endurance, Sprint)"
              value={form.format}
              onChange={e => setForm({ ...form, format: e.target.value })}
              className={styles.input}
            />
            <input
              type="date"
              value={form.start_date}
              onChange={e => setForm({ ...form, start_date: e.target.value })}
              className={styles.input}
            />
            <input
              type="date"
              value={form.end_date}
              onChange={e => setForm({ ...form, end_date: e.target.value })}
              className={styles.input}
            />
            <input
              type="text"
              placeholder="URL banner"
              value={form.banner_url}
              onChange={e => setForm({ ...form, banner_url: e.target.value })}
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
          <button type="submit" className={styles.submitBtn} disabled={addMutation.isPending}>
            {addMutation.isPending ? 'Salvataggio…' : 'Crea campionato'}
          </button>
        </form>
      )}

      {query.isLoading && <div className={styles.loading}>Caricamento…</div>}
      {query.error && <div className={styles.errorBox}>Errore: {query.error.message}</div>}

      {!query.isLoading && !query.error && (
        <div className={styles.list}>
          {championships.length === 0 && (
            <div className={styles.empty}>Nessun campionato in questa vista.</div>
          )}
          {championships.map(c => (
            <ChampionshipRow
              key={c.id}
              championship={c}
              onStatusChange={handleStatusChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ChampionshipRow({ championship: c, onStatusChange }) {
  return (
    <div className={`${styles.row} ${styles['status_' + c.status]}`}>
      <div className={styles.rowMain}>
        <div className={styles.rowHead}>
          <span className={styles.name}>{c.name}</span>
          {c.sim && <span className={styles.meta}>{c.sim}</span>}
          {c.season && <span className={styles.meta}>{c.season}</span>}
          {c.format && <span className={styles.meta}>{c.format}</span>}
        </div>
        <div className={styles.rowSub}>
          <span className={styles.date}>id: {c.id}</span>
          {(c.start_date || c.end_date) && (
            <span className={styles.date}>{fmtDate(c.start_date)} — {fmtDate(c.end_date)}</span>
          )}
        </div>
      </div>
      <div className={styles.rowActions}>
        <select
          className={styles.statusSelect}
          value={c.status}
          onChange={e => onStatusChange(c.id, e.target.value)}
        >
          {STATUSES.map(st => (
            <option key={st.value} value={st.value}>{st.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
