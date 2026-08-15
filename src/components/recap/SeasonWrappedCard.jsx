import Avatar from '../shared/Avatar';
import styles from './SeasonWrappedCard.module.css';

/**
 * SeasonWrappedCard — versione "condivisibile" del Season Recap dati
 * (SeasonRecap.jsx), stile driver-card: foto/avatar in alto che sfuma
 * nel blu del brand, statistiche stagione sotto.
 *
 * Foto: usa discordAvatarUrl (già disponibile via useAuth dopo il
 * login — Wave 10.2.Y) invece di un mapping manuale foto→driver_id,
 * che introdurrebbe rischio di associare la foto sbagliata alla
 * persona sbagliata. Se assente, ricade sull'Avatar a iniziali già
 * usato nel resto dell'app — nessuno stato "rotto".
 *
 * Puramente presentazionale: tutti i dati arrivano già risolti da
 * SeasonRecap.jsx (che ha già i lookup pista/sim), per restare
 * riusabile senza duplicare quella logica qui dentro.
 */
export default function SeasonWrappedCard({
  driverName,
  avatarUrl,
  races,
  podiums,
  bestFinishLabel,
  bestLapDisplay,
  bestLapTrackLabel,
  mostRacedTrackLabel,
  topSimLabel,
}) {
  return (
    <div className={styles.card}>
      <div className={styles.photoArea}>
        {avatarUrl ? (
          <img src={avatarUrl} alt={driverName} className={styles.photo} />
        ) : (
          <div className={styles.photoFallback}>
            <Avatar name={driverName} size={96} />
          </div>
        )}
        <div className={styles.photoFade} />
        <div className={styles.nameplate}>
          <div className={styles.driverName}>{driverName}</div>
          {topSimLabel && <div className={styles.simTag}>{topSimLabel}</div>}
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.eyebrow}>Stagione 2026</div>

        <div className={styles.heroGrid}>
          <div className={`${styles.heroCard} ${styles.heroCardCyan}`}>
            <div className={styles.heroValue}>{races}</div>
            <div className={styles.heroLabel}>Gare corse</div>
          </div>
          <div className={`${styles.heroCard} ${styles.heroCardAmber}`}>
            <div className={styles.heroValue}>{podiums}</div>
            <div className={styles.heroLabel}>Podi</div>
          </div>
        </div>

        {bestFinishLabel && (
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Miglior risultato</div>
            <div className={styles.statValue}>{bestFinishLabel}</div>
          </div>
        )}

        {bestLapDisplay && (
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Miglior giro{bestLapTrackLabel ? ` · ${bestLapTrackLabel}` : ''}</div>
            <div className={styles.statValue}>{bestLapDisplay}</div>
          </div>
        )}

        {mostRacedTrackLabel && (
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Pista preferita</div>
            <div className={styles.statValue}>{mostRacedTrackLabel}</div>
          </div>
        )}

        <div className={styles.footer}>
          <span>vsd-paddock.vercel.app</span>
          <span>🏁</span>
        </div>
      </div>
    </div>
  );
}
