import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  useAudition,
  useCreateAudition,
  useUpdateAudition,
} from '../hooks/useEndurance';
import {
  useParticipants,
  useAddParticipant,
  useUpdateParticipant,
  useRemoveParticipant,
} from '../hooks/useEnduranceParticipants';
import { useTracks, useCars } from '../hooks/useLookups';
import { useDrivers } from '../hooks/useRoster';
import styles from './AdminEnduranceForm.module.css';

const SIM_OPTIONS = ['LMU', 'IRC', 'ACE'];
const PILOT_CLASS_OPTIONS = ['Hypercar', 'LMP2', 'GT3', 'Open'];
const WEATHER_OPTIONS = ['asciutto', 'dinamico', 'bagnato'];
const STATUS_OPTIONS = ['draft', 'scheduled', 'in_progress', 'completed', 'cancelled'];

const STATUS_LABELS = {
  draft: 'Bozza',
  scheduled: 'Programmata',
  in_progress: 'In Corso',
  completed: 'Conclusa',
  cancelled: 'Annullata',
};

const WEATHER_LABELS = {
  asciutto: 'Asciutto',
  dinamico: 'Dinamico',
  bagnato: 'Bagnato',
};

const PARTICIPANT_STATUS_OPTIONS = ['registered', 'accepted', 'reserve', 'rejected', 'withdrawn'];
const PARTICIPANT_STATUS_LABELS = {
  registered: 'Iscritto',
  accepted: 'Accettato',
  reserve: 'Riserva',
  rejected: 'Rifiutato',
  withdrawn: 'Ritirato',
};

const INITIAL_STATE = {
  target_race: '',
  target_race_date: '',
  name: '',
  date: '',
  sim: 'LMU',
  track_id: '',
  pilot_class: '',
  mandatory_car_id: '',
  setup_url: '',
  setup_notes: '',
  duration_minutes_real: '',
  time_multiplier: '1',
  start_time_ingame: '',
  ai_strength_pct: '',
  field_size_hypercar: '',
  field_size_lmp2: '',
  field_size_gt3: '',
  weather_condition: '',
  status: 'draft',
  notes_internal: '',
};

function computeEndTime(startHHMM, durationMinutes) {
  if (!startHHMM || !durationMinutes) return '';
  const parts = String(startHHMM).split(':');
  if (parts.length !== 2) return '';
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(durationMinutes);
  if (Number.isNaN(h) || Number.isNaN(m) || Number.isNaN(d)) return '';
  let total = (h * 60 + m + d) % (24 * 60);
  if (total < 0) total += 24 * 60;
  const eh = Math.floor(total / 60);
  const em = total % 60;
  return String(eh).padStart(2, '0') + ':' + String(em).padStart(2, '0');
}

function isoFromDatetimeLocal(value) {
  if (!value) return '';
  return value.length === 16 ? value + ':00' : value;
}

function datetimeLocalFromIso(iso) {
  if (!iso) return '';
  return String(iso).substring(0, 16);
}

function carMatchesClass(car, pilotClass) {
  if (!pilotClass || pilotClass === 'Open') return true;
  const category = String(car.category || '').toUpperCase();
  const raceClass = String(car.race_class || '').toUpperCase();
  const wanted = pilotClass.toUpperCase();
  return category === wanted
    || raceClass === wanted
    || category.includes(wanted)
    || raceClass.includes(wanted);
}

function carDisplayLabel(car) {
  return car.car_name
    || car.display_name
    || [car.manufacturer, car.model].filter(Boolean).join(' ')
    || car.car_id;
}

function trackDisplayLabel(track) {
  const parts = [track.circuit_name, track.config_name].filter(Boolean);
  if (parts.length > 0) return parts.join(' ');
  return track.track_name || track.track_id;
}

