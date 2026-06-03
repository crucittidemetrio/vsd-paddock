import { useParams, Link } from 'react-router-dom';
import { useAudition } from '../hooks/useEndurance';
import { useTracks, useCars } from '../hooks/useLookups';
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
  return car?.display_name || car?.name || carId;
}

function formatWeather(value) {
  if (!value) return '—';
  return String(value).charAt(0).toUpperCase() + String(value).slice(1);
}

export default function EnduranceDetail() {
  const { auditionId } = useParams();
  const { data: audition, isLoading, error } = useAudition(auditionId);
  const { data: tracks = [] } = useTracks();
  const { data: cars = [] } = useCars();

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

  return (
    <div className={styles.page}>
      <Link to="/endurance" className={styles.back}>← Audizioni</Link>

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

      <Section title="Partecipanti">
        <div className={styles.placeholder}>
          <div className={styles.placeholderTitle}>Iscrizioni gestite via Discord</div>
          <div className={styles.placeholderText}>
            Per partecipare a questa audizione comunica la tua disponibilità
            nel canale Discord del team. Il sistema di iscrizione automatica
            sarà disponibile a breve.
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
