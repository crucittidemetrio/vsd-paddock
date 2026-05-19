import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useImportRaceResults } from '../hooks/useImportRaceResults';
import styles from './AdminImportResults.module.css';

// Sessioni iRacing che importiamo (Wave 9.12, A1)
const IRACING_IMPORTABLE_SESSIONS = ['QUALIFY', 'HEAT 1', 'FEATURE'];

/**
 * Detect formato JSON:
 *  - 'lmu'     → array [{carClass, result: [...]}]
 *  - 'iracing' → object {type:'event_result', data:{session_results:[...]}}
 *  - null se non riconosciuto
 */
function detectFormat(data) {
  if (!data) return null;
  if (Array.isArray(data) && data.length > 0 && data[0].carClass) return 'lmu';
  if (data.type === 'event_result' && data.data && Array.isArray(data.data.session_results)) {
    return 'iracing';
  }
  return null;
}

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

    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      return { error: 'JSON non parsabile: ' + e.message };
    }

    const format = detectFormat(parsed);
    if (!format) {
      return {
        error:
          'Formato non riconosciuto. Atteso: array LMU [{carClass,result}] o oggetto iRacing {type:"event_result",data:{...}}',
      };
    }

    if (format === 'lmu') {
      const firstGroup = parsed[0];
      if (!firstGroup.result || !Array.isArray(firstGroup.result)) {
        return { error: 'LMU: manca campo "result" nel primo carClass group' };
      }
      const hasPosition = firstGroup.result.some((r) => r.position != null);
      const sessionType = hasPosition ? 'race' : 'qualifying';
      const classes = parsed.map((g) => ({
        name: g.carClass || 'Unknown',
        count: (g.result || []).length,
      }));
      const totalDrivers = classes.reduce((sum, c) => sum + c.count, 0);
      return {
        ok: true,
        format: 'lmu',
        sessionType,
        classes,
        totalDrivers,
      };
    }

    // iRacing
    const data = parsed.data;
    const sessions = data.session_results || [];
    const allSessionNames = sessions.map((s) => s.simsession_name || '?');
    const importableSessions = sessions.filter((s) =>
      IRACING_IMPORTABLE_SESSIONS.includes((s.simsession_name || '').toUpperCase())
    );
    if (importableSessions.length === 0) {
      return {
        error:
          'iRacing: nessuna sessione importabile trovata (cerco QUALIFY, HEAT 1, FEATURE). Sessioni nel JSON: ' +
          allSessionNames.join(', '),
      };
    }
    const driversPerSession = importableSessions[0].results
      ? importableSessions[0].results.length
      : 0;
    const totalDrivers = importableSessions.reduce(
      (sum, s) => sum + (s.results ? s.results.length : 0),
      0
    );
    const trackName = (data.track && data.track.track_name) || '?';
    const trackConfig = (data.track && data.track.config_name) || '';
    const startTime = data.start_time || '';
    const leagueSeason = data.league_season_name || '';

    return {
      ok: true,
      format: 'iracing',
      trackName,
      trackConfig,
      startTime,
      leagueSeason,
      allSessions: allSessionNames,
      importableSessions: importableSessions.map((s) => s.simsession_name),
      driversPerSession,
      totalDrivers,
      skippedCount: sessions.length - importableSessions.length,
    };
  }, [jsonText]);

  const selectedRace = useMemo(() => {
    if (!selectedRaceId || !racesQuery.data) return null;
    return racesQuery.data.find((r) => r.race_id === selectedRaceId);
  }, [selectedRaceId, racesQuery.data]);

  const canSubmit = selectedRaceId && preview?.ok && !importMutation.isPending;

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

  // Il result ha shape diverse per LMU/iRacing
  const resultIsIRacing = importResult?.ok && importResult.stats?.by_session;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Admin · Importa risultati gara</h1>
        <p>
          Incolla il JSON dei risultati. Formato LMU (array di carClass groups)
          o iRacing (oggetto event_result) — rilevato automaticamente.
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
        <label className={styles.sectionLabel}>2. JSON risultati</label>
        <textarea
          className={styles.textarea}
          rows={12}
          placeholder='[{"carClass":"..."}] (LMU) oppure {"type":"event_result","data":{...}} (iRacing)'
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
          ) : preview.format === 'lmu' ? (
            <div className={styles.previewBody}>
              <p className={styles.previewOk}>✓ Formato LMU riconosciuto</p>
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
          ) : (
            <div className={styles.previewBody}>
              <p className={styles.previewOk}>
                ✓ Formato iRacing event_result riconosciuto
              </p>
              <p>
                Track: <strong>{preview.trackName}</strong>
                {preview.trackConfig ? ` (${preview.trackConfig})` : ''}
              </p>
              {preview.leagueSeason && (
                <p>
                  Lega/Stagione: <em>{preview.leagueSeason}</em>
                </p>
              )}
              {preview.startTime && (
                <p>
                  Inizio: <span className={styles.detected}>{preview.startTime}</span>
                </p>
              )}
              <p>
                Sessioni nel JSON ({preview.allSessions.length}):{' '}
                {preview.allSessions.join(', ')}
              </p>
              <p>
                Sessioni importabili (
                <span className={styles.detected}>
                  {preview.importableSessions.length}
                </span>
                ): {preview.importableSessions.join(', ')}
              </p>
              {preview.skippedCount > 0 && (
                <p className={styles.previewSkipped}>
                  Skipped: {preview.skippedCount} sessioni (Practice/Warmup non importate)
                </p>
              )}
              <p>Piloti per sessione: {preview.driversPerSession}</p>
              <p className={styles.previewTotal}>
                Totale: {preview.totalDrivers} righe da importare ({preview.driversPerSession} ×{' '}
                {preview.importableSessions.length} sessioni)
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
            <h3 className={styles.resultTitleOk}>✓ Importazione completata</h3>
            <div className={styles.statsGrid}>
              <div>
                Importati totali: <strong>{importResult.stats.imported}</strong>
              </div>
              {resultIsIRacing ? (
                <>
                  <div>
                    Qualifying:{' '}
                    <strong>{importResult.stats.by_session.qualifying || 0}</strong>
                  </div>
                  <div>
                    Heat:{' '}
                    <strong>{importResult.stats.by_session.heat || 0}</strong>
                  </div>
                  <div>
                    Race:{' '}
                    <strong>{importResult.stats.by_session.race || 0}</strong>
                  </div>
                </>
              ) : (
                <div>
                  Sessione: <strong>{importResult.stats.session_type}</strong>
                </div>
              )}
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
              {resultIsIRacing && importResult.stats.sessions_skipped > 0 && (
                <div>
                  Sessioni skipped:{' '}
                  <strong>{importResult.stats.sessions_skipped}</strong>
                </div>
              )}
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