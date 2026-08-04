import { useState, useMemo } from 'react';
import {
  useManualBestLaps,
  useAddBestLap,
  useUpdateBestLap,
  useDeleteBestLap,
} from '../hooks/useBestLaps';
import {
  usePendingLapSubmissions,
  useApproveLapSubmission,
  useRejectLapSubmission,
} from '../hooks/useLapSubmissions';
import { useTracks, useCars } from '../hooks/useLookups';
import { useDrivers } from '../hooks/useRoster';
import { useAuth } from '../hooks/useAuth';
import { SIM_LIST } from '../utils/constants';
import styles from './AdminBestLaps.module.css';

// Cancella la foto di prova da Vercel Blob dopo la decisione admin (subito
// dopo approve/reject, per non conservarla più del necessario — vedi
// api/media-delete.js). Se la cancellazione fallisce non blocchiamo il
// flusso: la decisione sul tempo è già stata salvata, il file orfano
// rimane su Blob ma non è più raggiungibile da nessuna UI.
async function deleteEvidence(evidenceUrl, token) {
  if (!evidenceUrl) return;
  try {
    await fetch('/api/media-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: evidenceUrl, token }),
    });
  } catch {
    // best-effort, vedi commento sopra
  }
}

const CONDITIONS_OPTIONS = ['dry', 'wet'];
const SESSION_TYPE_OPTIONS = ['practice', 'qualifying', 'race', 'time_trial'];

const INITIAL_STATE = {
  driver_id: '',
  sim: 'LMU',
  track_id: '',
  car_id: '',
  lap_time_display: '',
  set_date: '',
  conditions: 'dry',
  air_temp_c: '',
  track_temp_c: '',
  session_type: 'practice',
  setup_link: '',
  replay_url: '',
  notes: '',
};

function trackDisplayLabel(track) {
  const parts = [track.circuit_name, track.config_name].filter(Boolean);
  if (parts.length > 0) return parts.join(' ');
  return track.track_name || track.track_id;
}

function carDisplayLabel(car) {
  return car.car_name
    || car.display_name
    || [car.manufacturer, car.model].filter(Boolean).join(' ')
    || car.car_id;
}

