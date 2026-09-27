import { useState, useMemo, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { useReports, useRaces, useUpdateReport } from '../hooks/useRaces';
import { useDrivers } from '../hooks/useRoster';
import { useAuth } from '../hooks/useAuth';
import { useReportReactions, useToggleReportReaction } from '../hooks/useReportReactions';
import Avatar from '../components/shared/Avatar';
import SimBadge from '../components/shared/SimBadge';
import LapTime from '../components/shared/LapTime';
import { useConsentSocialFlags, useConsentedDriverPhoto } from '../hooks/useConsent';
import { resolvePhotoUrl } from '../utils/driverPhotos';
import { formatTrack, formatDate } from '../utils/format';
import { REPORT_REACTION_EMOJI } from '../utils/constants';
import './Reports.css';
import './Page.css';

const VIEWS = [
  { id: 'by-race', label: 'Per gara' },
  { id: 'flat', label: 'Cronologico' },
];

export default function Reports() {
  const [view, setView] = useState('by-race');
  const [driverFilter, setDriverFilter] = useState('all');
  const { isStaff, driver: myDriver } = useAuth();

  const { data: reports, isLoading } = useReports();
  const { data: races } = useRaces();
  const { data: drivers } = useDrivers();
  const { data: reactions } = useReportReactions();

  const reactionsByReport = useMemo(() => {
    const m = {};
    (reactions || []).forEach(r => {
      if (!m[r.report_id]) m[r.report_id] = [];
      m[r.report_id].push(r);
    });
    return m;
  }, [reactions]);

  const driverMap = useMemo(() => {
    const m = {};
    (drivers || []).forEach(d => { m[d.driver_id] = d; });
    return m;
  }, [drivers]);

  const raceMap = useMemo(() => {
    const m = {};
    (races || []).forEach(r => { m[r.race_id] = r; });
    return m;
  }, [races]);

  const filtered = useMemo(() => {
    if (!reports) return [];
    return reports.filter(r => {
      if (driverFilter !== 'all' && r.driver_id !== driverFilter) return false;
      return true;
    });
  }, [reports, driverFilter]);

  // Raggruppa per gara
  const grouped = useMemo(() => {
    const groups = {};
    filtered.forEach(r => {
      if (!groups[r.race_id]) groups[r.race_id] = [];
      groups[r.race_id].push(r);
    });
    // Ordina report dentro ogni gara per finish_position
    Object.values(groups).forEach(arr => {
      arr.sort((a, b) => a.finish_position - b.finish_position);
    });
    // Trasforma in array, ordina gare per data race desc
    return Object.entries(groups)
      .map(([race_id, rows]) => ({
        race: raceMap[race_id],
        race_id,
        rows,
      }))
      .sort((a, b) => {
        const da = a.race?.date ? new Date(a.race.date) : 0;
        const db = b.race?.date ? new Date(b.race.date) : 0;
        return db - da;
      });
  }, [filtered, raceMap]);

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-eyebrow">RACE REPORT</div>
        <h1 className="page-title">Report Post-Gara</h1>
        <p className="page-sub">
          {reports?.length || 0} report totali ·{' '}
          {grouped.length} {grouped.length === 1 ? 'gara' : 'gare'}
        </p>
      </div>

      {/* CONTROLS */}
      <div className="reports-controls">
        <div className="view-switch">
          {VIEWS.map(v => (
            <button
              key={v.id}
              className={`view-switch-btn${view === v.id ? ' is-active' : ''}`}
              onClick={() => setView(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>

        <div className="filter-group">
          <div className="filter-label">Filtra pilota</div>
          <select
            className="filter-select"
            value={driverFilter}
            onChange={e => setDriverFilter(e.target.value)}
          >
            <option value="all">Tutti i piloti</option>
            {drivers?.map(d => (
              <option key={d.driver_id} value={d.driver_id}>
                {d.display_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* CONTENT */}
      {isLoading && (
        <div className="skeleton-block" style={{ minHeight: 240 }} />
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="page-stub">
          <div className="page-stub-icon">∅</div>
          <div className="page-stub-title">Nessun report</div>
          <div className="page-stub-text">
            {driverFilter !== 'all' ? 'Cambia filtro pilota.' : 'I report appariranno qui dopo le gare.'}
          </div>
        </div>
      )}

      {!isLoading && view === 'by-race' && grouped.map(group => (
        <RaceGroup
          key={group.race_id}
          race={group.race}
          rows={group.rows}
          driverMap={driverMap}
          isStaff={isStaff}
        />
      ))}

      {!isLoading && view === 'flat' && (
        <div className="reports-flat">
          {filtered
            .slice()
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .map(r => (
              <ReportCard
                key={r.report_id}
                report={r}
                race={raceMap[r.race_id]}
                driver={driverMap[r.driver_id]}
                isStaff={isStaff}
                reactions={reactionsByReport[r.report_id] || []}
                myDriverId={myDriver?.driver_id}
              />
            ))
          }
        </div>
      )}
    </div>
  );
}

// =====================================================
// RACE GROUP — tutti i report di una gara, raggruppati
// =====================================================
function RaceGroup({ race, rows, driverMap, isStaff }) {
  const { data: socialFlagsData } = useConsentSocialFlags();
  const socialFlags = socialFlagsData?.flags || {};
  const [editingId, setEditingId] = useState(null);
  if (!race) return null;
  const podiums = rows.filter(r => r.finish_position <= 3).length;

  return (
    <section className="race-group">
      <div className="race-group-head">
        <div className="rg-context">
          <SimBadge sim={race.sim} variant="solid" size="sm" />
          <div className="rg-titles">
            <div className="rg-title">{race.title}</div>
            <div className="rg-meta">
              {formatTrack(race.track_id)} · {formatDate(race.date)} · {rows.length} {rows.length === 1 ? 'report' : 'report'}
              {podiums > 0 && ` · ${podiums} sul podio`}
            </div>
          </div>
        </div>
      </div>

      <div className="data-table-wrap">
        <table className="data-table reports-table">
          <thead>
            <tr>
              <th>Pilota</th>
              <th className="num">Griglia</th>
              <th className="num">Arrivo</th>
              <th className="num">Best Lap</th>
              <th className="num">Inc.</th>
              <th>Strategia</th>
              {isStaff && <th className="num">Rating</th>}
              {isStaff && <th className="num">Azioni</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const d = driverMap[r.driver_id];
              const delta = r.grid_position - r.finish_position;
              const isPodium = r.finish_position <= 3;
              const isEditing = editingId === r.report_id;
              return (
                <Fragment key={r.report_id}>
                  <tr>
                    <td>
                      {d ? (
                        <Link to={`/roster/${d.driver_id}`} className="driver-link">
                          <Avatar name={d.display_name} driverId={d.driver_id} size={28} photoUrl={resolvePhotoUrl(d.driver_id, socialFlags)} />
                          <span className="driver-link-name">{d.display_name}</span>
                        </Link>
                      ) : r.driver_id}
                    </td>
                    <td className="num">{r.grid_position}</td>
                    <td className="num">
                      <span className={`finish-pos${isPodium ? ' is-podium' : ''}`}>
                        P{r.finish_position}
                      </span>
                      {delta !== 0 && (
                        <span className={`pos-delta${delta > 0 ? ' is-gain' : ' is-loss'}`}>
                          {delta > 0 ? `+${delta}` : delta}
                        </span>
                      )}
                    </td>
                    <td className="num">
                      <LapTime ms={r.best_lap_ms} size="sm" />
                    </td>
                    <td className="num">
                      <span className={r.incidents > 0 ? 'inc-bad' : 'inc-clean'}>
                        {r.incidents}
                      </span>
                    </td>
                    <td className="cell-notes">{r.strategy_notes || '—'}</td>
                    {isStaff && (
                      <td className="num">
                        <RatingStars value={r.staff_rating} />
                      </td>
                    )}
                    {isStaff && (
                      <td className="num">
                        <button
                          type="button"
                          className="rc-edit-toggle-btn"
                          onClick={() => setEditingId(isEditing ? null : r.report_id)}
                        >
                          {isEditing ? 'Chiudi' : 'Modifica'}
                        </button>
                      </td>
                    )}
                  </tr>
                  {isStaff && isEditing && (
                    <tr className="rc-edit-row">
                      <td colSpan={7}>
                        <ReportEditForm report={r} onDone={() => setEditingId(null)} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// =====================================================
// FLAT REPORT CARD — singolo report (vista cronologica)
// =====================================================
function ReportCard({ report, race, driver, isStaff, reactions = [], myDriverId }) {
  const photoUrl = useConsentedDriverPhoto(driver?.driver_id);
  const [isEditing, setIsEditing] = useState(false);
  if (!race || !driver) return null;
  const delta = report.grid_position - report.finish_position;
  const isPodium = report.finish_position <= 3;

  return (
    <div className="report-card">
      <div className="rc-head">
        <Link to={`/roster/${driver.driver_id}`} className="driver-link">
          <Avatar name={driver.display_name} driverId={driver.driver_id} size={40} ring={isPodium} photoUrl={photoUrl} />
          <div className="rc-driver-block">
            <div className="rc-driver-name">{driver.display_name}</div>
            <div className="rc-race-context">
              <SimBadge sim={race.sim} size="sm" />
              <span className="rc-race-title">{race.title}</span>
            </div>
          </div>
        </Link>
        <div className="rc-finish">
          <div className="rc-finish-row">
            <span className={`finish-pos rc-pos${isPodium ? ' is-podium' : ''}`}>
              P{report.finish_position}
            </span>
            {delta !== 0 && (
              <span className={`pos-delta${delta > 0 ? ' is-gain' : ' is-loss'}`}>
                {delta > 0 ? `+${delta}` : delta}
              </span>
            )}
          </div>
          <div className="rc-grid">da P{report.grid_position}</div>
        </div>
      </div>

      {isStaff && !isEditing && (
        <button type="button" className="rc-edit-toggle-btn rc-edit-toggle-btn-card" onClick={() => setIsEditing(true)}>
          Modifica report
        </button>
      )}
      {isStaff && isEditing && (
        <ReportEditForm report={report} onDone={() => setIsEditing(false)} />
      )}

      <div className="rc-stats">
        <RcStat label="Best Lap" value={<LapTime ms={report.best_lap_ms} size="sm" />} />
        <RcStat label="Incidenti" value={
          <span className={report.incidents > 0 ? 'inc-bad' : 'inc-clean'}>
            {report.incidents}
          </span>
        } />
        {isStaff && <RcStat label="Rating Staff" value={<RatingStars value={report.staff_rating} />} />}
        <RcStat label="Data" value={<span className="cell-date">{formatDate(report.created_at)}</span>} />
      </div>

      {(report.strategy_notes || report.incident_notes) && (
        <div className="rc-notes">
          {report.strategy_notes && (
            <div className="rc-note-block">
              <div className="rc-note-label">Strategia</div>
              <div className="rc-note-text">{report.strategy_notes}</div>
            </div>
          )}
          {report.incident_notes && (
            <div className="rc-note-block">
              <div className="rc-note-label">Incidenti</div>
              <div className="rc-note-text">{report.incident_notes}</div>
            </div>
          )}
        </div>
      )}

      {isStaff && report.staff_notes && (
        <div className="rc-staff-notes">
          <span className="staff-tag">STAFF</span> {report.staff_notes}
        </div>
      )}

      <ReactionBar reportId={report.report_id} reactions={reactions} myDriverId={myDriverId} />
    </div>
  );
}

// =====================================================
// REACTION BAR — reazioni emoji sotto un Race Report
// =====================================================
function ReactionBar({ reportId, reactions, myDriverId }) {
  const toggleMutation = useToggleReportReaction();

  // Conteggio per emoji + se il pilota loggato ha già reagito con quella.
  const counts = {};
  let myEmoji = null;
  reactions.forEach(r => {
    counts[r.emoji] = (counts[r.emoji] || 0) + 1;
    if (myDriverId && r.driver_id === myDriverId) myEmoji = r.emoji;
  });

  function handleClick(emoji) {
    if (!myDriverId || toggleMutation.isPending) return;
    toggleMutation.mutate({ report_id: reportId, emoji });
  }

  return (
    <div className="rc-reactions">
      {REPORT_REACTION_EMOJI.map(emoji => {
        const count = counts[emoji] || 0;
        const isMine = myEmoji === emoji;
        return (
          <button
            key={emoji}
            type="button"
            className={`rc-reaction-btn${isMine ? ' is-active' : ''}`}
            onClick={() => handleClick(emoji)}
            disabled={!myDriverId}
            title={myDriverId ? (isMine ? 'Rimuovi reazione' : 'Reagisci') : 'Accedi per reagire'}
          >
            <span>{emoji}</span>
            {count > 0 && <span className="rc-reaction-count">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

function RcStat({ label, value }) {
  return (
    <div className="rc-stat">
      <div className="rc-stat-label">{label}</div>
      <div className="rc-stat-value">{value}</div>
    </div>
  );
}

function RatingStars({ value = 0 }) {
  const max = 5;
  return (
    <span className="rating-stars" title={`${value}/${max}`}>
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} className={`star${i < value ? ' is-on' : ''}`}>★</span>
      ))}
    </span>
  );
}

// =====================================================
// REPORT EDIT FORM — #446: pannello staff/admin per
// strategy_notes/incident_notes/staff_rating/staff_notes.
// Usato sia nella riga espandibile di RaceGroup (vista "Per gara")
// sia in ReportCard (vista "Cronologico").
// =====================================================
function ReportEditForm({ report, onDone }) {
  const mutation = useUpdateReport();
  const [strategyNotes, setStrategyNotes] = useState(report.strategy_notes || '');
  const [incidentNotes, setIncidentNotes] = useState(report.incident_notes || '');
  const [staffNotes, setStaffNotes] = useState(report.staff_notes || '');
  const [staffRating, setStaffRating] = useState(report.staff_rating || 0);

  function handleSave() {
    mutation.mutate(
      {
        report_id: report.report_id,
        strategy_notes: strategyNotes,
        incident_notes: incidentNotes,
        staff_notes: staffNotes,
        staff_rating: staffRating,
      },
      { onSuccess: () => onDone?.() }
    );
  }

  return (
    <div className="rc-edit">
      <div className="rc-edit-field">
        <label className="rc-edit-label" htmlFor={`strategy-${report.report_id}`}>Strategia</label>
        <textarea
          id={`strategy-${report.report_id}`}
          className="rc-edit-textarea"
          rows={2}
          value={strategyNotes}
          onChange={e => setStrategyNotes(e.target.value)}
          placeholder="Scelte di strategia, pit stop, gestione gomme…"
        />
      </div>
      <div className="rc-edit-field">
        <label className="rc-edit-label" htmlFor={`incident-${report.report_id}`}>Incidenti</label>
        <textarea
          id={`incident-${report.report_id}`}
          className="rc-edit-textarea"
          rows={2}
          value={incidentNotes}
          onChange={e => setIncidentNotes(e.target.value)}
          placeholder="Note su contatti, penalità, episodi in pista…"
        />
      </div>
      <div className="rc-edit-field">
        <label className="rc-edit-label" htmlFor={`staffnotes-${report.report_id}`}>Note staff (visibili solo allo staff)</label>
        <textarea
          id={`staffnotes-${report.report_id}`}
          className="rc-edit-textarea"
          rows={2}
          value={staffNotes}
          onChange={e => setStaffNotes(e.target.value)}
          placeholder="Valutazioni interne non visibili al pilota…"
        />
      </div>
      <div className="rc-edit-field">
        <span className="rc-edit-label">Rating</span>
        <StarPicker value={staffRating} onChange={setStaffRating} />
      </div>

      {mutation.isError && (
        <div className="rc-edit-error">Errore: {mutation.error?.message || 'salvataggio fallito'}</div>
      )}

      <div className="rc-edit-actions">
        <button type="button" className="rc-edit-cancel-btn" onClick={onDone} disabled={mutation.isPending}>
          Annulla
        </button>
        <button type="button" className="rc-edit-save-btn" onClick={handleSave} disabled={mutation.isPending}>
          {mutation.isPending ? 'Salvataggio…' : 'Salva'}
        </button>
      </div>
    </div>
  );
}

function StarPicker({ value = 0, onChange }) {
  const max = 5;
  return (
    <span className="rating-stars rating-stars-edit">
      {Array.from({ length: max }).map((_, i) => {
        const n = i + 1;
        return (
          <button
            key={n}
            type="button"
            className={`star star-btn${n <= value ? ' is-on' : ''}`}
            onClick={() => onChange(n === value ? 0 : n)}
            aria-label={`${n} stelle`}
            title={`${n} stelle`}
          >
            ★
          </button>
        );
      })}
    </span>
  );
}