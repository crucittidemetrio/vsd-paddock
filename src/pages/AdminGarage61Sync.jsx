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
          Importa i best lap iRacing puliti del team VSD da Garage61.
          Operazione idempotente: i lap già presenti vengono saltati via dedup.
          Le auto non ancora a catalogo vengono aggiunte come bozza nel sheet.
          Può richiedere fino a 60 secondi.
        </p>
      </header>

      <section className={styles.card}>
        <p className={styles.label}>
          Pull dei lap puliti per tutti i tracks IRC mappati.
          Quando incontra auto non presenti nel catalogo VSD,
          il sync ne aggiunge una bozza al tab Cars del sheet
          (car_id, sim, car_name, garage61_id pre-popolati).
          Tu completi <code>manufacturer</code>, <code>category</code> e <code>race_class</code> nel sheet
          quando hai 30 secondi. Al sync successivo le auto saranno
          matchate automaticamente e i lap importati.
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
              <div className={styles.statLabel}>Lap importati</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statValue}>{syncMutation.data.skippedDedup ?? 0}</div>
              <div className={styles.statLabel}>Già presenti</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statValue}>{syncMutation.data.unmappedCarsDrafted ?? 0}</div>
              <div className={styles.statLabel}>Auto draftate</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statValue}>{syncMutation.data.tracksProcessed ?? 0}</div>
              <div className={styles.statLabel}>Tracks elaborati</div>
            </div>
          </div>

          {syncMutation.data.sessionTypeDistribution
            && Object.keys(syncMutation.data.sessionTypeDistribution).length > 0 && (
            <div className={styles.classBlock}>
              <h3 className={styles.className}>Distribuzione session_type importati</h3>
              <ol className={styles.top3}>
                {Object.entries(syncMutation.data.sessionTypeDistribution)
                  .sort((a, b) => b[1] - a[1])
                  .map(([type, count]) => (
                    <li key={type}>
                      <span className={styles.driverName}>{type}</span>
                      <span className={styles.points}>{count}</span>
                    </li>
                  ))}
              </ol>
            </div>
          )}

          {syncMutation.data.unmappedCarsDraftedList?.length > 0 && (
            <div className={styles.classBlock}>
              <h3 className={styles.className}>
                ✏️ Auto draftate nel catalogo
                <span className={styles.muted}> · {syncMutation.data.unmappedCarsDraftedList.length}</span>
              </h3>
              <p className={styles.muted}>
                Aggiunte come bozza al tab Cars del sheet. Apri il sheet,
                completa <code>manufacturer</code>, <code>category</code> e <code>race_class</code> per ognuna,
                poi rilancia il sync per importare i lap.
              </p>
              <ol className={styles.top3}>
                {syncMutation.data.unmappedCarsDraftedList.map(c => (
                  <li key={c.garage61_id}>
                    <span className={styles.driverName}>{c.name}</span>
                    <span className={styles.points}>{c.car_id}</span>
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
              <p className={styles.muted}>
                Pilots che hanno guidato in sessioni con il team ma non sono nel roster VSD,
                oppure piloti VSD con <code>iracing_id</code> mancante o errato.
                Verifica nel tab Drivers e correggi se necessario.
              </p>
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