export default function AdminEnduranceForm() {
  const { auditionId } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(auditionId);

  const [form, setForm] = useState(INITIAL_STATE);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');

  const existing = useAudition(isEdit ? auditionId : null);
  const createMutation = useCreateAudition();
  const updateMutation = useUpdateAudition();

  const tracksQuery = useTracks(form.sim || undefined);
  const carsQuery = useCars(form.sim || undefined);

  useEffect(() => {
    if (!isEdit || !existing.data) return;
    const a = existing.data;
    // Sync intenzionale: popola il form editabile quando arrivano i dati
    // dell'audizione da React Query (async, non un valore derivato da
    // props). L'alternativa pulita (remount via key sulla route) tocca
    // App.jsx e altre pagine admin con lo stesso pattern — non in scope qui.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm({
      target_race: a.target_race || '',
      target_race_date: datetimeLocalFromIso(a.target_race_date),
      name: a.name || '',
      date: datetimeLocalFromIso(a.date),
      sim: a.sim || 'LMU',
      track_id: a.track_id || '',
      pilot_class: a.pilot_class || '',
      mandatory_car_id: a.mandatory_car_id || '',
      setup_url: a.setup_url || '',
      setup_notes: a.setup_notes || '',
      duration_minutes_real: a.duration_minutes_real != null ? String(a.duration_minutes_real) : '',
      time_multiplier: a.time_multiplier != null ? String(a.time_multiplier) : '1',
      start_time_ingame: a.start_time_ingame || '',
      ai_strength_pct: a.ai_strength_pct != null ? String(a.ai_strength_pct) : '',
      field_size_hypercar: a.field_size_hypercar != null ? String(a.field_size_hypercar) : '',
      field_size_lmp2: a.field_size_lmp2 != null ? String(a.field_size_lmp2) : '',
      field_size_gt3: a.field_size_gt3 != null ? String(a.field_size_gt3) : '',
      weather_condition: a.weather_condition || '',
      status: a.status || 'draft',
      notes_internal: a.notes_internal || '',
    });
  }, [isEdit, existing.data]);

  const filteredCars = useMemo(() => {
    const all = carsQuery.data || [];
    return all.filter(c => carMatchesClass(c, form.pilot_class));
  }, [carsQuery.data, form.pilot_class]);

  const durationIngamePreview = useMemo(() => {
    const real = Number(form.duration_minutes_real);
    const mult = Number(form.time_multiplier) || 1;
    if (Number.isNaN(real) || real <= 0) return '';
    return String(real * mult);
  }, [form.duration_minutes_real, form.time_multiplier]);

  const endTimeIngamePreview = useMemo(() => {
    return computeEndTime(form.start_time_ingame, durationIngamePreview);
  }, [form.start_time_ingame, durationIngamePreview]);

  const fieldSizeTotal = useMemo(() => {
    return (Number(form.field_size_hypercar) || 0)
      + (Number(form.field_size_lmp2) || 0)
      + (Number(form.field_size_gt3) || 0);
  }, [form.field_size_hypercar, form.field_size_lmp2, form.field_size_gt3]);

  function update(field, value) {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'sim') {
        next.track_id = '';
        next.mandatory_car_id = '';
      }
      if (field === 'pilot_class') {
        next.mandatory_car_id = '';
      }
      return next;
    });
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  }

  function validate() {
    const e = {};
    if (!form.name.trim()) e.name = 'Nome obbligatorio';
    if (!form.date) e.date = 'Data obbligatoria';
    if (!form.sim) e.sim = 'Sim obbligatorio';
    if (form.pilot_class && !PILOT_CLASS_OPTIONS.includes(form.pilot_class)) e.pilot_class = 'Classe non valida';
    if (form.weather_condition && !WEATHER_OPTIONS.includes(form.weather_condition)) e.weather_condition = 'Meteo non valido';
    if (form.status && !STATUS_OPTIONS.includes(form.status)) e.status = 'Status non valido';

    const numericFields = [
      ['duration_minutes_real', 'Durata reale'],
      ['time_multiplier', 'Multiplier'],
      ['ai_strength_pct', 'AI Strength'],
      ['field_size_hypercar', 'Field Hypercar'],
      ['field_size_lmp2', 'Field LMP2'],
      ['field_size_gt3', 'Field GT3'],
    ];
    for (const [field, label] of numericFields) {
      const v = form[field];
      if (v !== '' && v != null) {
        const n = Number(v);
        if (Number.isNaN(n) || n < 0) e[field] = `${label} deve essere ≥ 0`;
      }
    }

    if (form.start_time_ingame && !/^\d{2}:\d{2}$/.test(form.start_time_ingame)) {
      e.start_time_ingame = 'Formato HH:MM richiesto';
    }
    if (form.setup_url && !/^https?:\/\//.test(form.setup_url)) {
      e.setup_url = 'URL deve iniziare con http(s)://';
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function buildPayload() {
    const numericOrEmpty = (v) => (v === '' || v == null ? '' : Number(v));
    return {
      target_race: form.target_race.trim(),
      target_race_date: isoFromDatetimeLocal(form.target_race_date),
      name: form.name.trim(),
      date: isoFromDatetimeLocal(form.date),
      sim: form.sim,
      track_id: form.track_id || '',
      pilot_class: form.pilot_class || '',
      mandatory_car_id: form.mandatory_car_id || '',
      setup_url: form.setup_url.trim(),
      setup_notes: form.setup_notes,
      duration_minutes_real: numericOrEmpty(form.duration_minutes_real),
      time_multiplier: numericOrEmpty(form.time_multiplier),
      start_time_ingame: form.start_time_ingame || '',
      ai_strength_pct: numericOrEmpty(form.ai_strength_pct),
      field_size_hypercar: numericOrEmpty(form.field_size_hypercar),
      field_size_lmp2: numericOrEmpty(form.field_size_lmp2),
      field_size_gt3: numericOrEmpty(form.field_size_gt3),
      weather_condition: form.weather_condition || '',
      status: form.status || 'draft',
      notes_internal: form.notes_internal,
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
    const onSuccess = () => navigate('/admin/endurance');
    const onError = (err) => {
      setSubmitError(err.message || 'Errore durante il salvataggio');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    if (isEdit) {
      updateMutation.mutate({ ...payload, audition_id: auditionId }, { onSuccess, onError });
    } else {
      createMutation.mutate(payload, { onSuccess, onError });
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  if (isEdit && existing.isLoading) {
    return <div className={styles.container}><div className={styles.loading}>Caricamento audizione…</div></div>;
  }
  if (isEdit && existing.error) {
    return (
      <div className={styles.container}>
        <Link to="/admin/endurance" className={styles.back}>← Lista audizioni</Link>
        <div className={styles.errorBox}>
          Errore: {existing.error.message || 'audizione non trovata'}
        </div>
      </div>
    );
  }

  const a = isEdit ? existing.data : null;

  return (
    <div className={styles.container}>
      <Link to="/admin/endurance" className={styles.back}>← Lista audizioni</Link>

      <header className={styles.header}>
        <h1 className={styles.title}>{isEdit ? 'Modifica Audizione' : 'Nuova Audizione'}</h1>
        {isEdit && a && (
          <div className={styles.headerMeta}>
            <span><code className={styles.metaCode}>{a.audition_id}</code></span>
            {a.created_by && <span> · Creata da {a.created_by}</span>}
            {a.created_at && <span> · {new Date(a.created_at).toLocaleString('it-IT')}</span>}
          </div>
        )}
      </header>

      {submitError && <div className={styles.alertError}>❌ {submitError}</div>}

      {(form.status === 'completed' || form.status === 'cancelled') && (
        <div className={styles.alertWarning}>
          ⚠ Status corrente: <strong>{STATUS_LABELS[form.status]}</strong>.
          La modifica è permessa ma considera se serva davvero.
        </div>
      )}

      <form onSubmit={handleSubmit} className={styles.form}>

        <Section title="Identità & Sessione">
          <div className={styles.row2}>
            <Field label="Gara target" hint="A quale gara reale si riferisce? Es. 'Le Mans 24h 2026', 'Spa 6h 2026'">
              <input type="text" className={styles.input} value={form.target_race}
                onChange={e => update('target_race', e.target.value)}
                placeholder="Es. Le Mans 24h 2026" maxLength={120} />
            </Field>

            <Field label="Data della gara target" hint="Quando si correrà la gara reale (per countdown)">
              <input type="datetime-local" className={styles.input} value={form.target_race_date}
                onChange={e => update('target_race_date', e.target.value)} />
            </Field>
          </div>

          <Field label="Nome audizione" error={errors.name} required>
            <input type="text" className={styles.input} value={form.name}
              onChange={e => update('name', e.target.value)}
              placeholder="Es. Audizione Le Mans 24h" maxLength={200} />
          </Field>

          <div className={styles.row2}>
            <Field label="Sim" error={errors.sim} required>
              <select className={styles.select} value={form.sim} onChange={e => update('sim', e.target.value)}>
                {SIM_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>

            <Field label="Data e ora audizione" error={errors.date} required>
              <input type="datetime-local" className={styles.input} value={form.date}
                onChange={e => update('date', e.target.value)} />
            </Field>
          </div>

          <div className={styles.row2}>
            <Field label="Tracciato"
              hint={tracksQuery.isLoading ? 'Caricamento…' : `${(tracksQuery.data || []).length} disponibili per ${form.sim}`}>
              <select className={styles.select} value={form.track_id} onChange={e => update('track_id', e.target.value)}>
                <option value="">— Seleziona tracciato —</option>
                {(tracksQuery.data || []).map(t => (
                  <option key={t.track_id} value={t.track_id}>
                    {trackDisplayLabel(t)} ({t.track_id})
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Classe pilota" error={errors.pilot_class}>
              <select className={styles.select} value={form.pilot_class} onChange={e => update('pilot_class', e.target.value)}>
                <option value="">— Nessuna —</option>
                {PILOT_CLASS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Auto obbligatoria"
            hint={carsQuery.isLoading ? 'Caricamento…' : `${filteredCars.length} disponibili${form.pilot_class && form.pilot_class !== 'Open' ? ` per ${form.pilot_class}` : ''}`}>
            <select className={styles.select} value={form.mandatory_car_id} onChange={e => update('mandatory_car_id', e.target.value)}>
              <option value="">— Nessuna auto obbligatoria —</option>
              {filteredCars.map(c => (
                <option key={c.car_id} value={c.car_id}>
                  {carDisplayLabel(c)} ({c.car_id})
                </option>
              ))}
            </select>
          </Field>
        </Section>

        {/* ════ SEZIONE PARTECIPANTI ════ */}
        <Section title="Partecipanti">
          {isEdit ? (
            <ParticipantsManager auditionId={auditionId} />
          ) : (
            <div className={styles.participantsPlaceholder}>
              Salva l'audizione una prima volta per poter gestire la lista dei partecipanti.
            </div>
          )}
        </Section>

        <Section title="Setup">
          <Field label="URL Setup (Google Drive, MEGA, etc.)" error={errors.setup_url}>
            <input type="url" className={styles.input} value={form.setup_url}
              onChange={e => update('setup_url', e.target.value)}
              placeholder="https://drive.google.com/..." />
          </Field>

          <Field label="Note Setup" hint="Visibili al pubblico (TC, ABS, brake bias, etc.)">
            <textarea className={styles.textarea} rows={3} value={form.setup_notes}
              onChange={e => update('setup_notes', e.target.value)}
              placeholder="Es. TC 4, ABS 6, brake bias 56%" />
          </Field>
        </Section>

        <Section title="Configurazione Sessione">
          <div className={styles.row3}>
            <Field label="Durata reale (min)" error={errors.duration_minutes_real}>
              <input type="number" min="0" className={styles.input} value={form.duration_minutes_real}
                onChange={e => update('duration_minutes_real', e.target.value)} placeholder="60" />
            </Field>

            <Field label="Multiplier tempo" error={errors.time_multiplier}>
              <input type="number" min="1" step="1" className={styles.input} value={form.time_multiplier}
                onChange={e => update('time_multiplier', e.target.value)} placeholder="6" />
            </Field>

            <ComputedField label="Durata in-game (computed)"
              value={durationIngamePreview ? `${durationIngamePreview} min` : '—'} hint="reale × multiplier" />
          </div>

          <div className={styles.row3}>
            <Field label="Inizio in-game (HH:MM)" error={errors.start_time_ingame}>
              <input type="time" className={styles.input} value={form.start_time_ingame}
                onChange={e => update('start_time_ingame', e.target.value)} />
            </Field>

            <ComputedField label="Fine in-game (computed)" value={endTimeIngamePreview || '—'}
              hint="inizio + durata in-game" />

            <Field label="AI Strength (%)" error={errors.ai_strength_pct}>
              <input type="number" min="0" max="150" className={styles.input} value={form.ai_strength_pct}
                onChange={e => update('ai_strength_pct', e.target.value)} placeholder="105" />
            </Field>
          </div>

          <Field label="Condizioni meteo" error={errors.weather_condition}>
            <select className={styles.select} value={form.weather_condition} onChange={e => update('weather_condition', e.target.value)}>
              <option value="">— Non specificato —</option>
              {WEATHER_OPTIONS.map(w => <option key={w} value={w}>{WEATHER_LABELS[w]}</option>)}
            </select>
          </Field>
        </Section>

        <Section title="Composizione Field">
          <div className={styles.row3}>
            <Field label="Hypercar" error={errors.field_size_hypercar}>
              <input type="number" min="0" className={styles.input} value={form.field_size_hypercar}
                onChange={e => update('field_size_hypercar', e.target.value)} placeholder="5" />
            </Field>

            <Field label="LMP2" error={errors.field_size_lmp2}>
              <input type="number" min="0" className={styles.input} value={form.field_size_lmp2}
                onChange={e => update('field_size_lmp2', e.target.value)} placeholder="10" />
            </Field>

            <Field label="GT3 / LMGT3" error={errors.field_size_gt3}>
              <input type="number" min="0" className={styles.input} value={form.field_size_gt3}
                onChange={e => update('field_size_gt3', e.target.value)} placeholder="15" />
            </Field>
          </div>
          <div className={styles.totalRow}>
            Totale auto in pista: <strong>{fieldSizeTotal}</strong>
          </div>
        </Section>

        <Section title="Status & Note Interne">
          <Field label="Status" error={errors.status}
            hint="draft = nascosta al pubblico · scheduled = visibile · cancelled = soft delete">
            <select className={styles.select} value={form.status} onChange={e => update('status', e.target.value)}>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </Field>

          <Field label="Note interne (staff only)" hint="NON visibili pubblicamente. Criteri di valutazione, considerazioni private.">
            <textarea className={styles.textarea} rows={4} value={form.notes_internal}
              onChange={e => update('notes_internal', e.target.value)}
              placeholder="Note solo staff, mai esposte al pubblico" />
          </Field>
        </Section>

        <div className={styles.actions}>
          <Link to="/admin/endurance" className={styles.btnSecondary}>Annulla</Link>
          <button type="submit" className={styles.btnPrimary} disabled={isPending}>
            {isPending ? 'Salvataggio…' : (isEdit ? 'Salva modifiche' : 'Crea audizione')}
          </button>
        </div>
      </form>
    </div>
  );
}

// ════════ SUB-COMPONENTS ════════

function Section({ title, children }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <div className={styles.sectionBody}>{children}</div>
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

function ComputedField({ label, value, hint }) {
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel}>{label}</label>
      <div className={styles.computedValue}>{value}</div>
      {hint && <div className={styles.fieldHint}>{hint}</div>}
    </div>
  );
}

// ════════ PARTICIPANTS MANAGER ════════

function ParticipantsManager({ auditionId }) {
  const { data: participants = [], isLoading: pLoading, error: pError } = useParticipants(auditionId);
  const { data: roster = [], isLoading: rLoading } = useDrivers();

  const addMutation = useAddParticipant();
  const updateMutation = useUpdateParticipant();
  const removeMutation = useRemoveParticipant();

  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('registered');
  const [actionError, setActionError] = useState('');

  // Set of driver IDs already in participants
  const participantDriverIds = useMemo(
    () => new Set((participants || []).map(p => p.driver_id)),
    [participants]
  );

  // Roster filtered: only drivers not already added
  const availableDrivers = useMemo(() => {
    return (roster || []).filter(d => !participantDriverIds.has(d.driver_id));
  }, [roster, participantDriverIds]);

  // Map driver_id → driver object, for showing display_name etc in list
  const rosterById = useMemo(() => {
    const m = {};
    (roster || []).forEach(d => { m[d.driver_id] = d; });
    return m;
  }, [roster]);

  function handleAdd() {
    setActionError('');
    if (!selectedDriverId) {
      setActionError('Seleziona un pilota');
      return;
    }
    addMutation.mutate(
      {
        audition_id: auditionId,
        driver_id: selectedDriverId,
        status: selectedStatus,
      },
      {
        onSuccess: () => {
          setSelectedDriverId('');
          setSelectedStatus('registered');
        },
        onError: (err) => setActionError(err.message || 'Errore aggiunta'),
      }
    );
  }

  function handleStatusChange(participation_id, newStatus) {
    setActionError('');
    updateMutation.mutate(
      { participation_id, status: newStatus },
      { onError: (err) => setActionError(err.message || 'Errore aggiornamento') }
    );
  }

  function handleRemove(participation_id, driverLabel) {
    setActionError('');
    const ok = window.confirm(`Rimuovere ${driverLabel} dai partecipanti?`);
    if (!ok) return;
    removeMutation.mutate(participation_id, {
      onError: (err) => setActionError(err.message || 'Errore rimozione'),
    });
  }

  if (pLoading || rLoading) {
    return <div className={styles.participantsLoading}>Caricamento partecipanti…</div>;
  }

  if (pError) {
    return <div className={styles.fieldError}>Errore caricamento partecipanti: {pError.message}</div>;
  }

  const isBusy = addMutation.isPending || updateMutation.isPending || removeMutation.isPending;

  return (
    <div className={styles.participantsWrap}>

      {actionError && (
        <div className={styles.alertError} style={{ marginBottom: 12 }}>
          ❌ {actionError}
        </div>
      )}

      {/* Add row */}
      <div className={styles.participantsAddRow}>
        <select
          className={styles.select}
          value={selectedDriverId}
          onChange={e => setSelectedDriverId(e.target.value)}
          disabled={availableDrivers.length === 0 || isBusy}
        >
          <option value="">
            {availableDrivers.length === 0
              ? '— Tutti i piloti già aggiunti —'
              : '— Seleziona pilota dal roster —'}
          </option>
          {availableDrivers.map(d => (
            <option key={d.driver_id} value={d.driver_id}>
              {d.display_name} ({d.driver_id})
            </option>
          ))}
        </select>

        <select
          className={styles.select}
          value={selectedStatus}
          onChange={e => setSelectedStatus(e.target.value)}
          disabled={isBusy}
        >
          {PARTICIPANT_STATUS_OPTIONS.map(s => (
            <option key={s} value={s}>{PARTICIPANT_STATUS_LABELS[s]}</option>
          ))}
        </select>

        <button
          type="button"
          className={styles.btnPrimary}
          onClick={handleAdd}
          disabled={!selectedDriverId || isBusy}
        >
          + Aggiungi
        </button>
      </div>

      {/* List */}
      <div className={styles.participantsListHeader}>
        Iscritti ({participants.length})
      </div>

      {participants.length === 0 ? (
        <div className={styles.participantsEmpty}>
          Nessun partecipante. Aggiungi piloti dal dropdown sopra.
        </div>
      ) : (
        <div className={styles.participantsList}>
          {participants.map(p => {
            const driver = rosterById[p.driver_id];
            const label = driver ? driver.display_name : p.driver_id;
            return (
              <div key={p.participation_id} className={styles.participantRow}>
                <div className={styles.participantName}>
                  <strong>{label}</strong>
                  <span className={styles.participantDriverId}>{p.driver_id}</span>
                </div>

                <select
                  className={styles.select}
                  value={p.status}
                  onChange={e => handleStatusChange(p.participation_id, e.target.value)}
                  disabled={isBusy}
                >
                  {PARTICIPANT_STATUS_OPTIONS.map(s => (
                    <option key={s} value={s}>{PARTICIPANT_STATUS_LABELS[s]}</option>
                  ))}
                </select>

                <button
                  type="button"
                  className={styles.participantRemoveBtn}
                  onClick={() => handleRemove(p.participation_id, label)}
                  disabled={isBusy}
                  title="Rimuovi partecipante"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

