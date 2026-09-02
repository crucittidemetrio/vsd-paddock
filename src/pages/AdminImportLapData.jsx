import { useState, useCallback, useMemo, useRef } from 'react';
import { useImportLapData } from '../hooks/useLapData';
import { useDrivers } from '../hooks/useRoster';
import styles from './AdminImportResults.module.css';

/**
 * Admin · Import Analisi di Passo — upload manuale del CSV generato dal
 * plugin SimHub (vedi simhub-plugin/) a fine sessione. Stesso gesto di
 * "Admin · Importa risultati gara", ma file invece di JSON incollato:
 * il CSV per-giro non è comodo da incollare a mano in una textarea.
 */

// Parsing leggero SOLO per l'anteprima client-side — non deve essere
// perfetto quanto parseLapDataCsv_ lato Apps Script (quello scrive sul
// foglio), qui serve solo a mostrare "quanti giri/piloti ho trovato"
// prima di inviare il testo grezzo al backend, che fa il parsing vero.
function previewCsv(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim() !== '');
  if (lines.length < 2) return { error: 'CSV vuoto o senza righe dati.' };

  const headers = lines[0].split(',').map((h) => h.trim());
  const required = ['session_id', 'lap_number'];
  const missing = required.filter((c) => !headers.includes(c));
  if (missing.length > 0) {
    return { error: `Colonne mancanti nell'header: ${missing.join(', ')}` };
  }

  const driverIdx = headers.indexOf('driver_name');
  const sessionIdx = headers.indexOf('session_id');
  const simIdx = headers.indexOf('sim');

  const rows = lines.slice(1);
  const drivers = new Set();
  const sessions = new Set();
  let sim = '';
  rows.forEach((line) => {
    const cols = line.split(','); // naive: ok per anteprima, il backend gestisce i campi quotati
    if (driverIdx >= 0 && cols[driverIdx]) drivers.add(cols[driverIdx].trim());
    if (sessionIdx >= 0 && cols[sessionIdx]) sessions.add(cols[sessionIdx].trim());
    if (simIdx >= 0 && cols[simIdx] && !sim) sim = cols[simIdx].trim();
  });

  return {
    ok: true,
    lapCount: rows.length,
    drivers: Array.from(drivers),
    sessionCount: sessions.size,
    sim,
  };
}

