import { useMemo, useState } from 'react';
import { useAuditLog } from '../hooks/useAuditLog';
import styles from './AdminAuditLog.module.css';

const PAGE_SIZE = 50;

// Azioni note che scrivono nell'AuditLog (vedi le chiamate a logAudit_ in
// apps-script/: Standings.js, BestLaps.js, Races.js, RaceResultsImport.js).
// Elenco statico invece che derivato dai risultati filtrati: altrimenti
// selezionare un'azione farebbe sparire le altre opzioni dal menu.
const KNOWN_ACTIONS = [
  'championships.saveAdjustments',
  'championships.importStandings',
  'lapSubmissions.approve',
  'lapSubmissions.reject',
  'races.update',
  'races.remove',
  'raceResults.delete',
];

function fmtDateTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('it-IT', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// Colora l'azione in base al dominio (prefisso prima del punto), giusto
// per distinguere a colpo d'occhio classifiche/gare/best lap nella lista.
function actionTone(action) {
  if (!action) return '';
  if (action.startsWith('championships.')) return styles.toneChampionship;
  if (action.startsWith('races.')) return styles.toneRace;
  if (action.startsWith('lapSubmissions.')) return styles.toneLap;
  return styles.toneDefault;
}

export default function AdminAuditLog() {
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');
  const [offset, setOffset] = useState(0);

  const params = useMemo(() => ({
    q: q.trim() || undefined,
    action: action || undefined,
    limit: PAGE_SIZE,
    offset,
  }), [q, action, offset]);

  const query = useAuditLog(params);
  const rows = query.data?.rows || [];
  const total = query.data?.total ?? 0;

  function handleSearchChange(e) {
    setQ(e.target.value);
    setOffset(0);
  }
  function handleActionChange(e) {
    setAction(e.target.value);
    setOffset(0);
  }

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, total);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>ACCOUNTABILITY</div>
        <h1 className={styles.title}>Registro di controllo</h1>
        <p className={styles.sub}>
          Traccia di tutte le azioni admin sensibili: aggiustamenti punti, cancellazioni,
          validazione best lap, cambi di stato gara, import classifiche.
        </p>
      </header>

      <div className={styles.filters}>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="Cerca per target o testo…"
          value={q}
          onChange={handleSearchChange}
        />
        <select className={styles.select} value={action} onChange={handleActionChange}>
          <option value="">Tutte le azioni</option>
          {KNOWN_ACTIONS.map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {query.isLoading && <div className={styles.loading}>Caricamento…</div>}
      {query.error && <div className={styles.errorBox}>Errore: {query.error.message}</div>}

      {!query.isLoading && !query.error && (
        <>
          <div className={styles.table}>
            <div className={styles.tableHead}>
              <span>Quando</span>
              <span>Chi</span>
              <span>Azione</span>
              <span>Target</span>
              <span>Dettagli</span>
            </div>
            {rows.length === 0 && (
              <div className={styles.empty}>Nessuna voce trovata.</div>
            )}
            {rows.map(r => (
              <div key={r.log_id} className={styles.row}>
                <span className={styles.cellDate}>{fmtDateTime(r.timestamp)}</span>
                <span className={styles.cellActor}>
                  {r.driver_name || r.driver_id || <em className={styles.muted}>editor script</em>}
                </span>
                <span className={`${styles.badge} ${actionTone(r.action)}`}>{r.action}</span>
                <span className={styles.cellTarget}>{r.target_id || '—'}</span>
                <span className={styles.cellDetails} title={r.details}>{r.details || '—'}</span>
              </div>
            ))}
          </div>

          <div className={styles.pagination}>
            <span className={styles.pageInfo}>
              {total === 0 ? 'Nessun risultato' : `${from}–${to} di ${total}`}
            </span>
            <div className={styles.pageBtns}>
              <button
                type="button"
                className={styles.pageBtn}
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                ← Precedenti
              </button>
              <button
                type="button"
                className={styles.pageBtn}
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Successivi →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
