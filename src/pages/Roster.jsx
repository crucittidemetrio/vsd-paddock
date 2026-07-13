import { useState, useMemo } from 'react';
import { useDrivers } from '../hooks/useRoster';
import DriverCard from '../components/shared/DriverCard';
import { SIM_LIST, DRIVER_STATUS } from '../utils/constants';
import './Roster.css';
import './Page.css';

// Questo hook chiama la stessa query key ['drivers', {}] già
// pre-popolata da useLandingData con includeRemoved: true.
// I piloti rimossi arrivano con is_ex_vsd: true.

const STATUS_FILTERS = [
  { id: 'all',     label: 'Tutti' },
  { id: DRIVER_STATUS.ACTIVE,   label: 'Attivi' },
  { id: DRIVER_STATUS.TRIAL,    label: 'In prova' },
  { id: DRIVER_STATUS.INACTIVE, label: 'Inattivi' },
];

export default function Roster() {
  const [statusFilter, setStatusFilter] = useState(DRIVER_STATUS.ACTIVE);
  const [simFilter, setSimFilter] = useState('all');
  const [showEx, setShowEx] = useState(false);

  const { data: drivers, isLoading, error } = useDrivers({ includeRemoved: true });

  // Separa piloti attivi/inattivi dagli ex-VSD
  const activeDrivers = useMemo(() => (drivers || []).filter(d => !d.is_ex_vsd), [drivers]);
  const exDrivers     = useMemo(() => (drivers || []).filter(d =>  d.is_ex_vsd), [drivers]);

  const filtered = useMemo(() => {
    return activeDrivers.filter(d => {
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      if (simFilter !== 'all' && !d.preferred_sims?.includes(simFilter)) return false;
      return true;
    });
  }, [activeDrivers, statusFilter, simFilter]);

  const counts = useMemo(() => {
    return {
      total:  activeDrivers.length,
      active: activeDrivers.filter(d => d.status === 'active').length,
      trial:  activeDrivers.filter(d => d.status === 'trial').length,
    };
  }, [activeDrivers]);

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-eyebrow">ROSTER</div>
        <h1 className="page-title">Piloti VSD</h1>
        <p className="page-sub">
          {counts.total} piloti totali · {counts.active} attivi
          {counts.trial > 0 && ` · ${counts.trial} in prova`}
        </p>
      </div>

      <div className="roster-filters">
        <div className="filter-group">
          <div className="filter-label">Stato</div>
          <div className="filter-pills">
            {STATUS_FILTERS.map(f => (
              <button
                key={f.id}
                className={`filter-pill${statusFilter === f.id ? ' is-active' : ''}`}
                onClick={() => setStatusFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="filter-group">
          <div className="filter-label">Sim</div>
          <div className="filter-pills">
            <button
              className={`filter-pill${simFilter === 'all' ? ' is-active' : ''}`}
              onClick={() => setSimFilter('all')}
            >
              Tutte
            </button>
            {SIM_LIST.map(s => (
              <button
                key={s.id}
                className={`filter-pill${simFilter === s.id ? ' is-active' : ''}`}
                onClick={() => setSimFilter(s.id)}
              >
                {s.short}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="roster-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="driver-card skeleton-card" />
          ))}
        </div>
      )}

      {error && (
        <div className="page-stub">
          <div className="page-stub-icon">⚠</div>
          <div className="page-stub-title">Errore caricamento roster</div>
          <div className="page-stub-text">{error.message}</div>
        </div>
      )}

      {!isLoading && !error && filtered.length === 0 && (
        <div className="page-stub">
          <div className="page-stub-icon">∅</div>
          <div className="page-stub-title">Nessun pilota</div>
          <div className="page-stub-text">Prova a cambiare i filtri.</div>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="roster-grid">
          {filtered.map(d => <DriverCard key={d.driver_id} driver={d} />)}
        </div>
      )}

      {!isLoading && exDrivers.length > 0 && (
        <div className="roster-ex-section">
          <button
            className="roster-ex-toggle"
            onClick={() => setShowEx(v => !v)}
          >
            <span className="roster-ex-label">Ex Piloti</span>
            <span className="roster-ex-count">{exDrivers.length}</span>
            <span className="roster-ex-chevron">{showEx ? '▲' : '▼'}</span>
          </button>
          {showEx && (
            <div className="roster-grid roster-ex-grid">
              {exDrivers.map(d => <DriverCard key={d.driver_id} driver={d} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}