export default function AdminBestLaps() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState('manual');

  // La route /admin/best-laps è dietro AdminRoute, che accetta staff+admin
  // (guardia condivisa da tutte le pagine admin). La validazione dei tempi
  // inviati dai piloti però è riservata ai soli admin per scelta esplicita
  // — lo staff non-admin vede solo l'inserimento manuale, il backend
  // rifiuterebbe comunque lapSubmissions.listPending/approve/reject.
  const activeTab = tab === 'pending' && !isAdmin ? 'manual' : tab;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Best Laps — Gestione</h1>
        <div className={styles.headerMeta}>
          Inserimento manuale e validazione dei tempi inviati dai piloti.
        </div>
      </header>

      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === 'manual' ? styles.tabActive : ''}`}
          onClick={() => setTab('manual')}
        >
          Inserimento manuale
        </button>
        {isAdmin && (
          <button
            type="button"
            className={`${styles.tab} ${activeTab === 'pending' ? styles.tabActive : ''}`}
            onClick={() => setTab('pending')}
          >
            Da validare
          </button>
        )}
      </div>

      {activeTab === 'manual' ? <ManualTab /> : <PendingTab />}
    </div>
  );
}

function ManualTab() {
  const [form, setForm] = useState(INITIAL_STATE);
  const [editingLapId, setEditingLapId] = useState(null);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');

  const lapsQuery = useManualBestLaps();
  const driversQuery = useDrivers();
  const tracksQuery = useTracks(form.sim || undefined);
  const carsQuery = useCars(form.sim || undefined);

  const addMutation = useAddBestLap();
  const updateMutation = useUpdateBestLap();
  const deleteMutation = useDeleteBestLap();

  const isEdit = Boolean(editingLapId);
  const isPending = addMutation.isPending || updateMutation.isPending;

  const driversById = useMemo(() => {
    const m = {};
    (driversQuery.data || []).forEach(d => { m[d.driver_id] = d; });
    return m;
  }, [driversQuery.data]);

  const sortedLaps = useMemo(() => {
    const laps = lapsQuery.data || [];
    return [...laps].sort((a, b) => {
      const da = a.set_date || a.created_at || '';
      const db = b.set_date || b.created_at || '';
      return db.localeCompare(da);
    });
  }, [lapsQuery.data]);

  function update(field, value) {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'sim') {
        next.track_id = '';
        next.car_id = '';
      }
      return next;
    });
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  }

  function resetForm() {
    setForm(INITIAL_STATE);
    setEditingLapId(null);
    setErrors({});
    setSubmitError('');
  }

  function startEdit(lap) {
    setEditingLapId(lap.lap_id);
    setForm({
      driver_id: lap.driver_id || '',
      sim: lap.sim || 'LMU',
      track_id: lap.track_id || '',
      car_id: lap.car_id || '',
      lap_time_display: lap.lap_time_display || '',
      set_date: lap.set_date || '',
      conditions: lap.conditions || 'dry',
      air_temp_c: lap.air_temp_c ?? '',
      track_temp_c: lap.track_temp_c ?? '',
      session_type: lap.session_type || 'practice',
      setup_link: lap.setup_link || '',
      replay_url: lap.replay_url || '',
      notes: lap.notes || '',
    });
    setErrors({});
    setSubmitError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function validate() {
    const e = {};
    if (!form.driver_id) e.driver_id = 'Pilota obbligatorio';
    if (!form.sim) e.sim = 'Sim obbligatorio';
    if (!form.track_id) e.track_id = 'Tracciato obbligatorio';
    if (!form.car_id) e.car_id = 'Auto obbligatoria';
    if (!form.lap_time_display.trim()) {
      e.lap_time_display = 'Tempo obbligatorio';
    } else if (!/^\d+:\d{1,2}\.\d{1,3}$/.test(form.lap_time_display.trim())) {
      e.lap_time_display = 'Formato atteso: M:SS.mmm (es. 1:30.333)';
    }
    if (form.setup_link && !/^https?:\/\//.test(form.setup_link)) {
      e.setup_link = 'URL deve iniziare con http(s)://';
    }
    if (form.replay_url && !/^https?:\/\//.test(form.replay_url)) {
      e.replay_url = 'URL deve iniziare con http(s)://';
    }
    if (form.air_temp_c !== '' && Number.isNaN(Number(form.air_temp_c))) {
      e.air_temp_c = 'Deve essere un numero';
    }
    if (form.track_temp_c !== '' && Number.isNaN(Number(form.track_temp_c))) {
      e.track_temp_c = 'Deve essere un numero';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function buildPayload() {
    return {
      driver_id: form.driver_id,
      sim: form.sim,
      track_id: form.track_id,
      car_id: form.car_id,
      lap_time_display: form.lap_time_display.trim(),
      set_date: form.set_date || '',
      conditions: form.conditions,
      air_temp_c: form.air_temp_c !== '' ? Number(form.air_temp_c) : '',
      track_temp_c: form.track_temp_c !== '' ? Number(form.track_temp_c) : '',
      session_type: form.session_type,
      setup_link: form.setup_link.trim(),
      replay_url: form.replay_url.trim(),
      notes: form.notes,
    };
  }

  function handleSubmit(e) {
    e.preventDefault();
    setSubmitError('');
    if (!validate()) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const payload = buildPayload();
    const onSuccess = () => resetForm();
    const onError = (err) => {
      setSubmitError(err.message || 'Errore durante il salvataggio');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    if (isEdit) {
      updateMutation.mutate({ ...payload, lap_id: editingLapId }, { onSuccess, onError });
    } else {
      addMutation.mutate(payload, { onSuccess, onError });
    }
  }

  function handleDelete(lap) {
    const label = `${driversById[lap.driver_id]?.display_name || lap.driver_id} — ${lap.track_id} (${lap.lap_time_display})`;
    const ok = window.confirm(`Eliminare il lap ${label}?`);
    if (!ok) return;
    deleteMutation.mutate(lap.lap_id, {
      onError: (err) => setSubmitError(err.message || 'Errore durante l\'eliminazione'),
    });
    if (editingLapId === lap.lap_id) resetForm();
  }

  return (
    <>
      {submitError && <div className={styles.alertError}>❌ {submitError}</div>}

      <form onSubmit={handleSubmit} className={styles.form}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            {isEdit ? `Modifica Lap — ${editingLapId}` : 'Nuovo Lap'}
          </h2>
          <div className={styles.sectionBody}>
            <div className={styles.row2}>
              <Field label="Pilota" error={errors.driver_id} required>
                <select className={styles.select} value={form.driver_id}
                  onChange={e => update('driver_id', e.target.value)}>
                  <option value="">— Seleziona pilota —</option>
                  {(driversQuery.data || []).map(d => (
                    <option key={d.driver_id} value={d.driver_id}>
                      {d.display_name} ({d.driver_id})
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Sim" error={errors.sim} required>
                <select className={styles.select} value={form.sim}
                  onChange={e => update('sim', e.target.value)}>
                  {SIM_LIST.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
            </div>

            <div className={styles.row2}>
              <Field label="Tracciato" error={errors.track_id} required
                hint={tracksQuery.isLoading ? 'Caricamento…' : `${(tracksQuery.data || []).length} disponibili`}>
                <select className={styles.select} value={form.track_id}
                  onChange={e => update('track_id', e.target.value)}>
                  <option value="">— Seleziona tracciato —</option>
                  {(tracksQuery.data || []).map(t => (
                    <option key={t.track_id} value={t.track_id}>
                      {trackDisplayLabel(t)} ({t.track_id})
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Auto" error={errors.car_id} required
                hint={carsQuery.isLoading ? 'Caricamento…' : `${(carsQuery.data || []).length} disponibili`}>
                <select className={styles.select} value={form.car_id}
                  onChange={e => update('car_id', e.target.value)}>
                  <option value="">— Seleziona auto —</option>
                  {(carsQuery.data || []).map(c => (
                    <option key={c.car_id} value={c.car_id}>
                      {carDisplayLabel(c)} ({c.car_id})
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className={styles.row2}>
              <Field label="Tempo sul giro" error={errors.lap_time_display} required
                hint="Formato M:SS.mmm — es. 1:30.333">
                <input type="text" className={styles.input} value={form.lap_time_display}
                  onChange={e => update('lap_time_display', e.target.value)}
                  placeholder="1:30.333" />
              </Field>

              <Field label="Data giro" hint="Se vuota, usa la data odierna">
                <input type="date" className={styles.input} value={form.set_date}
                  onChange={e => update('set_date', e.target.value)} />
              </Field>
            </div>

            <div className={styles.row2}>
              <Field label="Condizioni">
                <select className={styles.select} value={form.conditions}
                  onChange={e => update('conditions', e.target.value)}>
                  {CONDITIONS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>

              <Field label="Tipo sessione">
                <select className={styles.select} value={form.session_type}
                  onChange={e => update('session_type', e.target.value)}>
                  {SESSION_TYPE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            </div>

            <div className={styles.row2}>
              <Field label="Temp. aria (°C)" error={errors.air_temp_c}
                hint="Facoltativo">
                <input type="number" step="0.1" className={styles.input} value={form.air_temp_c}
                  onChange={e => update('air_temp_c', e.target.value)}
                  placeholder="es. 22" />
              </Field>

              <Field label="Temp. pista (°C)" error={errors.track_temp_c}
                hint="Facoltativo">
                <input type="number" step="0.1" className={styles.input} value={form.track_temp_c}
                  onChange={e => update('track_temp_c', e.target.value)}
                  placeholder="es. 28" />
              </Field>
            </div>

            <div className={styles.row2}>
              <Field label="Link setup" error={errors.setup_link}>
                <input type="url" className={styles.input} value={form.setup_link}
                  onChange={e => update('setup_link', e.target.value)}
                  placeholder="https://drive.google.com/..." />
              </Field>

              <Field label="Link replay" error={errors.replay_url}>
                <input type="url" className={styles.input} value={form.replay_url}
                  onChange={e => update('replay_url', e.target.value)}
                  placeholder="https://..." />
              </Field>
            </div>

            <Field label="Note">
              <textarea className={styles.textarea} rows={2} value={form.notes}
                onChange={e => update('notes', e.target.value)}
                placeholder="Note opzionali" />
            </Field>
          </div>
        </section>

        <div className={styles.actions}>
          {isEdit && (
            <button type="button" className={styles.btnSecondary} onClick={resetForm}>
              Annulla modifica
            </button>
          )}
          <button type="submit" className={styles.btnPrimary} disabled={isPending}>
            {isPending ? 'Salvataggio…' : (isEdit ? 'Salva modifiche' : '+ Aggiungi lap')}
          </button>
        </div>
      </form>

      <section className={styles.listSection}>
        <h2 className={styles.sectionTitle}>Lap inseriti manualmente ({sortedLaps.length})</h2>

        {lapsQuery.isLoading && <div className={styles.loading}>Caricamento…</div>}
        {lapsQuery.error && (
          <div className={styles.errorBox}>Errore: {lapsQuery.error.message}</div>
        )}

        {!lapsQuery.isLoading && sortedLaps.length === 0 && (
          <div className={styles.empty}>Nessun lap manuale inserito.</div>
        )}

        {sortedLaps.length > 0 && (
          <div className={styles.table}>
            <div className={styles.tableHeaderRow}>
              <span>Pilota</span>
              <span>Sim / Tracciato</span>
              <span>Auto</span>
              <span>Tempo</span>
              <span>Data</span>
              <span></span>
            </div>
            {sortedLaps.map(lap => (
              <div key={lap.lap_id} className={styles.tableRow}>
                <span className={styles.cellDriver}>
                  {driversById[lap.driver_id]?.display_name || lap.driver_id}
                </span>
                <span>{lap.sim} · {lap.track_id}</span>
                <span>{lap.car_id}</span>
                <span className={styles.cellTime}>{lap.lap_time_display}</span>
                <span>{lap.set_date || '—'}</span>
                <span className={styles.rowActions}>
                  <button type="button" className={styles.btnEdit}
                    onClick={() => startEdit(lap)} title="Modifica">✎</button>
                  <button type="button" className={styles.btnDelete}
                    onClick={() => handleDelete(lap)} title="Elimina"
                    disabled={deleteMutation.isPending}>✕</button>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

/**
 * PendingTab — coda di revisione best lap inviati dai piloti (solo admin,
 * il backend rifiuta la chiamata a chi non ha ctx.isAdmin). Alla decisione
 * (approva/rifiuta) la foto di prova viene cancellata subito da Blob, per
 * scelta esplicita: non serve conservarla dopo la verifica.
 */
function PendingTab() {
  const { token } = useAuth();
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState('');

  const pendingQuery = usePendingLapSubmissions();
  const driversQuery = useDrivers();
  const approveMutation = useApproveLapSubmission();
  const rejectMutation = useRejectLapSubmission();

  const driversById = useMemo(() => {
    const m = {};
    (driversQuery.data || []).forEach(d => { m[d.driver_id] = d; });
    return m;
  }, [driversQuery.data]);

  const submissions = pendingQuery.data || [];

  async function handleApprove(sub) {
    setActionError('');
    setBusyId(sub.submission_id);
    try {
      const result = await approveMutation.mutateAsync(sub.submission_id);
      await deleteEvidence(result?.evidence_url || sub.evidence_url, token);
    } catch (err) {
      setActionError(err.message || 'Errore durante l\'approvazione');
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(sub) {
    const note = window.prompt('Motivo del rifiuto (facoltativo):', '') || '';
    setActionError('');
    setBusyId(sub.submission_id);
    try {
      const result = await rejectMutation.mutateAsync({
        submission_id: sub.submission_id,
        review_note: note,
      });
      await deleteEvidence(result?.evidence_url || sub.evidence_url, token);
    } catch (err) {
      setActionError(err.message || 'Errore durante il rifiuto');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className={styles.listSection}>
      <h2 className={styles.sectionTitle}>Tempi da validare ({submissions.length})</h2>

      {actionError && <div className={styles.alertError}>❌ {actionError}</div>}

      {pendingQuery.isLoading && <div className={styles.loading}>Caricamento…</div>}
      {pendingQuery.error && (
        <div className={styles.errorBox}>Errore: {pendingQuery.error.message}</div>
      )}

      {!pendingQuery.isLoading && submissions.length === 0 && (
        <div className={styles.empty}>Nessuna richiesta in attesa di validazione.</div>
      )}

      {submissions.length > 0 && (
        <div className={styles.pendingList}>
          {submissions.map(sub => {
            const driver = driversById[sub.driver_id];
            const isBusy = busyId === sub.submission_id;
            return (
              <div key={sub.submission_id} className={styles.pendingCard}>
                <a
                  href={sub.evidence_url}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.pendingThumbLink}
                >
                  <img
                    src={sub.evidence_url}
                    alt="Foto di prova"
                    className={styles.pendingThumb}
                  />
                </a>

                <div className={styles.pendingInfo}>
                  <div className={styles.cellDriver}>
                    {driver?.display_name || sub.driver_id}
                  </div>
                  <div>{sub.sim} · {sub.track_id} · {sub.car_id}</div>
                  <div className={styles.cellTime}>{sub.lap_time_display}</div>
                  <div className={styles.fieldHint}>
                    {sub.conditions} · {sub.session_type}
                    {sub.submitted_at ? ` · inviato ${sub.submitted_at}` : ''}
                  </div>
                  {(sub.air_temp_c !== '' && sub.air_temp_c != null) || (sub.track_temp_c !== '' && sub.track_temp_c != null) ? (
                    <div className={styles.fieldHint}>
                      🌡️
                      {sub.air_temp_c !== '' && sub.air_temp_c != null ? ` Aria ${sub.air_temp_c}°C` : ''}
                      {sub.track_temp_c !== '' && sub.track_temp_c != null ? ` · Pista ${sub.track_temp_c}°C` : ''}
                    </div>
                  ) : null}
                  {sub.notes && <div className={styles.fieldHint}>Note: {sub.notes}</div>}
                </div>

                <div className={styles.pendingActions}>
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    disabled={isBusy}
                    onClick={() => handleApprove(sub)}
                  >
                    {isBusy ? '…' : '✓ Approva'}
                  </button>
                  <button
                    type="button"
                    className={styles.btnDelete}
                    disabled={isBusy}
                    onClick={() => handleReject(sub)}
                  >
                    ✕ Rifiuta
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Field({ label, hint, error, required, children }) {
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel}>
        {label}
        {required && <span className={styles.required}>*</span>}
      </label>
      {children}
      {hint && !error && <div className={styles.fieldHint}>{hint}</div>}
      {error && <div className={styles.fieldError}>{error}</div>}
    </div>
  );
}
