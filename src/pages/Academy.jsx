import { useState } from 'react';
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

export default function Academy() {
  const [activeSim, setActiveSim] = useState(SIM_LIST[0]?.id || 'LMU');
  const rankingQuery = useAcademyRanking(activeSim);
  const ranking = rankingQuery.data?.ranking || [];

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>VSD PILOT RATING</div>
        <h1 className={styles.title}>Pilot Rating</h1>
        <p className={styles.sub}>
          Classifica VR (Valore Rating) per simulatore, calcolata dai risultati gara.
        </p>
      </header>

      <div className={styles.previewNote}>
        <span className={styles.previewNoteIcon}>◈</span>
        <span>
          Classifica di anteprima — Fase 1. Il VR qui mostrato è solo Punti Merito
          (piazzamento in classe, giro veloce, presenza, pole se disponibile).
          Punti Penalità, badge e scarto del risultato peggiore arrivano nelle fasi
          successive: questo numero cambierà.
        </span>
      </div>

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
              </span>
              <span className={styles.vr}>{r.vr}</span>
              <span className={styles.races}>{r.races}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
