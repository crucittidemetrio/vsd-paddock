import { useState } from 'react';
import { useSponsors, useAddSponsor, useUpdateSponsor, useRemoveSponsor } from '../hooks/useSponsors';
import styles from './AdminSponsors.module.css';

const STATUSES = [
  { value: 'lead', label: 'Lead' },
  { value: 'contacted', label: 'Contattato' },
  { value: 'negotiating', label: 'In trattativa' },
  { value: 'active', label: 'Attivo' },
  { value: 'declined', label: 'Rifiutato' },
  { value: 'lapsed', label: 'Scaduto' },
];

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

function isOverdue(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

function EmptyForm() {
  return {
    company_name: '', contact_name: '', contact_email: '', contact_phone: '',
    value_estimate: '', next_follow_up: '', notes: '',
  };
}

export default function AdminSponsors() {
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EmptyForm);
  const [formError, setFormError] = useState(null);

  const query = useSponsors(statusFilter || undefined);
  const sponsors = query.data || [];
  const addMutation = useAddSponsor();
  const updateMutation = useUpdateSponsor();
  const removeMutation = useRemoveSponsor();

  const counts = STATUSES.reduce((acc, s) => {
    acc[s.value] = sponsors.filter(sp => sp.status === s.value).length;
    return acc;
  }, {});

  function handleAddSubmit(e) {
    e.preventDefault();
    setFormError(null);
    if (!form.company_name.trim()) {
      setFormError('Il nome azienda è obbligatorio.');
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

  function handleStatusChange(sponsor_id, status) {
    updateMutation.mutate({ sponsor_id, status });
  }

  function handleFollowUpChange(sponsor_id, next_follow_up) {
    updateMutation.mutate({ sponsor_id, next_follow_up });
  }

  function handleNotesBlur(sponsor_id, notes, original) {
    if (notes === original) return;
    updateMutation.mutate({ sponsor_id, notes });
  }

  function handleRemove(sponsor_id, name) {
    if (!window.confirm(`Cancellare lo sponsor "${name}"? Non è reversibile.`)) return;
    removeMutation.mutate(sponsor_id);
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>PARTNERSHIP</div>
        <h1 className={styles.title}>CRM sponsor</h1>
        <p className={styles.sub}>
          Agenda interna dei contatti sponsor — a che punto è la trattativa, chi ricontattare
          e quando. La pagina pubblica Media Kit resta la vetrina, questo è lo strumento privato
          dello staff.
        </p>
      </header>

      <div className={styles.summaryRow}>
        <button
          type="button"
          className={`${styles.summaryChip} ${!statusFilter ? styles.summaryChipActive : ''}`}
          onClick={() => setStatusFilter('')}
        >
          Tutti ({sponsors.length})
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
          {showForm ? 'Annulla' : '+ Nuovo sponsor'}
        </button>
      </div>

      {showForm && (
        <form className={styles.addForm} onSubmit={handleAddSubmit}>
          <div className={styles.formGrid}>
            <input
              type="text"
              placeholder="Azienda *"
              value={form.company_name}
              onChange={e => setForm({ ...form, company_name: e.target.value })}
              className={styles.input}
            />
            <input
              type="text"
              placeholder="Nome contatto"
              value={form.contact_name}
              onChange={e => setForm({ ...form, contact_name: e.target.value })}
              className={styles.input}
            />
            <input
              type="email"
              placeholder="Email contatto"
              value={form.contact_email}
              onChange={e => setForm({ ...form, contact_email: e.target.value })}
              className={styles.input}
            />
            <input
              type="text"
              placeholder="Telefono"
              value={form.contact_phone}
              onChange={e => setForm({ ...form, contact_phone: e.target.value })}
              className={styles.input}
            />
            <input
              type="text"
              placeholder="Valore stimato (es. 500€/stagione)"
              value={form.value_estimate}
              onChange={e => setForm({ ...form, value_estimate: e.target.value })}
              className={styles.input}
            />
            <input
              type="date"
              placeholder="Prossimo follow-up"
              value={form.next_follow_up}
              onChange={e => setForm({ ...form, next_follow_up: e.target.value })}
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
            {addMutation.isPending ? 'Salvataggio…' : 'Aggiungi sponsor'}
          </button>
        </form>
      )}

      {query.isLoading && <div className={styles.loading}>Caricamento…</div>}
      {query.error && <div className={styles.errorBox}>Errore: {query.error.message}</div>}

      {!query.isLoading && !query.error && (
        <div className={styles.list}>
          {sponsors.length === 0 && (
            <div className={styles.empty}>Nessuno sponsor in questa vista.</div>
          )}
          {sponsors.map(s => (
            <SponsorRow
              key={s.sponsor_id}
              sponsor={s}
              onStatusChange={handleStatusChange}
              onFollowUpChange={handleFollowUpChange}
              onNotesBlur={handleNotesBlur}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SponsorRow({ sponsor: s, onStatusChange, onFollowUpChange, onNotesBlur, onRemove }) {
  const [notes, setNotes] = useState(s.notes || '');
  const overdue = isOverdue(s.next_follow_up);

  return (
    <div className={`${styles.row} ${styles['status_' + s.status]}`}>
      <div className={styles.rowMain}>
        <div className={styles.rowHead}>
          <span className={styles.name}>{s.company_name}</span>
          {s.contact_name && <span className={styles.meta}>{s.contact_name}</span>}
          {s.contact_email && <span className={styles.meta}>{s.contact_email}</span>}
          {s.contact_phone && <span className={styles.meta}>{s.contact_phone}</span>}
          {s.value_estimate && <span className={styles.metaValue}>{s.value_estimate}</span>}
        </div>
        <div className={styles.rowSub}>
          <span className={styles.date}>aggiunto {fmtDate(s.created_at)}</span>
          {s.next_follow_up && (
            <span className={`${styles.followUpTag} ${overdue ? styles.followUpTagOverdue : ''}`}>
              {overdue ? 'Follow-up scaduto' : 'Follow-up'} {fmtDate(s.next_follow_up)}
            </span>
          )}
        </div>
        <textarea
          className={styles.notesInput}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          onBlur={() => onNotesBlur(s.sponsor_id, notes, s.notes || '')}
          placeholder="Note staff…"
          rows={2}
        />
      </div>
      <div className={styles.rowActions}>
        <select
          className={styles.statusSelect}
          value={s.status}
          onChange={e => onStatusChange(s.sponsor_id, e.target.value)}
        >
          {STATUSES.map(st => (
            <option key={st.value} value={st.value}>{st.label}</option>
          ))}
        </select>
        <input
          type="date"
          className={styles.followUpInput}
          value={s.next_follow_up || ''}
          onChange={e => onFollowUpChange(s.sponsor_id, e.target.value)}
        />
        <button
          type="button"
          className={styles.deleteBtn}
          onClick={() => onRemove(s.sponsor_id, s.company_name)}
          title="Cancella sponsor"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
