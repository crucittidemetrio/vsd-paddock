import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useReportIncident } from '../../hooks/useIncidents';
// Riuso deliberato dello stesso CSS module già condiviso da
// ChampionshipInterestSection (vedi lì per il perché) — stesse classi
// form/formGroup/select/textarea/btn, coerenza visiva senza duplicare CSS.
import styles from '../../pages/AciLmgt3Challenge.module.css';

const INCIDENT_TYPES = [
  '', 'Contatto in gara', 'Track limits ripetuti', 'Blocking/difesa scorretta',
  'Comportamento antisportivo', 'Rejoin pericoloso', 'Altro',
];

/**
 * IncidentReportSection — form nativo di segnalazione incidenti (#351),
 * sostituisce il vecchio Google Form esterno ("VSD - Modulo reclamo").
 * Pubblico/community-wide come il Form che sostituisce: nessun login
 * richiesto (le leghe come UE144 sono multi-team, non solo piloti VSD).
 * Se il chiamante è un pilota VSD loggato, il nome è precompilato e il
 * reporter_driver_id viene risolto automaticamente lato backend.
 *
 * @param {Object} props
 * @param {string} [props.anchorId]
 * @param {string} [props.championship] - valore fisso salvato con la segnalazione (es. "UE144")
 * @param {string} [props.eyebrow]
 * @param {string} [props.title]
 */
export default function IncidentReportSection({
  anchorId = 'segnalazioni',
  championship = '',
  eyebrow = 'Direzione Gara',
  title = 'Proteste',
}) {
  const { driver, isVsdPilot } = useAuth();
  const [open, setOpen] = useState(false);
  const [reporterSim, setReporterSim] = useState('');
  const [reporterDiscord, setReporterDiscord] = useState('');
  const [against, setAgainst] = useState('');
  const [track, setTrack] = useState('');
  const [lap, setLap] = useState('');
  const [timeInRace, setTimeInRace] = useState('');
  const [incidentType, setIncidentType] = useState('');
  const [description, setDescription] = useState('');
  const [feedback, setFeedback] = useState(null);

  const reportMutation = useReportIncident();

  async function handleSubmit(e) {
    e.preventDefault();
    setFeedback(null);
    const reporterName = isVsdPilot ? (driver?.display_name || reporterSim) : reporterSim;
    if (!reporterName?.trim()) {
      setFeedback({ ok: false, message: 'Inserisci il tuo nome.' });
      return;
    }
    try {
      await reportMutation.mutateAsync({
        reporter_sim: reporterName.trim(),
        reporter_discord: reporterDiscord.trim(),
        against: against.trim(),
        track: track.trim(),
        lap: lap.trim(),
        time_in_race: timeInRace.trim(),
        incident_type: incidentType,
        description: description.trim(),
        championship,
      });
      setFeedback({ ok: true, message: 'Segnalazione inviata. La Direzione Gara la esaminerà entro 48h.' });
      setReporterSim('');
      setReporterDiscord('');
      setAgainst('');
      setTrack('');
      setLap('');
      setTimeInRace('');
      setIncidentType('');
      setDescription('');
    } catch (err) {
      setFeedback({ ok: false, message: err.message || 'Errore durante l’invio.' });
    }
  }

  return (
    <section id={anchorId} className={styles.section}>
      <div className={styles.sectionEyebrow}>{eyebrow}</div>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <div className={styles.protestBox}>
        <div className={styles.protestRow}>
          <span className={styles.protestIcon}>💬</span>
          <span>Invia la segnalazione tramite il modulo qui sotto entro <strong>48 ore</strong> dal termine della gara</span>
        </div>
        <div className={styles.protestRow}>
          <span className={styles.protestIcon}>🎬</span>
          <span>Allega link a una <strong>clip video</strong> se disponibile (telemetria consigliata)</span>
        </div>
        <div className={styles.protestRow}>
          <span className={styles.protestIcon}>⚖️</span>
          <span>Le decisioni della Direzione Gara sono <strong>inappellabili</strong> e basate esclusivamente sui dati</span>
        </div>
      </div>

      <button
        type="button"
        className={`${styles.btn} ${styles.btnPrimary}`}
        style={{ marginTop: 'var(--sp-4, 16px)' }}
        onClick={() => setOpen(v => !v)}
      >
        {open ? 'Chiudi il form' : 'Segnala un incidente'}
      </button>

      {open && (
        <form className={styles.form} onSubmit={handleSubmit} style={{ marginTop: 20 }}>
          {isVsdPilot ? (
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Pilota segnalante</label>
              <div className={styles.formStaticValue}>{driver?.display_name} (roster VSD)</div>
            </div>
          ) : (
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor={`${anchorId}-from`}>Il tuo nome</label>
              <input
                id={`${anchorId}-from`} type="text" className={styles.input}
                value={reporterSim} onChange={e => setReporterSim(e.target.value)}
                maxLength={80} required
              />
            </div>
          )}

          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor={`${anchorId}-to`}>Pilota/team segnalato</label>
            <input
              id={`${anchorId}-to`} type="text" className={styles.input}
              value={against} onChange={e => setAgainst(e.target.value)}
              maxLength={80} required
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor={`${anchorId}-track`}>Circuito (opzionale)</label>
            <input
              id={`${anchorId}-track`} type="text" className={styles.input}
              value={track} onChange={e => setTrack(e.target.value)}
              maxLength={80}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor={`${anchorId}-lap`}>Giro (opzionale)</label>
            <input
              id={`${anchorId}-lap`} type="text" className={styles.input}
              value={lap} onChange={e => setLap(e.target.value)}
              maxLength={20}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor={`${anchorId}-time`}>Minuto:secondo (opzionale)</label>
            <input
              id={`${anchorId}-time`} type="text" className={styles.input}
              value={timeInRace} onChange={e => setTimeInRace(e.target.value)}
              placeholder="es. 12:34" maxLength={20}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor={`${anchorId}-type`}>Tipologia (opzionale)</label>
            <select
              id={`${anchorId}-type`} className={styles.select}
              value={incidentType} onChange={e => setIncidentType(e.target.value)}
            >
              {INCIDENT_TYPES.map(t => (
                <option key={t} value={t}>{t || 'Non specificata'}</option>
              ))}
            </select>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor={`${anchorId}-desc`}>Descrizione</label>
            <textarea
              id={`${anchorId}-desc`} className={styles.textarea} rows={4}
              value={description} onChange={e => setDescription(e.target.value)}
              maxLength={2000} required
            />
          </div>

          {!isVsdPilot && (
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor={`${anchorId}-discord`}>Discord (opzionale)</label>
              <input
                id={`${anchorId}-discord`} type="text" className={styles.input}
                value={reporterDiscord} onChange={e => setReporterDiscord(e.target.value)}
                placeholder="username#0000" maxLength={60}
              />
            </div>
          )}

          <button
            type="submit"
            className={`${styles.btn} ${styles.btnPrimary}`}
            disabled={reportMutation.isPending}
          >
            {reportMutation.isPending ? 'Invio…' : 'Invia segnalazione'}
          </button>

          {feedback && (
            <div className={feedback.ok ? styles.formSuccess : styles.formError}>
              {feedback.message}
            </div>
          )}
        </form>
      )}
    </section>
  );
}
