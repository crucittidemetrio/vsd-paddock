import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuditions, useUpdateAudition } from '../hooks/useEndurance';
import { useTracks } from '../hooks/useLookups';
import { formatTrack } from '../utils/format';
import SimBadge from '../components/shared/SimBadge';
import styles from './AdminEndurance.module.css';

const STATUS_LABELS = {
  draft: 'Bozza',
  scheduled: 'Programmata',
  in_progress: 'In Corso',
  completed: 'Conclusa',
  cancelled: 'Annullata',
};

const STATUS_OPTIONS = ['', 'draft', 'scheduled', 'in_progress', 'completed', 'cancelled'];
const SIM_OPTIONS = ['', 'LMU', 'IRC', 'ACE'];

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function shortId(id) {
  if (!id) return '';
  return id.length > 12 ? id.substring(0, 12) + '…' : id;
}

export default function AdminEndurance() {
  const [statusFilter, setStatusFilter] = useState('');
  const [simFilter, setSimFilter] = useState('');

  const filters = useMemo(() => {
    const f = {};
    if (statusFilter) f.status = statusFilter;
    if (simFilter) f.sim = simFilter;
    return f;
  }, [statusFilter, simFilter]);

  const { data: auditions, isLoading, error } = useAuditions(filters);
  const { data: tracks = [], isLoading: tracksLoading } = useTracks();
  const updateMutation = useUpdateAudition();

  const stats = useMemo(() => {
    const s = { draft: 0, scheduled: 0, in_progress: 0, completed: 0, cancelled: 0 };
    (auditions || []).forEach(a => {
      if (s[a.status] !== undefined) s[a.status] += 1;
    });
    return s;
  }, [auditions]);

  function handleCancel(audition) {
    const ok = window.confirm(
      `Annullare l'audizione "${audition.name}"?\n\n` +
      `Lo status passerà a "cancelled" (soft delete). ` +
      `Potrai riattivarla in seguito modificando lo status.`
    );
    if (!ok) return;

    updateMutation.mutate(
      { audition_id: audition.audition_id, status: 'cancelled' },
      {
        onError: (err) => {
          alert('Errore durante l\'annullamento: ' + err.message);
        },
      }
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerRow}>
          <h1 className={styles.title}>Admin · Endurance</h1>
          <Link to="/admin/endurance/new" className={styles.btnPrimary}>
            + Nuova Audizione
          </Link>
        </div>

        <div className={styles.statsRow}>
          <StatChip label="Bozze" value={stats.draft} variant="draft" />
          <StatChip label="Programmate" value={stats.scheduled} variant="scheduled" />
          <StatChip label="In Corso" value={stats.in_progress} variant="in_progress" />
          <StatChip label="Concluse" value={stats.completed} variant="completed" />
          <StatChip label="Annullate" value={stats.cancelled} variant="cancelled" />
        </div>
      </header>

      <section className={styles.filtersBar}>
        <label className={styles.filterField}>
          <span className={styles.filterLabel}>Status</span>
          <select
            className={styles.select}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {STATUS_OPTIONS.map(s => (
              <option key={s || 'all'} value={s}>
                {s ? STATUS_LABELS[s] : 'Tutti gli status'}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.filterField}>
          <span className={styles.filterLabel}>Sim</span>
          <select
            className={styles.select}
            value={simFilter}
            onChange={(e) => setSimFilter(e.target.value)}
          >
            {SIM_OPTIONS.map(s => (
              <option key={s || 'all'} value={s}>
                {s || 'Tutti i sim'}
              </option>
            ))}
          </select>
        </label>

        {(statusFilter || simFilter) && (
          <button
            className={styles.btnClear}
            onClick={() => { setStatusFilter(''); setSimFilter(''); }}
          >
            Pulisci filtri
          </button>
        )}
      </section>

      {isLoading && (
        <div className={styles.empty}>Caricamento audizioni…</div>
      )}

      {error && (
        <div className={styles.errorBox}>
          Errore: {error.message || 'caricamento fallito'}
        </div>
      )}

      {!isLoading && !error && (!auditions || auditions.length === 0) && (
        <div className={styles.empty}>
          {(statusFilter || simFilter)
            ? 'Nessuna audizione corrisponde ai filtri selezionati.'
            : 'Nessuna audizione presente. Crea la prima con "+ Nuova Audizione".'}
        </div>
      )}

      {!isLoading && auditions && auditions.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Nome</th>
                <th>Sim</th>
                <th>Data</th>
                <th>Classe</th>
                <th>Tracciato</th>
                <th>Status</th>
                <th className={styles.thActions}>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {auditions.map(a => {
                const isCancelled = a.status === 'cancelled';
                const trackName = formatTrack(a.track_id, tracks);

                return (
                  <tr key={a.audition_id} className={isCancelled ? styles.rowCancelled : ''}>
                    <td><code className={styles.idCell}>{shortId(a.audition_id)}</code></td>
                    <td className={styles.nameCell}>{a.name || '—'}</td>
                    <td><SimBadge sim={a.sim} variant="solid" size="sm" /></td>
                    <td className={styles.dateCell}>{formatDate(a.date)}</td>
                    <td>{a.pilot_class || '—'}</td>
                    <td className={styles.trackCell}>{trackName}</td>
                    <td>
                      <span className={`${styles.statusPill} ${styles[`pill_${a.status}`]}`}>
                        {STATUS_LABELS[a.status] || a.status}
                      </span>
                    </td>
                    <td className={styles.actionsCell}>
                      <Link
                        to={`/admin/endurance/${a.audition_id}/edit`}
                        className={styles.actionBtn}
                      >
                        Modifica
                      </Link>
                      <Link
                        to={`/endurance/${a.audition_id}`}
                        className={styles.actionBtnGhost}
                        title="Apri pagina pubblica"
                        target="_blank"
                      >
                        ↗
                      </Link>
                      {!isCancelled && (
                        <button
                          onClick={() => handleCancel(a)}
                          className={styles.actionBtnDanger}
                          disabled={updateMutation.isPending}
                        >
                          Annulla
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tracksLoading && (
        <div className={styles.footerNote}>Caricamento dati lookups…</div>
      )}
    </div>
  );
}

function StatChip({ label, value, variant }) {
  return (
    <div className={`${styles.statChip} ${styles[`stat_${variant}`]}`}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}
