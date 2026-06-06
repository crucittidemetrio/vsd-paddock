import { useParams, Link } from 'react-router-dom';
import { useAudition } from '../hooks/useEndurance';
import { useParticipants } from '../hooks/useEnduranceParticipants';
import { useTracks, useCars } from '../hooks/useLookups';
import { useDrivers } from '../hooks/useRoster';
import SimBadge from '../components/shared/SimBadge';
import CategoryPill from '../components/shared/CategoryPill';
import { formatTrack } from '../utils/format';
import styles from './EnduranceDetail.module.css';

const STATUS_LABELS = {
  draft: 'Bozza',
  scheduled: 'Programmata',
  in_progress: 'In Corso',
  completed: 'Conclusa',
  cancelled: 'Annullata',
};

const PARTICIPANT_STATUS_LABELS = {
  registered: 'Iscritto',
  accepted: 'Accettato',
  reserve: 'Riserva',
};

// status non mostrati pubblicamente
const PARTICIPANT_HIDDEN_STATUSES = new Set(['rejected', 'withdrawn']);

const DISCORD_INVITE = 'https://discord.gg/hdt8uHEfsy';

function formatDate(iso, withTime = true) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('it-IT', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    });
  } catch {
    return iso;
  }
}

function formatDuration(minutes) {
  if (!minutes) return '—';
  const m = Number(minutes);
  if (Number.isNaN(m)) return '—';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h}h` : `${h}h ${r}min`;
}

function formatCarName(carId, cars) {
  if (!carId) return '—';
  const car = (cars || []).find(c => c.car_id === carId);
  if (!car) return carId;
  return car.car_name
    || car.display_name
    || [car.manufacturer, car.model].filter(Boolean).join(' ')
    || car.car_id;
}

function formatWeather(value) {
  if (!value) return '—';
  return String(value).charAt(0).toUpperCase() + String(value).slice(1);
}

function formatDetailedCountdown(iso) {
  if (!iso) return null;
  try {
    const target = new Date(iso).getTime();
    const now = Date.now();
    const diff = target - now;
    if (diff < 0) {
      return { isPast: true, label: 'Gara già disputata' };
    }
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) {
      return {
        isPast: false,
        label: hours > 0 ? `${days} giorni, ${hours} ore` : `${days} giorni`,
      };
    }
    if (hours > 0) {
      return {
        isPast: false,
        label: minutes > 0 ? `${hours} ore, ${minutes} min` : `${hours} ore`,
      };
    }
    return { isPast: false, label: `${minutes} minuti` };
  } catch {
    return null;
  }
}

export default function EnduranceDetail() {
  const { auditionId } = useParams();
  const { data: audition, isLoading, error } = useAudition(auditionId);
  const { data: tracks = [] } = useTracks();
  const { data: cars = [] } = useCars();
  const { data: participants = [], isLoading: pLoading } = useParticipants(auditionId);
  const { data: drivers = [] } = useDrivers();

  if (isLoading) {
    return (
      <div className={styles.page}>
        <Link to="/endurance" className={styles.back}>← Audizioni</Link>
        <div className={styles.empty}>Caricamento audizione…</div>
      </div>
    );
  }

  if (error || !audition) {
    return (
      <div className={styles.page}>
        <Link to="/endurance" className={styles.back}>← Audizioni</Link>
        <div className={styles.errorBox}>
          Audizione non trovata o non disponibile pubblicamente.
        </div>
      </div>
    );
  }

  const status = audition.status || 'draft';
  const fieldSizeTotal =
    (Number(audition.field_size_hypercar) || 0) +
    (Number(audition.field_size_lmp2) || 0) +
    (Number(audition.field_size_gt3) || 0);

  const targetRace = audition.target_race;
  const targetRaceDate = audition.target_race_date;
  const countdown = formatDetailedCountdown(targetRaceDate);

  // Build driverId → driver map
  const driverMap = {};
  (drivers || []).forEach(d => { driverMap[d.driver_id] = d; });

  // Filter participants visibili pubblicamente
  const visibleParticipants = (participants || []).filter(p => !PARTICIPANT_HIDDEN_STATUSES.has(p.status));

  return (
    <div className={styles.page}>
      <Link to="/endurance" className={styles.back}>← Audizioni</Link>

      {targetRace && (
        <div className={styles.targetRaceHero}>
          <div className={styles.targetRaceLabel}>🎯 Per la gara</div>
          <div className={styles.targetRaceName}>{targetRace}</div>
          {countdown && !countdown.isPast && (
            <div className={styles.targetRaceCountdown}>
              <span className={styles.countdownLabel}>Mancano:</span>
              <span className={styles.countdownValue}>{countdown.label}</span>
              {targetRaceDate && (
                <span className={styles.countdownDate}>
                  · {formatDate(targetRaceDate)}
                </span>
              )}
            </div>
          )}
          {countdown && countdown.isPast && (
            <div className={styles.targetRaceCountdown}>
              <span className={styles.countdownLabel}>{countdown.label}</span>
              {targetRaceDate && (
                <span className={styles.countdownDate}>
                  · {formatDate(targetRaceDate)}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      <header className={styles.header}>
        <div className={styles.headerTop}>
          <span className={`${styles.statusPill} ${styles[`pill_${status}`]}`}>
            {STATUS_LABELS[status] || status}
          </span>
          <SimBadge sim={audition.sim} variant="solid" size="md" />
        </div>
        <h1 className={styles.title}>{audition.name}</h1>
        <div className={styles.headerMeta}>
          {audition.pilot_class && <CategoryPill category={audition.pilot_class} />}
          <span className={styles.dateText}>{formatDate(audition.date)}</span>
        </div>
      </header>

      <Section title="Sessione">
        <div className={styles.grid2}>
          <InfoCell label="Tracciato" value={formatTrack(audition.track_id, tracks)} />
          <InfoCell
            label="Auto obbligatoria"
            value={formatCarName(audition.mandatory_car_id, cars)}
          />
          <InfoCell label="Classe pilota" value={audition.pilot_class || '—'} />
          <InfoCell label="Meteo" value={formatWeather(audition.weather_condition)} />
        </div>
      </Section>

      {(audition.setup_url || audition.setup_notes) && (
        <Section title="Setup">
          {audition.setup_url && (
            <a
              href={audition.setup_url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.setupButton}
            >
              ↗ Apri Setup
            </a>
          )}
          {audition.setup_notes && (
            <div className={styles.notesBox}>
              <div className={styles.notesLabel}>Note Setup</div>
              <div className={styles.notesText}>{audition.setup_notes}</div>
            </div>
          )}
        </Section>
      )}

      <Section title="Configurazione Sessione">
        <div className={styles.grid3}>
          <InfoCell
            label="Durata reale"
            value={formatDuration(audition.duration_minutes_real)}
          />
          <InfoCell
            label="Multiplier"
            value={audition.time_multiplier ? `${audition.time_multiplier}x` : '—'}
          />
          <InfoCell
            label="Durata in-game"
            value={formatDuration(audition.duration_minutes_ingame)}
          />
          <InfoCell label="Inizio in-game" value={audition.start_time_ingame || '—'} />
          <InfoCell label="Fine in-game" value={audition.end_time_ingame || '—'} />
          <InfoCell
            label="AI Strength"
            value={audition.ai_strength_pct ? `${audition.ai_strength_pct}%` : '—'}
          />
        </div>
      </Section>

      <Section title="Composizione Field">
        <div className={styles.grid3}>
          <InfoCell label="Hypercar" value={audition.field_size_hypercar ?? 0} />
          <InfoCell label="LMP2" value={audition.field_size_lmp2 ?? 0} />
          <InfoCell label="GT3 / LMGT3" value={audition.field_size_gt3 ?? 0} />
        </div>
        <div className={styles.fieldTotal}>
          Totale auto in pista: <strong>{fieldSizeTotal}</strong>
        </div>
      </Section>

      {/* ════════ PARTECIPANTI ════════ */}
      <Section title={`Partecipanti (${visibleParticipants.length})`}>
        {pLoading && (
          <div className={styles.placeholderText}>Caricamento partecipanti…</div>
        )}

        {!pLoading && visibleParticipants.length === 0 && (
          <div className={styles.placeholder}>
            <div className={styles.placeholderTitle}>Nessun pilota iscritto</div>
            <div className={styles.placeholderText}>
              Le iscrizioni saranno annunciate sul canale Discord del team.
              Se vuoi candidarti, contatta lo staff.
            </div>
            <a
              href={DISCORD_INVITE}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.discordButton}
            >
              Apri Discord →
            </a>
          </div>
        )}

        {!pLoading && visibleParticipants.length > 0 && (
          <div className={styles.participantsGrid}>
            {visibleParticipants.map(p => {
              const driver = driverMap[p.driver_id];
              const label = driver ? driver.display_name : p.driver_id;
              return (
                <Link
                  key={p.participation_id}
                  to={`/roster/${p.driver_id}`}
                  className={styles.participantCard}
                >
                  <div className={`${styles.participantStatusBadge} ${styles[`statusBadge_${p.status}`]}`}>
                    {PARTICIPANT_STATUS_LABELS[p.status] || p.status}
                  </div>
                  <div className={styles.participantCardName}>{label}</div>
                  <div className={styles.participantCardId}>{p.driver_id}</div>
                </Link>
              );
            })}
          </div>
        )}
      </Section>

      <div className={styles.footer}>
        ID audizione: <code>{audition.audition_id}</code>
        {audition.created_at && <> · Creata {formatDate(audition.created_at, false)}</>}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  );
}

function InfoCell({ label, value }) {
  return (
    <div className={styles.infoCell}>
      <div className={styles.infoLabel}>{label}</div>
      <div className={styles.infoValue}>{value}</div>
    </div>
  );
}
