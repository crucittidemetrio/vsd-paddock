import { useState } from 'react';
import {
  useClashParticipants,
  useClashIncidents,
  useClashAddParticipant,
  useClashUpdateParticipant,
  useClashRemoveParticipant,
} from '../hooks/useClashOfClasses';
import { VEHICLES_BY_CLASS } from '../utils/clashVehicles';
import styles from './AdminClashResults.module.css';

export default function AdminClashResults() {
  const [tab, setTab] = useState('incidents');

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Clash of Classes — Gestione evento</h1>
        <p className={styles.subtitle}>Revisione segnalazioni incidenti e gestione iscritti. I risultati arrivano dall'import SimGrid.</p>
      </header>

      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === 'incidents' ? styles.tabActive : ''}`}
          onClick={() => setTab('incidents')}
        >
          Segnalazioni incidenti
        </button>
        <button
          className={`${styles.tab} ${tab === 'participants' ? styles.tabActive : ''}`}
          onClick={() => setTab('participants')}
        >
          Iscritti
        </button>
      </div>

      {tab === 'incidents' && <IncidentsTab />}
      {tab === 'participants' && <ParticipantsTab />}
    </div>
  );
}

function IncidentsTab() {
  const { data, isLoading, error } = useClashIncidents();
  const reports = data?.reports || [];

  return (
    <section className={styles.card}>
      {isLoading && <p className={styles.hint}>Caricamento segnalazioni…</p>}
      {error && <div className={styles.error}>{error.message}</div>}
      {!isLoading && reports.length === 0 && <p className={styles.hint}>Nessuna segnalazione ricevuta.</p>}

      {!isLoading && reports.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Round</th>
                <th>Segnalante</th>
                <th>Segnalato</th>
                <th>Descrizione</th>
                <th>Replay</th>
                <th>Inviata</th>
              </tr>
            </thead>
            <tbody>
              {reports.map(r => (
                <tr key={r.report_id}>
                  <td>{r.round}</td>
                  <td>{r.reporting_name}</td>
                  <td>{r.reported_name}</td>
                  <td className={styles.descCell}>{r.description}</td>
                  <td>
                    {r.replay_url
                      ? <a href={r.replay_url} target="_blank" rel="noopener noreferrer">link</a>
                      : '—'}
                  </td>
                  <td>{new Date(r.submitted_at).toLocaleString('it-IT')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// Gestione manuale iscritti — per allineare i dati con SimGrid (fonte
// "ufficiale" delle iscrizioni per questo evento): permette di
// aggiungere chi si è iscritto lì ma non qui, correggere una classe
// sbagliata, o ritirare un doppione, senza dover passare dal form
// pubblico di auto-iscrizione.
function ParticipantsTab() {
  const { data, isLoading, error } = useClashParticipants();
  const addMutation = useClashAddParticipant();
  const updateMutation = useClashUpdateParticipant();
  const removeMutation = useClashRemoveParticipant();

  const [feedback, setFeedback] = useState(null);
  const [form, setForm] = useState({ display_name: '', class: 'GTE', vehicle: '', discord_handle: '', driver_id: '' });
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({ display_name: '', class: 'GTE', vehicle: '' });

  const participants = data?.participants || [];
  const counts = data?.counts || { GTE: 0, GT3: 0 };
  const total = data?.count ?? participants.length;
  const maxGrid = data?.max_grid ?? 22;

  async function handleAdd(e) {
    e.preventDefault();
    setFeedback(null);
    if (!form.display_name.trim()) {
      setFeedback({ ok: false, message: 'Inserisci un nome.' });
      return;
    }
    try {
      await addMutation.mutateAsync({
        display_name: form.display_name.trim(),
        class: form.class,
        vehicle: form.vehicle,
        discord_handle: form.discord_handle.trim(),
        driver_id: form.driver_id.trim(),
      });
      setFeedback({ ok: true, message: `${form.display_name.trim()} aggiunto (classe ${form.class}).` });
      setForm({ display_name: '', class: 'GTE', vehicle: '', discord_handle: '', driver_id: '' });
    } catch (err) {
      setFeedback({ ok: false, message: err.message || 'Errore durante l’aggiunta.' });
    }
  }

  function startEdit(p) {
    setEditingId(p.participant_id);
    setEditDraft({ display_name: p.display_name, class: p.class, vehicle: p.vehicle || '' });
    setFeedback(null);
  }

  function handleEditClassChange(cls) {
    setEditDraft(d => ({
      ...d,
      class: cls,
      // se la vettura già scelta non è ammessa nella nuova classe, resetta
      vehicle: VEHICLES_BY_CLASS[cls].includes(d.vehicle) ? d.vehicle : '',
    }));
  }

  async function saveEdit(participantId) {
    try {
      await updateMutation.mutateAsync({
        participant_id: participantId,
        display_name: editDraft.display_name.trim(),
        class: editDraft.class,
        vehicle: editDraft.vehicle,
      });
      setEditingId(null);
    } catch (err) {
      setFeedback({ ok: false, message: err.message || 'Errore durante la modifica.' });
    }
  }

  async function handleRemove(p) {
    if (!window.confirm(`Ritirare ${p.display_name} da Clash of Classes?`)) return;
    setFeedback(null);
    try {
      await removeMutation.mutateAsync(p.participant_id);
      setFeedback({ ok: true, message: `${p.display_name} ritirato.` });
    } catch (err) {
      setFeedback({ ok: false, message: err.message || 'Errore durante la rimozione.' });
    }
  }

  return (
    <section className={styles.card}>
      <div className={styles.toolbar}>
        <span className={styles.hint}>
          {isLoading ? 'Caricamento…' : `${total}/${maxGrid} iscritti — GTE ${counts.GTE || 0} · LMGT3 ${counts.GT3 || 0}`}
        </span>
      </div>

      <form className={styles.addForm} onSubmit={handleAdd}>
        <input
          type="text"
          className={styles.numInput}
          style={{ width: 180 }}
          placeholder="Nome pilota"
          value={form.display_name}
          onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
          maxLength={80}
        />
        <select
          className={styles.select}
          value={form.class}
          onChange={e => setForm(f => ({
            ...f,
            class: e.target.value,
            vehicle: VEHICLES_BY_CLASS[e.target.value].includes(f.vehicle) ? f.vehicle : '',
          }))}
        >
          <option value="GTE">GTE</option>
          <option value="GT3">LMGT3</option>
        </select>
        <select
          className={styles.select}
          value={form.vehicle}
          onChange={e => setForm(f => ({ ...f, vehicle: e.target.value }))}
        >
          <option value="">Veicolo (opzionale)</option>
          {VEHICLES_BY_CLASS[form.class].map(v => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
        <input
          type="text"
          className={styles.numInput}
          style={{ width: 140 }}
          placeholder="Discord (opzionale)"
          value={form.discord_handle}
          onChange={e => setForm(f => ({ ...f, discord_handle: e.target.value }))}
          maxLength={60}
        />
        <input
          type="text"
          className={styles.numInput}
          style={{ width: 120 }}
          placeholder="driver_id VSD (opz.)"
          value={form.driver_id}
          onChange={e => setForm(f => ({ ...f, driver_id: e.target.value }))}
        />
        <button type="submit" className={styles.btnPrimary} disabled={addMutation.isPending}>
          {addMutation.isPending ? 'Aggiunta…' : '+ Aggiungi iscritto'}
        </button>
      </form>

      {error && <div className={styles.error}>{error.message}</div>}
      {isLoading && <p className={styles.hint}>Caricamento iscritti…</p>}
      {!isLoading && participants.length === 0 && <p className={styles.hint}>Nessun iscritto ancora.</p>}

      {!isLoading && participants.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Pilota</th>
                <th>Classe</th>
                <th>Veicolo</th>
                <th>Discord</th>
                <th>driver_id</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {participants.map(p => {
                const isEditing = editingId === p.participant_id;
                return (
                  <tr key={p.participant_id}>
                    {isEditing ? (
                      <>
                        <td>
                          <input
                            type="text"
                            className={styles.numInput}
                            style={{ width: 160 }}
                            value={editDraft.display_name}
                            onChange={e => setEditDraft(d => ({ ...d, display_name: e.target.value }))}
                          />
                        </td>
                        <td>
                          <select
                            className={styles.select}
                            value={editDraft.class}
                            onChange={e => handleEditClassChange(e.target.value)}
                          >
                            <option value="GTE">GTE</option>
                            <option value="GT3">LMGT3</option>
                          </select>
                        </td>
                        <td>
                          <select
                            className={styles.select}
                            value={editDraft.vehicle}
                            onChange={e => setEditDraft(d => ({ ...d, vehicle: e.target.value }))}
                          >
                            <option value="">—</option>
                            {VEHICLES_BY_CLASS[editDraft.class].map(v => (
                              <option key={v} value={v}>{v}</option>
                            ))}
                          </select>
                        </td>
                        <td colSpan={2}>{p.discord_handle || '—'}</td>
                        <td>
                          <button
                            type="button"
                            className={styles.btnPrimary}
                            onClick={() => saveEdit(p.participant_id)}
                            disabled={updateMutation.isPending}
                          >
                            Salva
                          </button>{' '}
                          <button type="button" onClick={() => setEditingId(null)}>Annulla</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td>{p.display_name}</td>
                        <td><span className={styles.classBadge}>{p.class}</span></td>
                        <td>{p.vehicle || '—'}</td>
                        <td>{p.discord_handle || '—'}</td>
                        <td>{p.driver_id || '—'}</td>
                        <td>
                          <button type="button" onClick={() => startEdit(p)}>Modifica</button>{' '}
                          <button
                            type="button"
                            onClick={() => handleRemove(p)}
                            disabled={removeMutation.isPending}
                          >
                            Ritira
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {feedback && (
        <div className={feedback.ok ? styles.success : styles.error}>{feedback.message}</div>
      )}
    </section>
  );
}
