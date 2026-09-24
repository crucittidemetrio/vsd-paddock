import { useState, useMemo } from 'react';
import IncidentReportSection from '../components/shared/IncidentReportSection';
import { useIncidentsPublicOutcomes } from '../hooks/useIncidents';
import styles from './Reclami.module.css';

// #408 (25/09/2026): pagina pubblica /reclami — sostituisce il bottone
// Discord verso il comando /segnala-incidente con una destinazione più
// immediata (richiesta esplicita di Demetrio: "più semplice e diretta").
// 2 tab, nessuna terza tab "Direzione Gara" — quella resta il registro
// staff-only già esistente in /admin/incidents (AdminIncidents.jsx),
// non duplicato qui. Community-wide come il resto del sistema reclami:
// nessun login richiesto per nessuna delle due tab.

const STATUSES = [
  { value: '', label: 'Tutti' },
  { value: 'open', label: 'Aperti' },
  { value: 'reviewing', label: 'In revisione' },
  { value: 'closed', label: 'Chiusi' },
];

function fmtDate(val) {
  if (!val) return null;
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return null;
  }
}

export default function Reclami() {
  const [tab, setTab] = useState('nuovo');

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>Direzione Gara</div>
        <h1 className={styles.title}>Reclami</h1>
        <p className={styles.sub}>
          Segnala un incidente o consulta lo stato delle segnalazioni già inviate — campionati
          VSD, UE144, ACI LMGT3 Challenge e Clash of Classes. Nessun login richiesto.
        </p>
      </header>

      <div className={styles.tabBar}>
        <button
          type="button"
          className={`${styles.tabBtn} ${tab === 'nuovo' ? styles.tabBtnActive : ''}`}
          onClick={() => setTab('nuovo')}
        >
          Nuovo reclamo
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${tab === 'esiti' ? styles.tabBtnActive : ''}`}
          onClick={() => setTab('esiti')}
        >
          Esiti
        </button>
      </div>

      {tab === 'nuovo' && (
        <IncidentReportSection
          anchorId="reclami-nuovo"
          mode="auto"
          eyebrow="Direzione Gara"
          title="Nuovo reclamo"
        />
      )}

      {tab === 'esiti' && <EsitiTab />}
    </div>
  );
}

function EsitiTab() {
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const query = useIncidentsPublicOutcomes(statusFilter || undefined);

  const filtered = useMemo(() => {
    const incidents = query.data || [];
    const q = search.trim().toLowerCase();
    if (!q) return incidents;
    return incidents.filter(i =>
      (i.reporter_sim || '').toLowerCase().includes(q) ||
      (i.against || '').toLowerCase().includes(q)
    );
  }, [query.data, search]);

  return (
    <div>
      <div className={styles.filterRow}>
        {STATUSES.map(s => (
          <button
            key={s.value || 'tutti'}
            type="button"
            className={`${styles.filterChip} ${statusFilter === s.value ? styles.filterChipActive : ''}`}
            onClick={() => setStatusFilter(s.value)}
          >
            {s.label}
          </button>
        ))}
        <input
          type="text"
          className={styles.searchInput}
          placeholder="Cerca un pilota…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {query.isLoading && <div className={styles.loading}>Caricamento…</div>}
      {query.error && <div className={styles.loading}>Errore: {query.error.message}</div>}

      {!query.isLoading && !query.error && (
        <div className={styles.list}>
          {filtered.length === 0 && (
            <div className={styles.empty}>Nessuna segnalazione in questa vista.</div>
          )}
          {filtered.map(inc => (
            <div key={inc.complaint_key} className={`${styles.card} ${styles['status_' + inc.status]}`}>
              <div className={styles.cardHead}>
                <span className={styles.driverName}>{inc.reporter_sim || '—'}</span>
                <span className={styles.arrow}>→</span>
                <span className={styles.driverName}>{inc.against || '—'}</span>
                {inc.incident_type && <span className={styles.typeTag}>{inc.incident_type}</span>}
                <span className={`${styles.statusBadge} ${styles['status_' + inc.status]}`}>
                  {STATUSES.find(s => s.value === inc.status)?.label || inc.status}
                </span>
              </div>
              <div className={styles.cardHead}>
                {inc.championship && <span className={styles.meta}>{inc.championship}</span>}
                {inc.race_id && <span className={styles.meta}>{inc.race_id}</span>}
                {inc.clash_round && <span className={styles.meta}>Clash Round {inc.clash_round}</span>}
                {inc.track && <span className={styles.meta}>{inc.track}</span>}
                {inc.lap && <span className={styles.meta}>giro {inc.lap}</span>}
                {inc.time_in_race && <span className={styles.meta}>{inc.time_in_race}</span>}
                {fmtDate(inc.race_date) && <span className={styles.meta}>gara del {fmtDate(inc.race_date)}</span>}
              </div>
              {inc.formalized && (inc.penalty_type || inc.penalty_detail) && (
                <div className={styles.verdict}>
                  Esito: {inc.penalty_type || 'nessuna penalità'}{inc.penalty_detail ? ` — ${inc.penalty_detail}` : ''}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