export default function AdminImportLapData() {
  const [fileName, setFileName] = useState('');
  const [csvText, setCsvText] = useState('');
  const [importResult, setImportResult] = useState(null);
  const [driverIdOverride, setDriverIdOverride] = useState('');
  const fileInputRef = useRef(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const importMutation = useImportLapData();
  const driversQuery = useDrivers({ status: 'active' });
  const sortedDrivers = useMemo(
    () => (driversQuery.data || []).slice().sort((a, b) => a.display_name.localeCompare(b.display_name)),
    [driversQuery.data]
  );

  const preview = useMemo(() => (csvText.trim() ? previewCsv(csvText) : null), [csvText]);

  const readFile = useCallback((file) => {
    if (!file) return;
    setFileName(file.name);
    setImportResult(null);
    const reader = new FileReader();
    reader.onload = (e) => setCsvText(String(e.target.result || ''));
    reader.readAsText(file);
  }, []);

  function handleFileInput(e) {
    readFile(e.target.files?.[0]);
  }

  function handleDrop(e) {
    e.preventDefault();
    setIsDragOver(false);
    readFile(e.dataTransfer.files?.[0]);
  }

  function handleImport() {
    if (!preview?.ok || importMutation.isPending) return;
    setImportResult(null);
    importMutation.mutate(
      { csvText, driverIdOverride: driverIdOverride || undefined },
      {
        onSuccess: (stats) => setImportResult({ ok: true, stats }),
        onError: (err) => setImportResult({ ok: false, error: err.message }),
      }
    );
  }

  function handleReset() {
    setFileName('');
    setCsvText('');
    setImportResult(null);
    setDriverIdOverride('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const canSubmit = preview?.ok && !importMutation.isPending;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Admin · Import Analisi di Passo</h1>
        <p>
          Carica il CSV generato dal plugin SimHub a fine sessione (una riga per giro
          completato — vedi <code>simhub-plugin/README.md</code> nel repo).
        </p>
      </header>

      <section className={styles.section}>
        <label className={styles.sectionLabel}>1. File CSV</label>
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `1px dashed ${isDragOver ? 'var(--vsd-cyan)' : 'var(--color-border-strong)'}`,
            borderRadius: 'var(--r-md)',
            padding: 'var(--sp-5)',
            textAlign: 'center',
            cursor: 'pointer',
            color: 'var(--color-text-muted)',
            fontSize: 'var(--fs-sm)',
          }}
        >
          {fileName ? (
            <span>📄 {fileName} — clicca o trascina per sostituire</span>
          ) : (
            <span>Trascina qui il file .csv, o clicca per selezionarlo</span>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileInput}
            style={{ display: 'none' }}
          />
        </div>
      </section>

      {preview && (
        <section className={styles.section}>
          <label className={styles.sectionLabel}>Preview</label>
          {preview.error ? (
            <p className={styles.previewError}>❌ {preview.error}</p>
          ) : (
            <div className={styles.previewBody}>
              <p className={styles.previewOk}>✓ CSV riconosciuto</p>
              {preview.sim && (
                <p>
                  Sim: <span className={styles.detected}>{preview.sim}</span>
                </p>
              )}
              <p>Sessioni nel file: {preview.sessionCount}</p>
              <p>
                Piloti trovati ({preview.drivers.length}): {preview.drivers.join(', ') || '—'}
              </p>
              <p className={styles.previewTotal}>Totale: {preview.lapCount} giri da importare</p>
              <p className={styles.previewSkipped}>
                L&apos;abbinamento pilota → account VSD avviene lato server (stesso matching di
                Import Risultati). Nomi non riconosciuti restano come esterni, non bloccano
                l&apos;import.
              </p>
            </div>
          )}
        </section>
      )}

      {preview?.ok && (
        <section className={styles.section}>
          <label className={styles.sectionLabel} htmlFor="lapdata-driver-override">
            2. Pilota (opzionale)
          </label>
          <select
            id="lapdata-driver-override"
            className={styles.select}
            value={driverIdOverride}
            onChange={(e) => setDriverIdOverride(e.target.value)}
          >
            <option value="">Rileva automaticamente dal nome nel CSV</option>
            {sortedDrivers.map((d) => (
              <option key={d.driver_id} value={d.driver_id}>
                {d.display_name}
              </option>
            ))}
          </select>
          <p className={styles.previewSkipped}>
            Il nome pilota letto da SimHub non è sempre affidabile (dipende da una proprietà
            del gioco non garantita). Se sai già di chi è questa sessione — quasi sempre il caso
            per un upload manuale — selezionalo qui: verrà assegnato a TUTTI i giri del file,
            ignorando il campo <code>driver_name</code> del CSV.
          </p>
        </section>
      )}

      <div className={styles.actions}>
        <button onClick={handleImport} disabled={!canSubmit} className={styles.btnPrimary}>
          {importMutation.isPending ? 'Importazione…' : 'Importa giri'}
        </button>
        <button onClick={handleReset} className={styles.btnSecondary}>
          Reset
        </button>
      </div>

      {importResult &&
        (importResult.ok ? (
          <section className={styles.resultSuccess}>
            <h3 className={styles.resultTitleOk}>✓ Importazione completata</h3>
            <div className={styles.statsGrid}>
              <div>
                Giri importati: <strong>{importResult.stats.imported}</strong>
              </div>
              <div>
                Sessione: <strong>{importResult.stats.session_id}</strong>
              </div>
              <div>
                VSD matched: <strong>{importResult.stats.vsd_matched}</strong>
              </div>
              <div>
                Esterni/non abbinati: <strong>{importResult.stats.external}</strong>
              </div>
              {importResult.stats.skipped_duplicates > 0 && (
                <div>
                  Duplicati saltati: <strong>{importResult.stats.skipped_duplicates}</strong>
                </div>
              )}
            </div>
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
