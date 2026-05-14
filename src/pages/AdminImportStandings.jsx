import { useState, useMemo } from 'react';
import { useChampionships } from '../hooks/useChampionships';
import { useImportChampionshipStandings } from '../hooks/useImportChampionshipStandings';
import styles from './AdminImportStandings.module.css';

export default function AdminImportStandings() {
  const [championshipId, setChampionshipId] = useState('');
  const [jsonText, setJsonText] = useState('');
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState('');

  const { data: championships, isLoading: champLoading } = useChampionships();
  const importMutation = useImportChampionshipStandings();

  const selectedChamp = useMemo(
    () => championships?.find(c => c.id === championshipId),
    [championships, championshipId]
  );

  function handlePreview() {
    setPreviewError('');
    setPreview(null);
    try {
      const parsed = JSON.parse(jsonText);
      if (!Array.isArray(parsed)) throw new Error('Atteso array di carClass groups');
      if (parsed.length === 0) throw new Error('Array vuoto');

      const classes = parsed.map(group => ({
        car_class: group.carClass || 'Unknown',
        drivers_count: (group.standings || []).length,
        top3: (group.standings || []).slice(0, 3).map(s => ({
          position: s.position,
          id: s.id,
          actualPoints: s.actualPoints ?? s.championshipScore ?? 0,
        })),
      }));

      const totalDrivers = classes.reduce((sum, c) => sum + c.drivers_count, 0);
      setPreview({ classes, totalDrivers });
    } catch (e) {
      setPreviewError(e.message);
    }
  }

  async function handleImport() {
    try {
      await importMutation.mutateAsync({
        championship_id: championshipId,
        json_data: jsonText,
      });
    } catch {
      // error reso via mutation state
    }
  }

  const canImport = championshipId && jsonText.trim() && preview && !importMutation.isPending;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Import Standings LMU</h1>
        <p className={styles.subtitle}>
          Carica la classifica autorevole esportata da Le Mans Ultimate per un campionato.
          Sostituisce il calcolo automatico con i numeri ufficiali del simulatore.
        </p>
      </header>

      <section className={styles.card}>
        <label className={styles.label}>Campionato</label>
        <select
          className={styles.select}
          value={championshipId}
          onChange={e => setChampionshipId(e.target.value)}
          disabled={champLoading}
        >
          <option value="">— Seleziona —</option>
          {championships?.map(c => (
            <option key={c.id} value={c.id}>
              {c.name} · {c.sim} · {c.season}
            </option>
          ))}
        </select>

        {selectedChamp && (
          <div className={styles.meta}>
            <span className={styles.metaPill}>{selectedChamp.status}</span>
            <span className={styles.metaPill}>{selectedChamp.format}</span>
            {selectedChamp.standings_json && (
              <span className={styles.warning}>
                ⚠ Standings già presente — verrà sovrascritto
              </span>
            )}
          </div>
        )}
      </section>

      <section className={styles.card}>
        <label className={styles.label}>JSON Standings</label>
        <textarea
          className={styles.textarea}
          value={jsonText}
          onChange={e => {
            setJsonText(e.target.value);
            setPreview(null);
            setPreviewError('');
          }}
          placeholder='[{"carClass":"LMGTE AM","standings":[...]}]'
          rows={12}
          spellCheck={false}
        />
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={handlePreview}
            disabled={!jsonText.trim()}
          >
            Anteprima
          </button>
        </div>
        {previewError && <div className={styles.error}>❌ {previewError}</div>}
      </section>

      {preview && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Anteprima</h2>
          <div className={styles.statsRow}>
            <div className={styles.stat}>
              <div className={styles.statValue}>{preview.classes.length}</div>
              <div className={styles.statLabel}>Classi</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statValue}>{preview.totalDrivers}</div>
              <div className={styles.statLabel}>Piloti</div>
            </div>
          </div>

          {preview.classes.map(c => (
            <div key={c.car_class} className={styles.classBlock}>
              <h3 className={styles.className}>
                {c.car_class}
                <span className={styles.muted}> · {c.drivers_count} piloti</span>
              </h3>
              <ol className={styles.top3}>
                {c.top3.map(d => (
                  <li key={d.position}>
                    <span className={styles.pos}>{d.position}</span>
                    <span className={styles.driverName}>{d.id}</span>
                    <span className={styles.points}>{d.actualPoints} pts</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={handleImport}
              disabled={!canImport}
            >
              {importMutation.isPending ? 'Import in corso…' : 'Importa Standings'}
            </button>
          </div>
        </section>
      )}

      {importMutation.isSuccess && (
        <section className={styles.cardSuccess}>
          <h2>✅ Import completato</h2>
          <div className={styles.statsRow}>
            <div className={styles.stat}>
              <div className={styles.statValue}>{importMutation.data.classes_count}</div>
              <div className={styles.statLabel}>Classi</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statValue}>{importMutation.data.drivers_count}</div>
              <div className={styles.statLabel}>Piloti</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statValue}>{importMutation.data.vsd_matched}</div>
              <div className={styles.statLabel}>VSD matchati</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statValue}>{importMutation.data.external}</div>
              <div className={styles.statLabel}>Esterni</div>
            </div>
          </div>
        </section>
      )}

      {importMutation.isError && (
        <div className={styles.error}>
          ❌ {importMutation.error.message}
        </div>
      )}
    </div>
  );
}