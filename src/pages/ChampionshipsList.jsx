import { Link } from 'react-router-dom';
import { useChampionships } from '../hooks/useChampionships';
import styles from './ChampionshipsList.module.css';

const STATUS_ORDER = ['active', 'upcoming', 'completed', 'draft'];
const STATUS_LABELS = {
  active: 'Attivi',
  upcoming: 'In arrivo',
  completed: 'Conclusi',
  draft: 'Bozze',
};

function formatDate(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString('it-IT', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export default function ChampionshipsList() {
  const { data: championships, isLoading } = useChampionships();

  if (isLoading) {
    return <div className={styles.page}>Caricamento campionati…</div>;
  }

  if (!championships || championships.length === 0) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <h1>Campionati</h1>
        </header>
        <div className={styles.empty}>Nessun campionato disponibile.</div>
      </div>
    );
  }

  const groups = {};
  championships.forEach(c => {
    const status = c.status || 'draft';
    if (!groups[status]) groups[status] = [];
    groups[status].push(c);
  });

  Object.values(groups).forEach(group => {
    group.sort((a, b) => {
      const ad = a.start_date ? new Date(a.start_date).getTime() : 0;
      const bd = b.start_date ? new Date(b.start_date).getTime() : 0;
      return bd - ad;
    });
  });

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Campionati</h1>
        <p className={styles.subtitle}>
          Tutte le competizioni VSD. Clicca su un campionato per vederne classifica, round e dettagli.
        </p>
      </header>

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
              {list.map(c => (
                <Link
                  key={c.id}
                  to={`/championships/${c.id}`}
                  className={`${styles.card} ${styles[`card_${status}`]} ${c.banner_url ? styles.cardWithBanner : ''}`}
                >
                  {/* Banner poster — solo se disponibile */}
                  {c.banner_url && (
                    <div className={styles.cardBanner}>
                      <img
                        src={c.banner_url}
                        alt={c.name}
                        className={styles.cardBannerImg}
                      />
                      <div className={styles.cardBannerOverlay}>
                        <span className={`${styles.statusPill} ${styles[`pill_${status}`]}`}>
                          {STATUS_LABELS[status]}
                        </span>
                        <span className={styles.sim}>{c.sim}</span>
                      </div>
                    </div>
                  )}

                  {/* Header senza banner */}
                  {!c.banner_url && (
                    <div className={styles.cardHeader}>
                      <span className={`${styles.statusPill} ${styles[`pill_${status}`]}`}>
                        {STATUS_LABELS[status]}
                      </span>
                      <span className={styles.sim}>{c.sim}</span>
                    </div>
                  )}

                  <h3 className={styles.cardName}>{c.name}</h3>

                  <div className={styles.cardMeta}>
                    <span>{c.season}</span>
                    <span>·</span>
                    <span>{c.format}</span>
                  </div>

                  {(c.start_date || c.end_date) && (
                    <div className={styles.dates}>
                      {formatDate(c.start_date) || '?'}
                      {' → '}
                      {formatDate(c.end_date) || 'in corso'}
                    </div>
                  )}

                  <div className={styles.cardFooter}>Vedi classifica →</div>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}