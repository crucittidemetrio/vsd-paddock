import { useState, useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useReportIncident } from '../../hooks/useIncidents';
import { useRaces } from '../../hooks/useRaces';
import { useChampionships } from '../../hooks/useChampionships';
// Riuso deliberato dello stesso CSS module già condiviso da
// ChampionshipInterestSection (vedi lì per il perché) — stesse classi
// form/formGroup/select/textarea/btn, coerenza visiva senza duplicare CSS.
import styles from '../../pages/AciLmgt3Challenge.module.css';

// Le 12 tipologie del modulo originale ("VSD - Modulo reclamo
// ufficiale"), fedeli allo screenshot fornito da Demetrio — prima
// dell'unificazione ne erano rimaste solo 6, divergenti dal Form reale.
const INCIDENT_TYPES = [
  '', 'Contatto evitabile', 'Divebomb (attacco irregolare)', 'Unsafe rejoin',
  'Track limits / vantaggio scorretto', 'Blocco difensivo irregolare',
  'Collisione in fase di sorpasso', 'Tamponamento (rear-end)',
  'Incidente al via (start incident)', 'Unsafe pit entry / exit',
  'Comportamento antisportivo', 'Lag / contatto di rete', 'Altro',
];

const CLASH_ROUNDS = [1, 2, 3];

/**
 * IncidentReportSection — form unico di segnalazione incidenti (#351,
 * unificato 24/09/2026 — "stesso sistema per tutto": prima esisteva
 * anche una versione duplicata e divergente in ClashOfClasses.jsx).
 * Sostituisce il vecchio Google Form esterno ("VSD - Modulo reclamo").
 * Pubblico/community-wide: nessun login richiesto (le leghe come
 * UE144 sono multi-team, non solo piloti VSD; Clash of Classes ammette
 * community non tesserata). Se il chiamante è un pilota VSD loggato,
 * il nome è precompilato e il reporter_driver_id viene risolto
 * automaticamente lato backend.
 *
 * @param {Object} props
 * @param {string} [props.anchorId]
 * @param {'championship'|'race'|'clash'|'auto'} [props.mode='championship'] - 'auto' lascia scegliere l'ambito al segnalante (usato nella pagina standalone /reclami, #408)
 * @param {string} [props.championship] - id campionato fisso (mode='championship'), usato anche per filtrare il selettore Gara
 * @param {string} [props.raceId] - race_id fisso (mode='race', es. da RaceDetail)
 * @param {string} [props.eyebrow]
 * @param {string} [props.title]
 */
