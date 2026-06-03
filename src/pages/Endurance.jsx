import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuditions } from '../hooks/useEndurance';
import { useTracks } from '../hooks/useLookups';
import SimBadge from '../components/shared/SimBadge';
import CategoryPill from '../components/shared/CategoryPill';
import { formatTrack } from '../utils/format';
import styles from './Endurance.module.css';

const STATUS_ORDER = ['scheduled', 'in_progress', 'completed', 'cancelled'];
const STATUS_LABELS = {
  draft: 'Bozza',
  scheduled: 'Programmate',
  in_progress: 'In Corso',
  completed: 'Concluse',
  cancelled: 'Annullate',
};

function formatAuditionDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('it-IT', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatIngameDuration(minutes) {
  if (!minutes) return '—';
  const m = Number(minutes);
  if (Number.isNaN(m)) return '—';
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}min`;
  if (r === 0) return `${h}h`;
  return `${h}h ${r}min`;
}

function formatRealDuration(minutes) {
  if (!minutes) return '—';
  const m = Number(minutes);
  if (Number.isNaN(m)) return '—';
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h}h` : `${h}h ${r}min`;
}

export default function Endurance() {
  const { data: auditions, isLoading, error } = useAuditions();
  const { data: tracks = [] } = useTracks();

  const groups = useMemo(() => {
    if (!auditions) return {};
    const g = {};
    auditions.forEach(a => {
      const s = a.status || 'draft';
      if (!g[s]) g[s] = [];
      g[s].push(a);
    });
    Object.values(g).forEach(list => {
      list.sort((a, b) => new Date(a.date) - new Date(b.date));
    });
    if (g.completed) g.completed.reverse();
    return g;
  }, [auditions]);

  if (isLoading) {
    return (
      <div className={styles.page}>
        <Header />
        <div className={styles.empty}>Caricamento audizioni…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.page}>
        <Header />
        <div className={styles.errorBox}>
          Errore nel caricamento delle audizioni. Riprova più tardi.
        </div>
      </div>
    );
  }

  const hasAny = STATUS_ORDER.some(s => groups[s]?.length > 0);

  return (
    <div className={styles.page}>
      <Header />

      {!hasAny && (
        <div className={styles.empty}>
          Nessuna audizione attiva al momento.
          Lo staff annuncerà le prossime sessioni nel Discord team.
        </div>
      )}

      {STATUS_ORDER.map(status => {
        const list = groups[status];
        if (!list || list.length === 0) return null;
        return (
          <section key={status} className={styles.section}>
            <h2 className={styles.sectionTitle}>
              {STATUS_LABELS[status]}
              <span className={styles.count}>{list.length}</span>
            </h2>
            <div className={styles.grid}>
              {list.map(a => (
                <AuditionCard
                  key={a.audition_id}
                  audition={a}
                  tracks={tracks}
                  status={status}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.eyebrow}>ENDURANCE</div>
      <h1 className={styles.title}>Audizioni Endurance</h1>
      <p className={styles.subtitle}>
        Sistema di selezione piloti per le gare endurance VSD.
        Multi-criteria scoring su 7 metriche: pace, consistenza,
        long-run delta, gestione traffico, cleanliness.
      </p>
    </header>
  );
}

function AuditionCard({ audition, tracks, status }) {
  const ingameWindow =
    audition.start_time_ingame && audition.end_time_ingame
      ? `${audition.start_time_ingame} → ${audition.end_time_ingame}`
      : '—';

  // Label singolare per pill (Programmate → Programmata, etc.)
  const PILL_SINGULAR = {
    scheduled: 'Programmata',
    in_progress: 'In Corso',
    completed: 'Conclusa',
    cancelled: 'Annullata',
  };

  return (
    <Link
      to={`/endurance/${audition.audition_id}`}
      className={`${styles.card} ${styles[`card_${status}`]}`}
    >
      <div className={styles.cardHeader}>
        <span className={`${styles.statusPill} ${styles[`pill_${status}`]}`}>
          {PILL_SINGULAR[status] || status}
        </span>
        <SimBadge sim={audition.sim} variant="solid" size="sm" />
      </div>

      <h3 className={styles.cardTitle}>{audition.name}</h3>

      <div className={styles.cardMetaRow}>
        {audition.pilot_class && <CategoryPill category={audition.pilot_class} />}
        <span className={styles.dateText}>{formatAuditionDate(audition.date)}</span>
      </div>

      <div className={styles.infoGrid}>
        <InfoCell
          label="Tracciato"
          value={formatTrack(audition.track_id, tracks)}
        />
        <InfoCell
          label="Durata reale"
          value={formatRealDuration(audition.duration_minutes_real)}
        />
        <InfoCell
          label="Durata in-game"
          value={formatIngameDuration(audition.duration_minutes_ingame)}
        />
        <InfoCell label="Finestra in-game" value={ingameWindow} />
      </div>

      <div className={styles.cardFooter}>Dettagli e partecipanti →</div>
    </Link>
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
