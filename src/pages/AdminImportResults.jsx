import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useImportRaceResults } from '../hooks/useImportRaceResults';
import styles from './AdminImportResults.module.css';

export default function AdminImportResults() {
  const navigate = useNavigate();
  const [selectedRaceId, setSelectedRaceId] = useState('');
  const [jsonText, setJsonText] = useState('');
  const [importResult, setImportResult] = useState(null);

  const racesQuery = useQuery({
    queryKey: ['races', { status: 'all' }],
    queryFn: () => api.races.list(),
    staleTime: 60_000,
  });

  const importMutation = useImportRaceResults();

  const preview = useMemo(() => {
    if (!jsonText.trim()) return null;
    try {
      const parsed = JSON.parse(jsonText);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return { error: 'JSON deve essere un array non vuoto di carClass groups' };
      }
      const firstGroup = parsed[0];
      if (!firstGroup.result || !Array.isArray(firstGroup.result)) {
        return { error: 'Manca il campo "result" nel primo carClass group' };
      }
      const hasPosition = firstGroup.result.some((r) => r.position != null);
      const sessionType = hasPosition ? 'race' : 'qualifying';
      const classes = parsed.map((g) => ({
        name: g.carClass || 'Unknown',
        count: (g.result || []).length,
      }));
      const totalDrivers = classes.reduce((sum, c) => sum + c.count, 0);
      return { ok: true, sessionType, classes, totalDrivers };
    } catch (e) {
      return { error: 'JSON non parsabile: ' + e.message };
    }
  }, [jsonText]);

  const selectedRace = useMemo(() => {
    if (!selectedRaceId || !racesQuery.data) return null;
    return racesQuery.data.find((r) => r.race_id === selectedRaceId);
  }, [selectedRaceId, racesQuery.data]);

  const canSubmit =
    selectedRaceId && preview?.ok && !importMutation.isPending;

  function handleImport() {
    if (!canSubmit) return;
    setImportResult(null);
    importMutation.mutate(
      { race_id: selectedRaceId, json_data: jsonText },
      {
        onSuccess: (stats) => setImportResult({ ok: true, stats }),
        onError: (err) => setImportResult({ ok: false, error: err.message }),
      }
    );
  }

  function handleReset() {
    setSelectedRaceId('');
    setJsonText('');
    setImportResult(null);
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Admin · Importa risultati gara</h1>
        <p>
          Incolla il JSON esportato da LMU. Session type (qualifying/race)
          rilevato automaticamente.
        </p>
      </header>

      {/* Step 1: Race */}
      <section className={styles.section}>
        <label className={styles.sectionLabel}>1. Gara di destinazione</label>
        {racesQuery.isLoading && (
          <p className={styles.loadingText}>Caricamento gare…</p>
        )}
        {racesQuery.error && (
          <p className={styles.errorText}>Errore: {racesQuery.error.message}</p>
        )}
        {racesQuery.data && (
          <select
            className={styles.select}
            value={selectedRaceId}
            onChange={(e) => setSelectedRaceId(e.target.value)}
          >
            <option value="">— Seleziona una gara —</option>
            {racesQuery.data.map((r) => (
              <option key={r.race_id} value={r.race_id}>
                {r.race_id} — {r.race_name} ({r.status})
                {r.championship_name ? ` · 🏆 ${r.championship_name}` : ''}
              </option>
            ))}
          </select>
        )}
        {selectedRace && (
          <div className={styles.raceMeta}>
            sim: {selectedRace.sim} · track: {selectedRace.track_id} · event:{' '}
            {selectedRace.event_type}
          </div>
        )}
      </section>

      {/* Step 2: JSON */}
      <section className={styles.section}>
        <label className={styles.sectionLabel}>2. JSON risultati LMU</label>
        <textarea
          className={styles.textarea}
          rows={12}
          placeholder='[{"carClass": "Hypercar", "result": [...]}, ...]'
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
        />
      </section>

      {/* Preview */}
      {preview && (
        <section className={styles.section}>
          <label className={styles.sectionLabel}>Preview</label>
          {preview.error ? (
            <p className={styles.previewError}>❌ {preview.error}</p>
          ) : (
            <div className={styles.previewBody}>
              <p className={styles.previewOk}>✓ JSON valido</p>
              <p>
                Sessione rilevata:{' '}
                <span className={styles.detected}>{preview.sessionType}</span>
              </p>
              <p>Classi:</p>
              <ul className={styles.previewClasses}>
                {preview.classes.map((c, i) => (
                  <li key={i}>
                    • <strong>{c.name}</strong>: {c.count} piloti
                  </li>
                ))}
              </ul>
              <p className={styles.previewTotal}>
                Totale: {preview.totalDrivers} risultati da importare
              </p>
            </div>
          )}
        </section>
      )}

      {/* Actions */}
      <div className={styles.actions}>
        <button
          onClick={handleImport}
          disabled={!canSubmit}
          className={styles.btnPrimary}
        >
          {importMutation.isPending ? 'Importazione…' : 'Importa risultati'}
        </button>
        <button onClick={handleReset} className={styles.btnSecondary}>
          Reset
        </button>
      </div>

      {/* Result */}
      {importResult &&
        (importResult.ok ? (
          <section className={styles.resultSuccess}>
            <h3 className={styles.resultTitleOk}>
              ✓ Importazione completata
            </h3>
            <div className={styles.statsGrid}>
              <div>
                Importati: <strong>{importResult.stats.imported}</strong>
              </div>
              <div>
                Sessione: <strong>{importResult.stats.session_type}</strong>
              </div>
              <div>
                VSD matched: <strong>{importResult.stats.vsd_matched}</strong>
              </div>
              <div>
                Esterni: <strong>{importResult.stats.external}</strong>
              </div>
              <div>
                DNF: <strong>{importResult.stats.dnf}</strong>
              </div>
              <div>
                DNS: <strong>{importResult.stats.dns}</strong>
              </div>
            </div>
            <button
              onClick={() => navigate(`/race/${selectedRaceId}`)}
              className={styles.openRaceLink}
            >
              → Apri dettaglio gara
            </button>
          </section>
        ) : (
          <section className={styles.resultError}>
            <h3 className={styles.resultTitleError}>❌ Errore</h3>
            <p>{importResult.error}</p>
          </section>
        ))}
    </div>
  );
}