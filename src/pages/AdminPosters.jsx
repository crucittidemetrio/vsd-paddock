import { useState } from 'react';
import { useRaces } from '../hooks/useRaces';
import { useUpdateRacePoster } from '../hooks/useUpdateRacePoster';
import styles from './AdminPosters.module.css';

export default function AdminPosters() {
  const { data: races, isLoading } = useRaces();
  const updateMutation = useUpdateRacePoster();
  const [editing, setEditing] = useState({});
  const [savedFor, setSavedFor] = useState(null);

  function startEdit(race) {
    setEditing({ ...editing, [race.race_id]: race.poster_url || '' });
  }

  function cancelEdit(raceId) {
    const next = { ...editing };
    delete next[raceId];
    setEditing(next);
  }

  async function save(raceId) {
    try {
      await updateMutation.mutateAsync({
        race_id: raceId,
        poster_url: editing[raceId],
      });
      setSavedFor(raceId);
      setTimeout(() => setSavedFor(null), 2500);
      cancelEdit(raceId);
    } catch {
      // errore mostrato sotto
    }
  }

  if (isLoading) return <div className={styles.page}>Caricamento gare…</div>;

  const sorted = [...(races || [])].sort((a, b) => {
    const aHas = !!a.poster_url;
    const bHas = !!b.poster_url;
    if (aHas !== bHas) return aHas ? 1 : -1;
    return new Date(b.date) - new Date(a.date);
  });

  const total = races?.length || 0;
  const withPoster = (races || []).filter(r => r.poster_url).length;
  const missing = total - withPoster;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Race Posters</h1>
        <p className={styles.subtitle}>
          URL delle locandine per ogni gara. Carica le immagini su Google Drive (con
          condivisione pubblica) o Imgur, poi incolla qui l'URL diretto all'immagine.
        </p>
      </header>

      <div className={styles.statsBar}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{total}</span>
          <span className={styles.statLabel}>Gare totali</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{withPoster}</span>
          <span className={styles.statLabel}>Con poster</span>
        </div>
        <div className={`${styles.stat} ${missing > 0 ? styles.statMissing : ''}`}>
          <span className={styles.statValue}>{missing}</span>
          <span className={styles.statLabel}>Mancanti</span>
        </div>
      </div>

      <ul className={styles.list}>
        {sorted.map(race => {
          const isEditing = race.race_id in editing;
          const isSaved = savedFor === race.race_id;
          const hasPoster = !!race.poster_url;

          return (
            <li key={race.race_id} className={`${styles.row} ${hasPoster ? '' : styles.rowMissing}`}>
              <div className={styles.thumbCol}>
                {hasPoster ? (
                  <img
                    src={race.poster_url}
                    alt=""
                    className={styles.thumb}
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.nextSibling.style.display = 'flex';
                    }}
                  />
                ) : null}
                <div
                  className={styles.thumbPlaceholder}
                  style={{ display: hasPoster ? 'none' : 'flex' }}
                >
                  ∅
                </div>
              </div>

              <div className={styles.info}>
                <div className={styles.raceName}>{race.race_name}</div>
                <div className={styles.raceMeta}>
                  <span>{race.sim}</span>
                  <span>·</span>
                  <span>{race.date}</span>
                  <span>·</span>
                  <span className={styles.status}>{race.status}</span>
                </div>

                {isEditing ? (
                  <div className={styles.editor}>
                    <input
                      type="url"
                      className={styles.urlInput}
                      value={editing[race.race_id]}
                      onChange={(e) => setEditing({ ...editing, [race.race_id]: e.target.value })}
                      placeholder="https://..."
                      autoFocus
                    />
                    <button
                      type="button"
                      className={styles.btnSave}
                      onClick={() => save(race.race_id)}
                      disabled={updateMutation.isPending}
                    >
                      {updateMutation.isPending ? 'Salvo…' : 'Salva'}
                    </button>
                    <button
                      type="button"
                      className={styles.btnCancel}
                      onClick={() => cancelEdit(race.race_id)}
                    >
                      Annulla
                    </button>
                  </div>
                ) : (
                  <div className={styles.urlDisplay}>
                    {hasPoster ? (
                      <a
                        href={race.poster_url}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.urlLink}
                      >
                        {race.poster_url.length > 70
                          ? race.poster_url.slice(0, 70) + '…'
                          : race.poster_url}
                      </a>
                    ) : (
                      <span className={styles.urlMissing}>Nessuna poster</span>
                    )}
                    <button
                      type="button"
                      className={styles.btnEdit}
                      onClick={() => startEdit(race)}
                    >
                      {hasPoster ? 'Modifica' : 'Imposta'}
                    </button>
                  </div>
                )}

                {isSaved && <div className={styles.success}>✅ Salvato</div>}
              </div>
            </li>
          );
        })}
      </ul>

      {updateMutation.isError && (
        <div className={styles.error}>❌ {updateMutation.error.message}</div>
      )}
    </div>
  );
}