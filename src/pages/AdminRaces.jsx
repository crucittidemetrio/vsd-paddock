import { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRaces } from '../hooks/useRaces';
import { api } from '../api/client';
import RaceFormModal from '../components/race/RaceFormModal';
import styles from './AdminRaces.module.css';

const STATUS_LABELS = {
  draft: 'Bozza',
  scheduled: 'Programmata',
  in_progress: 'In Corso',
  completed: 'Conclusa',
  cancelled: 'Annullata',
};

/**
 * AdminRaces — pannello di controllo gare (lista + CRUD).
 * Lista tutte le gare con crea/modifica/elimina. Form in modale (RaceFormModal).
 * Pagina admin dedicata (/admin/races), gating staff via route.
 */
export default function AdminRaces() {
  const queryClient = useQueryClient();
  const { data: racesData, isLoading, isError, error } = useRaces();

  const races = useMemo(() => {
    if (Array.isArray(racesData)) return racesData;
    return racesData?.races || [];
  }, [racesData]);

  // Ordina per data discendente (più recenti in cima)
  const sortedRaces = useMemo(() => {
    return [...races].sort((a, b) => {
      const da = new Date(a.date).getTime() || 0;
      const db = new Date(b.date).getTime() || 0;
      return db - da;
    });
  }, [races]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRace, setEditingRace] = useState(null); // null = create, oggetto = edit
  const [actionError, setActionError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);
  const [removingId, setRemovingId] = useState(null);

  function openCreate() {
    setEditingRace(null);
    setActionError(null);
    setActionSuccess(null);
    setModalOpen(true);
  }

  function openEdit(race) {
    setEditingRace(race);
    setActionError(null);
    setActionSuccess(null);
    setModalOpen(true);
  }

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['races'] });
  }

  function handleSaved(msg) {
    setModalOpen(false);
    setActionSuccess(msg);
    refresh();
  }

  async function handleRemove(race) {
    const ok = window.confirm(
      `Eliminare la gara "${race.race_name}" (${race.race_id})?\nL'operazione è bloccata se ci sono stint collegati.`
    );
    if (!ok) return;
    setRemovingId(race.race_id);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await api.races.remove(race.race_id);
      if (res?.deleted) {
        setActionSuccess(`Gara "${race.race_name}" eliminata.`);
        refresh();
      } else {
        setActionError('Eliminazione non riuscita.');
      }
    } catch (err) {
      // Il backend blocca con messaggio se ci sono stint collegati
      setActionError(err?.message || 'Errore durante l\'eliminazione.');
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>ADMIN — GESTIONE GARE</div>
          <h1 className={styles.title}>Gare</h1>
          <div className={styles.subtitle}>{races.length} gare in archivio</div>
        </div>
        <button className={styles.createBtn} onClick={openCreate}>+ Crea gara</button>
      </div>

      {actionError && <div className={styles.alertError}>⚠ {actionError}</div>}
      {actionSuccess && <div className={styles.alertOk}>✓ {actionSuccess}</div>}

      {isLoading && <div className={styles.loading}>Caricamento gare…</div>}
      {isError && <div className={styles.alertError}>Errore: {error?.message || 'sconosciuto'}</div>}

      {!isLoading && !isError && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>ID</th><th>Nome</th><th>Sim</th><th>Data</th>
                <th>Durata</th><th>Formato</th><th>Stato</th><th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {sortedRaces.length === 0 ? (
                <tr><td colSpan={8} className={styles.empty}>Nessuna gara. Crea la prima con "+ Crea gara".</td></tr>
              ) : sortedRaces.map(r => (
                <tr key={r.race_id}>
                  <td className={styles.colId}>{r.race_id}</td>
                  <td>{r.race_name}</td>
                  <td>{r.sim}</td>
                  <td className={styles.colDate}>{fmtDate(r.date)}</td>
                  <td className={styles.colDur}>{r.duration_minutes ? `${r.duration_minutes}'` : '—'}</td>
                  <td>
                    <span className={styles.formatTag}>{r.format || '—'}</span>
                    {r.format === 'endurance' && <span className={styles.enduranceDot} title="Endurance — supporta stint">●</span>}
                  </td>
                  <td><span className={`${styles.statusTag} ${styles['st_' + r.status]}`}>{STATUS_LABELS[r.status] || r.status}</span></td>
                  <td className={styles.actionsCell}>
                    <button className={styles.editBtn} onClick={() => openEdit(r)} title="Modifica">✎</button>
                    <button
                      className={styles.removeBtn}
                      onClick={() => handleRemove(r)}
                      disabled={removingId === r.race_id}
                      title="Elimina"
                    >×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <RaceFormModal
          race={editingRace}
          onClose={() => setModalOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
