import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAcademyRanking } from '../hooks/useAcademy';
import { SIM_LIST } from '../utils/constants';
import styles from './Academy.module.css';

function initials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0].toUpperCase())
    .join('');
}

const PM_BASE_ROWS = [
  ['1°', 25], ['2°', 18], ['3°', 15], ['4°', 12], ['5°', 10],
  ['6°', 8], ['7°', 6], ['8°', 4], ['9°', 2], ['10°', 1],
];

// Rango di carriera (Fase 3) — percentili PER SIM tra i piloti con almeno
// 5 gare, non soglie fisse: si autocalibra da solo, vedi Academy.js
// (assignAcademyBadges_) per il perché. Non è un segnale di forma recente
// — quello resta l'Indice Skill sul profilo.
const BADGE_LABELS = { platino: 'Platino', oro: 'Oro', argento: 'Argento', bronzo: 'Bronzo' };

export default function Academy() {
  const [activeSim, setActiveSim] = useState(SIM_LIST[0]?.id || 'LMU');
  const [infoOpen, setInfoOpen] = useState(false);
  const rankingQuery = useAcademyRanking(activeSim);
  const ranking = rankingQuery.data?.ranking || [];

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>VSD PUNTI MERITO</div>
        <h1 className={styles.title}>Punti Merito</h1>
        <p className={styles.sub}>
          Classifica CUMULATIVA di stagione per simulatore — punti merito sommati gara
          dopo gara, come un campionato piloti interno. Non è un indicatore di "quanto
          sei forte adesso": per la forma recente (passo + pulizia di guida) vedi
          l'<Link to="/roster">Indice Skill</Link> sul tuo profilo.
        </p>
      </header>

      <div className={styles.previewNote}>
        <span className={styles.previewNoteIcon}>◈</span>
        <span>
          Classifica di anteprima — Fase 3. Il totale è Punti Merito (piazzamento in
          classe, giro veloce, presenza, pole se disponibile) più Punti Penalità dagli
          incidenti risolti dallo staff. Chi ha almeno 5 gare riceve anche un rango di
          carriera (Bronzo/Argento/Oro/Platino). Scarto del risultato peggiore arriva
          nella fase successiva: questo numero cambierà ancora.
        </span>
      </div>

      <button
        type="button"
        className={styles.infoToggle}
        onClick={() => setInfoOpen(o => !o)}
        aria-expanded={infoOpen}
      >
        <span>Come si calcola il VR</span>
        <span className={styles.infoToggleIcon}>{infoOpen ? '−' : '+'}</span>
      </button>

      {infoOpen && (
        <div className={styles.infoPanel}>
          <p className={styles.infoText}>
            Il VR di ogni pilota è la somma dei Punti Merito ottenuti in tutte le gare
            disponibili per quel simulatore. Il punteggio base dipende dal piazzamento
            <strong> dentro la propria classe</strong> (non in griglia assoluta), su una
            scala ispirata alla F1:
          </p>

          <div className={styles.infoTable}>
            {PM_BASE_ROWS.map(([pos, pts]) => (
              <div key={pos} className={styles.infoTableCell}>
                <span className={styles.infoTablePos}>{pos}</span>
                <span className={styles.infoTablePts}>{pts}</span>
              </div>
            ))}
            <div className={styles.infoTableCell}>
              <span className={styles.infoTablePos}>11°+</span>
              <span className={styles.infoTablePts}>0</span>
            </div>
          </div>

          <p className={styles.infoText}>
            A questo si sommano tre bonus per gara, quando applicabili: <strong>+1</strong>{' '}
            per il giro più veloce in gara, <strong>+1</strong> per aver completato almeno
            il 75% dei giri del leader (bonus presenza), <strong>+1</strong> per la pole
            position — quest'ultimo solo se per quella gara esiste una sessione di
            qualifica registrata, quindi non sempre disponibile.
          </p>

          <p className={styles.infoText}>
            Da questi si sottraggono i <strong>Punti Penalità</strong>: quando lo staff
            chiude un incidente nel Registro con una penalità, i punti vengono tolti dal
            VR del pilota penalizzato in quel simulatore (mai retroattivo sugli incidenti
            chiusi prima dell'introduzione di questo campo, restano a 0 finché non
            vengono riclassificati a mano).
          </p>

          <p className={styles.infoText}>
            Chi ha almeno 5 gare in questo sim riceve anche un <strong>rango di carriera</strong>
            {' '}(Bronzo/Argento/Oro/Platino), calcolato per percentile tra i piloti qualificati
            di QUESTO sim — non una soglia fissa in punti, così un sim con meno gare importate
            finora non penalizza chi ci corre. Non è un indicatore di forma recente (quello
            resta l'Indice Skill): riflette il contributo accumulato nel tempo.
          </p>

          <p className={styles.infoText}>
            In classifica compaiono solo i piloti tesserati attualmente attivi — chi ha
            lasciato il team esce dalla classifica anche se ha ancora risultati in
            archivio. Non è ancora incluso lo scarto del risultato peggiore. Arriva nelle
            fasi successive del sistema — vedi il banner sopra.
          </p>
        </div>
      )}

      <div className={styles.tabs}>
        {SIM_LIST.map(s => (
          <button
            key={s.id}
            type="button"
            className={`${styles.tab} ${activeSim === s.id ? styles.tabActive : ''}`}
            onClick={() => setActiveSim(s.id)}
          >
            {s.short || s.name || s.id}
          </button>
        ))}
      </div>

      {rankingQuery.isLoading && <div className={styles.loading}>Caricamento…</div>}
      {rankingQuery.error && (
        <div className={styles.errorBox}>Errore: {rankingQuery.error.message}</div>
      )}

      {!rankingQuery.isLoading && !rankingQuery.error && ranking.length === 0 && (
        <div className={styles.empty}>Nessun risultato di gara disponibile per questo simulatore.</div>
      )}

      {ranking.length > 0 && (
        <div className={styles.table}>
          <div className={styles.tableHeaderRow}>
            <span>#</span>
            <span>Pilota</span>
            <span>VR</span>
            <span>Gare</span>
          </div>
          {ranking.map((r, idx) => (
            <div key={r.driver_id} className={styles.tableRow}>
              <span className={idx < 3 ? styles.rankTop3 : styles.rank}>{idx + 1}</span>
              <span className={styles.driverCell}>
                {r.avatar_url ? (
                  <img className={styles.avatar} src={r.avatar_url} alt="" />
                ) : (
                  <span className={styles.avatarFallback}>{initials(r.display_name)}</span>
                )}
                <span className={styles.driverName}>{r.display_name}</span>
                {r.badge && (
                  <span
                    className={`${styles.badgeChip} ${styles['badge_' + r.badge]}`}
                    title={`Rango ${BADGE_LABELS[r.badge]} — carriera in questo sim (percentile tra i piloti con almeno 5 gare), non un indicatore di forma recente`}
                  >
                    {BADGE_LABELS[r.badge]}
                  </span>
                )}
              </span>
              <span className={styles.vrCell}>
                <span className={styles.vr}>{r.vr}</span>
                {r.pp !== 0 && (
                  <span
                    className={styles.vrBreakdown}
                    title={`Punti Merito ${r.pm} + Punti Penalità ${r.pp} (${r.penalties_count} penalità)`}
                  >
                    PM {r.pm} · {r.pp} PP
                  </span>
                )}
              </span>
              <span className={styles.races}>{r.races}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
