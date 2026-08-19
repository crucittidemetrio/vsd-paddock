import { useMyIncidents } from '../../hooks/useIncidents';
import './MyIncidentsPanel.css';

const STATUS_LABELS = { open: 'Aperto', reviewing: 'In revisione', closed: 'Chiuso' };

function fmtDate(val) {
  if (!val) return '—';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return String(val);
  }
}

/**
 * MyIncidentsPanel — segnalazioni (come segnalante o come segnalato) che
 * riguardano il pilota loggato, in sola lettura. Visibile SOLO sul
 * proprio profilo (gate fatto dal chiamante, DriverProfile.jsx) — le
 * note interne dello staff non sono mai incluse in questa vista (già
 * filtrate lato backend).
 */
export default function MyIncidentsPanel({ driverId }) {
  const { data: incidents, isLoading, error } = useMyIncidents(driverId);

  if (isLoading) return null;
  if (error) return null;
  if (!incidents || incidents.length === 0) return null;

  return (
    <div className="mip-section">
      <div className="mip-header">
        <h2 className="mip-title">I miei incidenti</h2>
        <span className="mip-count">{incidents.length}</span>
      </div>
      <p className="mip-desc">
        Segnalazioni fatte da te o su di te, dal Modulo reclamo del team — con lo stato
        formalizzato dallo staff quando disponibile.
      </p>

      <div className="mip-list">
        {incidents.map(inc => {
          const isReporter = inc.reporter_driver_id === driverId;
          return (
            <div key={inc.complaint_key} className={`mip-card mip-status-${inc.status}`}>
              <div className="mip-card-head">
                <span className={`mip-role ${isReporter ? 'mip-role-reporter' : 'mip-role-accused'}`}>
                  {isReporter ? 'Hai segnalato' : 'Sei stato segnalato'}
                </span>
                <span className={`mip-status-badge mip-status-badge-${inc.status}`}>
                  {STATUS_LABELS[inc.status] || inc.status}
                </span>
              </div>

              <div className="mip-meta-row">
                <span className="mip-vs">
                  {inc.reporter_sim || '—'} <span className="mip-arrow">→</span> {inc.against || '—'}
                </span>
                {inc.incident_type && <span className="mip-tag">{inc.incident_type}</span>}
              </div>

              <div className="mip-meta-row mip-meta-secondary">
                {inc.track && <span>{inc.track}</span>}
                {inc.lap && <span>giro {inc.lap}</span>}
                {inc.race_date && <span>gara del {fmtDate(inc.race_date)}</span>}
              </div>

              {inc.description && <div className="mip-description">{inc.description}</div>}

              {(inc.penalty_type || inc.verdict) && (
                <div className="mip-verdict">
                  {inc.penalty_type && (
                    <span className="mip-penalty">
                      {inc.penalty_type}{inc.penalty_detail ? ` — ${inc.penalty_detail}` : ''}
                    </span>
                  )}
                  {!inc.penalty_type && inc.verdict && (
                    <span className="mip-penalty-text">{inc.verdict}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