export default function IncidentReportSection({
  anchorId = 'segnalazioni',
  mode = 'championship',
  championship = '',
  raceId = '',
  eyebrow = 'Direzione Gara',
  title = 'Proteste',
}) {
  const { driver, isVsdPilot } = useAuth();
  const isAuto = mode === 'auto';
  const [open, setOpen] = useState(false);
  const [reporterSim, setReporterSim] = useState('');
  const [reporterDiscord, setReporterDiscord] = useState('');
  const [against, setAgainst] = useState('');
  const [selectedRaceId, setSelectedRaceId] = useState(raceId || '');
  const [clashRound, setClashRound] = useState(CLASH_ROUNDS[0]);
  const [track, setTrack] = useState('');
  const [lap, setLap] = useState('');
  const [timeInRace, setTimeInRace] = useState('');
  const [incidentType, setIncidentType] = useState('');
  const [description, setDescription] = useState('');
  const [replayUrl, setReplayUrl] = useState('');
  const [feedback, setFeedback] = useState(null);
  // Stato aggiuntivo solo per mode='auto' (#408, pagina /reclami): qui
  // l'"ambito" non arriva da una prop fissa del genitore (RaceDetail/ACI
  // lo sanno già in anticipo), lo sceglie il segnalante — stesso concetto
  // delle scelte statiche "ambito" del comando Discord /segnala-incidente.
  const [ambito, setAmbito] = useState('campionato');
  const [selectedChampionship, setSelectedChampionship] = useState('');

  // effectiveMode: per mode='auto' mappa l'ambito scelto sullo stesso
  // ramo di rendering di 'championship'/'clash' già esistenti; 'gara'
  // è un caso nuovo ("race-picker"), un selettore libero su TUTTE le
  // gare (non scoped a un campionato) — a differenza di mode='race'
  // (raceId fisso da RaceDetail, nessun selettore mostrato).
  const effectiveMode = isAuto
    ? (ambito === 'campionato' ? 'championship' : ambito === 'clash' ? 'clash' : 'race-picker')
    : mode;
  const effectiveChampionship = isAuto ? selectedChampionship : championship;

  // Selettore Gara: per mode='championship' (fisso dal genitore) o per
  // mode='auto' con ambito='campionato'/'gara' — races.list è pubblico
  // via team_slug (#396) anche per un visitatore non loggato.
  const racesQuery = useRaces();
  const racesForPicker = useMemo(() => {
    const all = racesQuery.data?.races || [];
    if (effectiveMode === 'championship') {
      return all.filter(r => !effectiveChampionship || r.championship_id === effectiveChampionship);
    }
    if (effectiveMode === 'race-picker') return all; // ambito='gara' in mode='auto': scelta libera su tutte le gare
    return [];
  }, [racesQuery.data, effectiveMode, effectiveChampionship]);

  // Campionati: solo per mode='auto' (il selettore "ambito"='campionato'
  // deve popolare la select) — nessuna chiamata extra per gli altri mode,
  // dove championship arriva già fissato via prop.
  const championshipsQuery = useChampionships({ enabled: isAuto });
  const championshipOptions = isAuto ? (championshipsQuery.data || []) : [];

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
        replay_url: replayUrl.trim(),
        championship: effectiveMode === 'championship' ? effectiveChampionship : '',
        race_id: mode === 'race' ? raceId : (effectiveMode === 'championship' || effectiveMode === 'race-picker') ? selectedRaceId : '',
        clash_round: effectiveMode === 'clash' ? clashRound : '',
        source: 'web',
      });
      setFeedback({ ok: true, message: 'Segnalazione inviata. La Direzione Gara la esaminerà entro 48h.' });
      setReporterSim('');
      setReporterDiscord('');
      setAgainst('');
      setSelectedRaceId(raceId || '');
      setSelectedChampionship('');
      setTrack('');
      setLap('');
      setTimeInRace('');
      setIncidentType('');
      setDescription('');
      setReplayUrl('');
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
          {isAuto && (
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor={`${anchorId}-ambito`}>Cosa riguarda la segnalazione</label>
              <select
                id={`${anchorId}-ambito`} className={styles.select}
                value={ambito}
                onChange={e => { setAmbito(e.target.value); setSelectedRaceId(''); setSelectedChampionship(''); }}
              >
                <option value="campionato">Campionato</option>
                <option value="gara">Gara specifica</option>
                <option value="clash">Clash of Classes</option>
              </select>
            </div>
          )}

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

          {isAuto && ambito === 'campionato' && (
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor={`${anchorId}-championship`}>Campionato</label>
              <select
                id={`${anchorId}-championship`} className={styles.select}
                value={selectedChampionship} onChange={e => { setSelectedChampionship(e.target.value); setSelectedRaceId(''); }}
              >
                <option value="">Seleziona il campionato…</option>
                {championshipOptions.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {effectiveMode === 'championship' && (
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor={`${anchorId}-race`}>Gara (opzionale)</label>
              <select
                id={`${anchorId}-race`} className={styles.select}
                value={selectedRaceId} onChange={e => setSelectedRaceId(e.target.value)}
              >
                <option value="">Non specifica / generico sul campionato</option>
                {racesForPicker.map(r => (
                  <option key={r.race_id} value={r.race_id}>
                    {r.race_name}{r.date ? ` — ${new Date(r.date).toLocaleDateString('it-IT')}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {effectiveMode === 'race-picker' && (
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor={`${anchorId}-race-free`}>Gara</label>
              <select
                id={`${anchorId}-race-free`} className={styles.select}
                value={selectedRaceId} onChange={e => setSelectedRaceId(e.target.value)}
                required
              >
                <option value="">Seleziona la gara…</option>
                {racesForPicker.map(r => (
                  <option key={r.race_id} value={r.race_id}>
                    {r.race_name}{r.date ? ` — ${new Date(r.date).toLocaleDateString('it-IT')}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {effectiveMode === 'clash' && (
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor={`${anchorId}-round`}>Round</label>
              <select
                id={`${anchorId}-round`} className={styles.select}
                value={clashRound} onChange={e => setClashRound(Number(e.target.value))}
              >
                {CLASH_ROUNDS.map(r => (
                  <option key={r} value={r}>Round {r}</option>
                ))}
              </select>
            </div>
          )}

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
            <label className={styles.formLabel} htmlFor={`${anchorId}-replay`}>Link clip/telemetria (opzionale)</label>
            <input
              id={`${anchorId}-replay`} type="url" className={styles.input}
              value={replayUrl} onChange={e => setReplayUrl(e.target.value)}
              placeholder="Twitch/YouTube/Discord…" maxLength={500}
            />
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
