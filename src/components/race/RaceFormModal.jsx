import { useState } from 'react';
import { api } from '../../api/client';
import styles from './RaceFormModal.module.css';

const SIM_OPTIONS = ['LMU', 'IRC', 'ACE'];
const FORMAT_OPTIONS = ['sprint', 'endurance', 'multi-class'];
const STATUS_OPTIONS = ['draft', 'scheduled', 'in_progress', 'completed', 'cancelled'];
const STATUS_LABELS = {
  draft: 'Bozza',
  scheduled: 'Programmata',
  in_progress: 'In Corso',
  completed: 'Conclusa',
  cancelled: 'Annullata',
};

/**
 * RaceFormModal — form di creazione/modifica gara.
 * race === null → modalità CREATE (chiama races.add)
 * race === oggetto → modalità EDIT (chiama races.update, race_id fisso)
 *
 * Campi essenziali sempre visibili; dettagli opzionali in sezione collassabile.
 */
export default function RaceFormModal({ race, onClose, onSaved }) {
  const isEdit = !!race;

  const [form, setForm] = useState(() => ({
    race_name: race?.race_name || '',
    sim: race?.sim || 'LMU',
    date: race?.date ? String(race.date).slice(0, 16) : '',
    duration_minutes: race?.duration_minutes ?? '',
    format: race?.format || 'sprint',
    status: race?.status || 'draft',
    round: race?.round || '',
    track_id: race?.track_id || '',
    car_id: race?.car_id || '',
    event_type: race?.event_type || '',
    championship_id: race?.championship_id || '',
    weather: race?.weather || '',
    broadcast_url: race?.broadcast_url || '',
    poster_url: race?.poster_url || '',
    notes: race?.notes || '',
  }));

  const [showOptional, setShowOptional] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  function validate() {
    if (!form.race_name.trim()) return 'Il nome gara è obbligatorio.';
    if (!form.sim) return 'Il sim è obbligatorio.';
    if (!form.date) return 'La data è obbligatoria.';
    if (!form.format) return 'Il formato è obbligatorio.';
    if (!form.status) return 'Lo stato è obbligatorio.';
    if (isNaN(new Date(form.date).getTime())) return 'La data non è valida.';
    if (form.format === 'endurance' && !form.duration_minutes) {
      return 'Per una gara endurance la durata è necessaria (serve allo StintPlanner).';
    }
    return null;
  }

  async function handleSubmit() {
    const err = validate();
    if (err) { setError(err); return; }
    setError(null);
    setSaving(true);

    // Normalizza duration_minutes a numero (o stringa vuota)
    const payload = {
      ...form,
      duration_minutes: form.duration_minutes === '' ? '' : Number(form.duration_minutes),
    };

    try {
      if (isEdit) {
        payload.race_id = race.race_id;
        const res = await api.races.update(payload);
        onSaved(`Gara "${form.race_name}" aggiornata.`);
      } else {
        const res = await api.races.add(payload);
        onSaved(`Gara "${form.race_name}" creata (${res?.race_id || ''}).`);
      }
    } catch (e) {
      setError(e?.message || 'Errore durante il salvataggio.');
      setSaving(false);
    }
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>{isEdit ? `Modifica ${race.race_id}` : 'Crea nuova gara'}</h2>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        {error && <div className={styles.alertError}>⚠ {error}</div>}

        <div className={styles.body}>
          {/* ── Essenziali ── */}
          <div className={styles.sectionLabel}>Essenziali</div>
          <div className={styles.grid}>
            <label className={`${styles.field} ${styles.fieldWide}`}>
              <span>Nome gara *</span>
              <input value={form.race_name} onChange={e => set('race_name', e.target.value)} placeholder="es. Le Mans 24h" />
            </label>
            <label className={styles.field}>
              <span>Sim *</span>
              <select value={form.sim} onChange={e => set('sim', e.target.value)}>
                {SIM_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className={styles.field}>
              <span>Data e ora *</span>
              <input type="datetime-local" value={form.date} onChange={e => set('date', e.target.value)} />
            </label>
            <label className={styles.field}>
              <span>Durata (min){form.format === 'endurance' ? ' *' : ''}</span>
              <input type="number" min="0" value={form.duration_minutes} onChange={e => set('duration_minutes', e.target.value)} placeholder="es. 1440" />
            </label>
            <label className={styles.field}>
              <span>Formato *</span>
              <select value={form.format} onChange={e => set('format', e.target.value)}>
                {FORMAT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
            <label className={styles.field}>
              <span>Stato *</span>
              <select value={form.status} onChange={e => set('status', e.target.value)}>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </label>
          </div>

          {form.format === 'endurance' && (
            <div className={styles.hint}>
              ℹ Gara endurance: dopo averla creata potrai pianificare gli stint con lo StintPlanner.
            </div>
          )}

          {/* ── Opzionali ── */}
          <button type="button" className={styles.toggleOptional} onClick={() => setShowOptional(v => !v)}>
            {showOptional ? '− Nascondi dettagli opzionali' : '+ Mostra dettagli opzionali'}
          </button>

          {showOptional && (
            <div className={styles.grid}>
              <label className={styles.field}>
                <span>Round</span>
                <input value={form.round} onChange={e => set('round', e.target.value)} />
              </label>
              <label className={styles.field}>
                <span>Track ID</span>
                <input value={form.track_id} onChange={e => set('track_id', e.target.value)} placeholder="es. lmu-lemans-gp" />
              </label>
              <label className={styles.field}>
                <span>Car ID</span>
                <input value={form.car_id} onChange={e => set('car_id', e.target.value)} />
              </label>
              <label className={styles.field}>
                <span>Event type</span>
                <input value={form.event_type} onChange={e => set('event_type', e.target.value)} placeholder="es. 4fun" />
              </label>
              <label className={styles.field}>
                <span>Championship ID</span>
                <input value={form.championship_id} onChange={e => set('championship_id', e.target.value)} />
              </label>
              <label className={styles.field}>
                <span>Meteo</span>
                <input value={form.weather} onChange={e => set('weather', e.target.value)} placeholder="es. Asciutto" />
              </label>
              <label className={`${styles.field} ${styles.fieldWide}`}>
                <span>Broadcast URL</span>
                <input value={form.broadcast_url} onChange={e => set('broadcast_url', e.target.value)} />
              </label>
              <label className={`${styles.field} ${styles.fieldWide}`}>
                <span>Poster URL</span>
                <input value={form.poster_url} onChange={e => set('poster_url', e.target.value)} />
              </label>
              <label className={`${styles.field} ${styles.fieldFull}`}>
                <span>Note</span>
                <textarea rows="2" value={form.notes} onChange={e => set('notes', e.target.value)} />
              </label>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose} disabled={saving}>Annulla</button>
          <button className={styles.saveBtn} onClick={handleSubmit} disabled={saving}>
            {saving ? 'Salvataggio…' : (isEdit ? 'Salva modifiche' : 'Crea gara')}
          </button>
        </div>
      </div>
    </div>
  );
}
