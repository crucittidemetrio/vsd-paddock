import { useSyncGarage61 } from '../hooks/useSyncGarage61';
import styles from './AdminImportStandings.module.css';

export default function AdminGarage61Sync() {
  const syncMutation = useSyncGarage61();

  async function handleSync() {
    try {
      await syncMutation.mutateAsync();
    } catch {
      // error reso via mutation state
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Sync Garage61 — iRacing</h1>
        <p className={styles.subtitle}>
          Importa i best lap iRacing pulli del team VSD da Garage61.
          Operazione idempotente: i lap già presenti vengono saltati via dedup.
          Può richiedere fino a 60 secondi.
        </p>
      </header>

      <section className={styles.card}>
        <p className={styles.label}>
          Pull dei lap puliti per tutti i tracks IRC mappati. I lap su auto
          fuori dal catalogo VSD (es. McLaren 720S GT3 EVO, BMW M2 CS Racing)
          vengono skippati. In caso di network glitch transient, riesegui:
          il dedup recupera i lap mancanti.
        </p>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={handleSync}
            disabled={syncMutation.isPending}
          >
            {syncMutation.isPending ? 'Sync in corso… (fino a 60 sec)' : 'Avvia Sync Garage61'}
          </button>
        </div>
      </section>

      {syncMutation.isSuccess && (
        <section className={styles.cardSuccess}>
          <h2>✅ Sync completato</h2>
          <div className={styles.statsRow}>
            <div className={styles.stat}>
              <div className={styles.statValue}>{syncMutation.data.imported ?? 0}</div>
              <div className={styles.statLabel}>Importati</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statValue}>{syncMutation.data.skippedDedup ?? 0}</div>
              <div className={styles.statLabel}>Già presenti</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statValue}>{syncMutation.data.skippedCarUnmapped ?? 0}</div>
              <div className={styles.statLabel}>Auto non mappate</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statValue}>{syncMutation.data.tracksProcessed ?? 0}</div>
              <div className={styles.statLabel}>Tracks elaborati</div>
            </div>
          </div>

          {syncMutation.data.unmappedCars?.length > 0 && (
            <div className={styles.classBlock}>
              <h3 className={styles.className}>
                Auto Garage61 senza mapping VSD
                <span className={styles.muted}> · {syncMutation.data.unmappedCars.length}</span>
              </h3>
              <ol className={styles.top3}>
                {syncMutation.data.unmappedCars.map(c => (
                  <li key={c.id}>
                    <span className={styles.driverName}>{c.name}</span>
                    <span className={styles.points}>g61={c.id}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {syncMutation.data.unmappedDrivers?.length > 0 && (
            <div className={styles.classBlock}>
              <h3 className={styles.className}>
                Pilots Garage61 senza mapping VSD
                <span className={styles.muted}> · {syncMutation.data.unmappedDrivers.length}</span>
              </h3>
              <ol className={styles.top3}>
                {syncMutation.data.unmappedDrivers.map(d => (
                  <li key={d.slug}>
                    <span className={styles.driverName}>{d.name}</span>
                    <span className={styles.points}>{d.slug}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {syncMutation.data.errors > 0 && (
            <div className={styles.error}>
              ⚠ {syncMutation.data.errors} errori transient (network glitch lato Apps Script → Garage61).
              Esegui di nuovo per recuperare i lap mancanti.
            </div>
          )}
        </section>
      )}

      {syncMutation.isError && (
        <div className={styles.error}>
          ❌ {syncMutation.error.message}
        </div>
      )}
    </div>
  );
}
