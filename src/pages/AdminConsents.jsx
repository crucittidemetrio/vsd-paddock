import { useMemo } from 'react';
import { useConsentAdminList } from '../hooks/useConsent';
import styles from './AdminConsents.module.css';

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

export default function AdminConsents() {
  const query = useConsentAdminList();

  const { drivers, withConsent, missing } = useMemo(() => {
    const drivers = query.data?.drivers || [];
    const withConsent = drivers.filter(d => d.consent);
    const missing = drivers.filter(d => !d.consent);
    return { drivers, withConsent, missing };
  }, [query.data]);

  // Mancanti prima, così Demetrio vede subito chi sollecitare.
  const sorted = useMemo(
    () => [...missing, ...withConsent],
    [missing, withConsent]
  );

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>PRIVACY</div>
        <h1 className={styles.title}>Consenso pubblicazione dati</h1>
        <p className={styles.sub}>
          Stato di accettazione per versione documento {query.data?.required_version || '—'}. Chi
          manca non ha ancora registrato le proprie scelte su sito pubblico/social.
        </p>
      </header>

      {query.isLoading && <div className={styles.loading}>Caricamento…</div>}
      {query.error && <div className={styles.errorBox}>Errore: {query.error.message}</div>}

      {!query.isLoading && !query.error && (
        <>
          <div className={styles.summaryRow}>
            <span className={styles.summaryChip}>{drivers.length} piloti attivi/trial</span>
            <span className={`${styles.summaryChip} ${styles.summaryChipOk}`}>
              {withConsent.length} hanno risposto
            </span>
            <span className={`${styles.summaryChip} ${styles.summaryChipMissing}`}>
              {missing.length} mancanti
            </span>
          </div>

          <div className={styles.list}>
            {sorted.map(d => {
              const c = d.consent;
              return (
                <div key={d.driver_id} className={`${styles.row} ${!c ? styles.rowMissing : ''}`}>
                  <div>
                    <span className={styles.name}>{d.display_name || d.driver_id}</span>
                    <span className={styles.driverId}>{d.driver_id}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {!c && <span className={`${styles.badge} ${styles.badgeMissing}`}>Non risposto</span>}
                    {c && (
                      <>
                        <span className={`${styles.badge} ${c.site_consent ? styles.badgeOk : styles.badgeMissing}`}>
                          Sito {c.site_consent ? '✓' : '✕'}
                        </span>
                        <span className={`${styles.badge} ${c.social_consent ? styles.badgeOk : styles.badgeMissing}`}>
                          Social {c.social_consent ? '✓' : '✕'}
                        </span>
                        {c.is_minor && <span className={`${styles.badge} ${styles.badgeMinor}`}>Minorenne</span>}
                      </>
                    )}
                  </div>
                  <div className={styles.date}>{c ? fmtDate(c.accepted_at) : ''}</div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
