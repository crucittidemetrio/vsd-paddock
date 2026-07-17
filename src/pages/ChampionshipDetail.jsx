import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useChampionshipStandings } from '../hooks/useChampionshipStandings';
import { useDrivers } from '../hooks/useRoster';
import Avatar from '../components/shared/Avatar';
import SimBadge from '../components/shared/SimBadge';
import { formatDate, formatTrack } from '../utils/format';
import styles from './ChampionshipDetail.module.css';

const STATUS_LABEL = {
  active: 'In corso',
  upcoming: 'Prossimamente',
  completed: 'Completato',
  draft: 'Bozza',
};

export default function ChampionshipDetail() {
  const { championshipId } = useParams();
  const { data, isLoading, error } = useChampionshipStandings(championshipId);
  const { data: drivers } = useDrivers();

  const [selectedClass, setSelectedClass] = useState(null);

  const driverMap = useMemo(() => {
    const m = {};
    (drivers || []).forEach(d => { m[d.driver_id] = d; });
    return m;
  }, [drivers]);

  // Auto-select first class when data arrives
  const activeClass = useMemo(() => {
    if (!data?.classes?.length) return null;
    if (selectedClass) {
      return data.classes.find(c => c.class_name === selectedClass) || data.classes[0];
    }
    return data.classes[0];
  }, [data, selectedClass]);

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.skeleton} />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.errorBox}>
          <h2>Errore</h2>
          <p>{error.message}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { championship, classes, rounds, points_configured } = data;
  const champion = activeClass?.standings?.[0];

  return (
    <div className={styles.container}>
      {/* HERO BANNER — se banner_url disponibile */}
      {championship.banner_url ? (
        <div className={styles.heroBanner}>
          <img
            src={championship.banner_url}
            alt={championship.name}
            className={styles.heroBannerImg}
          />
          <div className={styles.heroBannerOverlay}>
            <div className={styles.eyebrow}>Campionato</div>
            <h1 className={styles.heroTitle}>{championship.name}</h1>
            <div className={styles.heroMeta}>
              <SimBadge sim={championship.sim} size="sm" />
              <span className={styles.metaItem}>Stagione {championship.season}</span>
              <span className={styles.metaItem}>{STATUS_LABEL[championship.status] || championship.status}</span>
              {championship.format && (
                <span className={styles.metaItem}>{championship.format}</span>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* HEADER standard — nessun banner */
        <header className={styles.header}>
          <div className={styles.eyebrow}>Campionato</div>
          <h1 className={styles.title}>{championship.name}</h1>
          <div className={styles.meta}>
            <SimBadge sim={championship.sim} size="sm" />
            <span className={styles.metaItem}>Stagione {championship.season}</span>
            <span className={styles.metaItem}>{STATUS_LABEL[championship.status] || championship.status}</span>
            {championship.format && (
              <span className={styles.metaItem}>{championship.format}</span>
            )}
          </div>
          {championship.notes && (
            <p className={styles.notes}>{championship.notes}</p>
          )}
        </header>
      )}

      {/* Banner se punti non configurati */}
      {!points_configured && rounds.length > 0 && (
        <div className={styles.warningBanner}>
          ⚠️ Punti non configurati nel JSON sorgente. La classifica usa solo i tie-break (vittorie → podi → miglior piazzamento).
        </div>
      )}

      {/* Nessun round */}
      {rounds.length === 0 ? (
        <div className={styles.emptyBox}>
          <div className={styles.emptyIcon}>∅</div>
          <h2>Nessun round di campionato</h2>
          <p>
            Per popolare la classifica, tagga almeno una gara nel sheet con<br />
            <code>event_type=championship</code> e <code>championship_id={championshipId}</code>,<br />
            poi importa i risultati via <Link to="/admin/import-results">Importa risultati</Link>.
          </p>
        </div>
      ) : (
        <>
          {/* CHAMPION CARD (se completed) */}
          {championship.status === 'completed' && champion && (
            <div className={styles.championCard}>
              <div className={styles.championLabel}>🏆 Campione {activeClass.class_name}</div>
              <DriverDisplay
                driver={champion}
                driverInfo={driverMap[champion.driver_id]}
                size={48}
                emphasis
              />
              <div className={styles.championStats}>
                {champion.total_points} pts · {champion.wins} vittorie · {champion.podiums} podi
              </div>
            </div>
          )}

          {/* CLASS TABS */}
          {classes.length > 1 && (
            <div className={styles.classTabs}>
              {classes.map(c => (
                <button
                  key={c.class_name}
                  onClick={() => setSelectedClass(c.class_name)}
                  className={`${styles.classTab} ${activeClass?.class_name === c.class_name ? styles.classTabActive : ''}`}
                >
                  {c.class_name}
                  <span className={styles.classTabCount}>{c.standings.length}</span>
                </button>
              ))}
            </div>
          )}

          {/* STANDINGS TABLE */}
          {activeClass && (
            <section className={styles.standingsSection}>
              {classes.length === 1 && (
                <h2 className={styles.classHeading}>{activeClass.class_name}</h2>
              )}
              <div className={styles.tableWrap}>
                <table className={styles.standingsTable}>
                  <thead>
                    <tr>
                      <th className={styles.colPos}>#</th>
                      <th>Pilota</th>
                      <th className={styles.num}>Punti</th>
                      <th className={styles.num}>Gare</th>
                      <th className={styles.num}>W</th>
                      <th className={styles.num}>P</th>
                      <th className={styles.num}>Best</th>
                      <th className={styles.num}>DNF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeClass.standings.map(s => {
                      const podium = s.position <= 3;
                      const rowClass = [
                        s.is_vsd ? styles.rowVsd : '',
                        podium ? styles[`podium${s.position}`] : '',
                      ].filter(Boolean).join(' ');
                      return (
                        <tr key={`${s.driver_id || s.driver_name_external}__${s.car_class}`} className={rowClass}>
                          <td className={styles.colPos}>
                            <span className={styles.posBadge}>{s.position}</span>
                          </td>
                          <td>
                            <DriverDisplay
                              driver={s}
                              driverInfo={driverMap[s.driver_id]}
                              size={28}
                            />
                          </td>
                          <td className={styles.num}>
                            <strong>{s.total_points}</strong>
                          </td>
                          <td className={styles.num}>{s.races_count}</td>
                          <td className={styles.num}>{s.wins || '—'}</td>
                          <td className={styles.num}>{s.podiums || '—'}</td>
                          <td className={styles.num}>{s.best_finish ?? '—'}</td>
                          <td className={styles.num}>{s.dnfs || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ROUNDS */}
          <section className={styles.roundsSection}>
            <h2 className={styles.classHeading}>Round</h2>
            <div className={styles.roundsList}>
              {rounds.map(r => (
                <Link
                  key={r.race_id}
                  to={`/race/${r.race_id}`}
                  className={styles.roundCard}
                >
                  <div className={styles.roundNum}>
                    {r.round ? `R${r.round}` : r.race_id}
                  </div>
                  <div className={styles.roundInfo}>
                    <div className={styles.roundName}>{r.race_name}</div>
                    <div className={styles.roundMeta}>
                      {formatDate(r.date)} · {r.status}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/**
 * Componente helper per renderizzare il pilota:
 * VSD → avatar + nome + badge + link al profilo
 * Esterno → solo nome
 */
function DriverDisplay({ driver, driverInfo, size = 28, emphasis = false }) {
  const isVsd = driver.is_vsd;

  if (isVsd && driverInfo) {
    return (
      <Link to={`/roster/${driverInfo.driver_id}`} className={styles.driverLink}>
        <Avatar
          name={driverInfo.display_name}
          driverId={driverInfo.driver_id}
          size={size}
        />
        <span className={emphasis ? styles.driverNameEmphasis : styles.driverName}>
          {driverInfo.display_name}
        </span>
        <span className={styles.vsdBadge}>VSD</span>
      </Link>
    );
  }

  return (
    <span className={styles.driverExternal}>
      {driver.display_name || driver.driver_name_external || 'Unknown'}
    </span>
  );
}