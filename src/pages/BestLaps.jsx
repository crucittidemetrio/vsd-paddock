import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { upload } from '@vercel/blob/client';
import {
  useTeamLeaderboard,
  useMyBestLaps,
  useTracks,
  useCars,
} from '../hooks/useBestLaps';
import {
  useMyLapSubmissions,
  useSubmitLap,
  useRemoveLapSubmission,
} from '../hooks/useLapSubmissions';
import { useDrivers } from '../hooks/useRoster';
import { useAuth } from '../hooks/useAuth';
import { useConsentSocialFlags } from '../hooks/useConsent';
import { useShowExDrivers } from '../hooks/useShowExDrivers';
import SimBadge from '../components/shared/SimBadge';
import LapTime from '../components/shared/LapTime';
import Avatar from '../components/shared/Avatar';
import Sparkline from '../components/shared/Sparkline';
import { SIM_LIST } from '../utils/constants';
import { formatTrack, formatCar, formatGapPercent } from '../utils/format';
import { resolvePhotoUrl } from '../utils/driverPhotos';
import './BestLaps.css';
import './Page.css';

const VIEW_MODES = [
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'mine', label: 'I miei tempi' },
];

const SEASON_OPTIONS = [
  { id: 'season2026', label: 'Stagione 2026' },
  { id: 'all', label: 'All-time' },
];

export default function BestLaps() {
  const { driver, isVsdPilot, isStaff, isAdmin } = useAuth();
  const [viewMode, setViewMode] = useState('leaderboard');
  const [seasonFilter, setSeasonFilter] = useState('season2026');
  const [simFilter, setSimFilter] = useState('LMU'); // LMU sim primario — vedi richiesta team
  const [trackFilter, setTrackFilter] = useState('all');
  const [raceClassFilter, setRaceClassFilter] = useState('all');
  const [showExVsd, toggleShowExVsd] = useShowExDrivers();

  const filters = {
    sim: simFilter,
    track_id: trackFilter,
    race_class: raceClassFilter,
    season: seasonFilter,
    includeExVsd: isAdmin && showExVsd,
  };

  // includeRemoved:true — serve il roster completo (anche ex-VSD) per
  // poter mostrare nome/avatar quando l'admin rivela i loro tempi col
  // toggle sopra, invece di un driver_id grezzo senza nome.
  const { data: drivers } = useDrivers({ includeRemoved: true });
  const { data: tracks } = useTracks();
  const { data: cars } = useCars();

  const driverMap = useMemo(() => {
    const m = {};
    (drivers || []).forEach(d => { m[d.driver_id] = d; });
    return m;
  }, [drivers]);

  const raceClassOptions = useMemo(() => {
    if (!cars) return [];
    const set = new Set();
    cars.forEach(c => {
      const rc = c.race_class && String(c.race_class).trim();
      if (!rc) return;
      if (simFilter === 'all' || c.sim === simFilter) {
        set.add(rc);
      }
    });
    return Array.from(set).sort();
  }, [cars, simFilter]);

  const trackOptions = useMemo(() => {
    if (!tracks) return [];
    const filtered = tracks.filter(t => simFilter === 'all' || t.sim === simFilter);
    const seen = new Set();
    const unique = [];
    filtered.forEach(t => {
      if (!seen.has(t.track_id)) {
        seen.add(t.track_id);
        unique.push(t);
      }
    });
    return unique.sort((a, b) =>
      String(a.track_name || '').localeCompare(String(b.track_name || ''))
    );
  }, [tracks, simFilter]);

  function handleSimChange(newSim) {
    setSimFilter(newSim);
    setTrackFilter('all');
    setRaceClassFilter('all');
  }

  function resetFilters() {
    setSimFilter('all');
    setTrackFilter('all');
    setRaceClassFilter('all');
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-eyebrow">BEST LAPS</div>
        <h1 className="page-title">Database Tempi</h1>
      </div>

      <div className="laps-top-bar">
        <div className="view-switch">
          {VIEW_MODES.filter(v => v.id !== 'mine' || isVsdPilot).map(v => (
            <button
              key={v.id}
              className={`view-switch-btn ${viewMode === v.id ? 'is-active' : ''}`}
              onClick={() => setViewMode(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>

        <div className="season-toggle">
          {SEASON_OPTIONS.map(s => (
            <button
              key={s.id}
              className={`season-btn ${seasonFilter === s.id ? 'is-active' : ''}`}
              onClick={() => setSeasonFilter(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>

        {isAdmin && (
          <button
            type="button"
            className={`season-btn ${showExVsd ? 'is-active' : ''}`}
            onClick={toggleShowExVsd}
            title="Di default i tempi degli ex piloti VSD sono nascosti dai confronti — solo tu puoi rivelarli"
          >
            {showExVsd ? '👁 Ex piloti visibili' : '🚫 Ex piloti nascosti'}
          </button>
        )}
      </div>

      <div className="laps-filters">
        <div className="filter-group">
          <label className="filter-label">Sim</label>
          <select
            className="filter-select"
            value={simFilter}
            onChange={e => handleSimChange(e.target.value)}
          >
            <option value="all">Tutti</option>
            {SIM_LIST.map(s => (
              <option key={s.id} value={s.id}>{s.short || s.name || s.id}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label className="filter-label">Classe</label>
          <select
            className="filter-select"
            value={raceClassFilter}
            onChange={e => setRaceClassFilter(e.target.value)}
          >
            <option value="all">Tutte</option>
            {raceClassOptions.map(rc => (
              <option key={rc} value={rc}>{rc}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label className="filter-label">Tracciato</label>
          <select
            className="filter-select"
            value={trackFilter}
            onChange={e => setTrackFilter(e.target.value)}
          >
            <option value="all">Tutti</option>
            {trackOptions.map(t => (
              <option key={t.track_id} value={t.track_id}>{t.track_name}</option>
            ))}
          </select>
        </div>

        <button className="reset-btn" onClick={resetFilters}>Reset filtri</button>
      </div>

      {viewMode === 'leaderboard' && (
        <LeaderboardView
          filters={filters}
          driverMap={driverMap}
          tracks={tracks}
          cars={cars}
          isStaff={isStaff}
        />
      )}

      {viewMode === 'mine' && (
        <MineView
          driver={driver}
          filters={filters}
          tracks={tracks}
          cars={cars}
        />
      )}
    </div>
  );
}


function LeaderboardView({ filters, driverMap, tracks, cars, isStaff }) {
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useTeamLeaderboard(filters);
  const { data: socialFlagsData } = useConsentSocialFlags();
  const socialFlags = socialFlagsData?.flags || {};

  function goToDrilldown(rec) {
    const sim = String(rec.sim).toLowerCase();
    const track = String(rec.track_id).toLowerCase();
    const category = String(rec.race_class).toLowerCase();
    navigate(`/laps/${encodeURIComponent(sim)}/${encodeURIComponent(track)}/${encodeURIComponent(category)}`);
  }

  if (isLoading) return <Prompt text="Caricamento…" />;
  if (isError) return <Prompt text={`Errore: ${error?.message || 'sconosciuto'}`} />;
  if (!data || data.length === 0) {
    return (
      <Prompt
        icon="⚡"
        title="Nessun record"
        text="Nessun giro trovato per i filtri selezionati. Prova a rimuoverne o cambiare stagione."
      />
    );
  }

  return (
    <table className="laps-table">
      <thead>
        <tr>
          <th className="col-pos">#</th>
          <th>Sim</th>
          <th>Tracciato</th>
          <th>Classe</th>
          <th>Auto</th>
          <th>Pilota</th>
          <th>Tempo</th>
          <th>Trend</th>
          {isStaff && <th>Stato</th>}
        </tr>
      </thead>
      <tbody>
        {data.map(rec => {
          const driver = driverMap[rec.driver_id];
          return (
            <tr
              key={`${rec.sim}-${rec.track_id}-${rec.race_class}`}
              className="is-podium pos-1 is-clickable"
              onClick={(e) => {
                if (e.target.closest('a')) return;
                goToDrilldown(rec);
              }}
            >
              <td className="col-pos"><span className="pos-badge">1</span></td>
              <td><SimBadge sim={rec.sim} /></td>
              <td>{formatTrack(rec.track_id, tracks)}</td>
              <td><span className="lap-badge-record">{rec.race_class}</span></td>
              <td>{formatCar(rec.car_id, cars)}</td>
              <td>
                {driver ? (
                  <Link to={`/roster/${driver.driver_id}`} className="driver-link">
                    <Avatar name={driver.display_name} driverId={driver.driver_id} size={28} photoUrl={resolvePhotoUrl(driver.driver_id, socialFlags)} />
                    <span className="driver-link-name">{driver.display_name}</span>
                    {driver.is_ex_vsd && <span className="lap-badge-unclassified">EX</span>}
                  </Link>
                ) : rec.driver_id}
              </td>
              <td><LapTime ms={rec.lap_time_ms} /></td>
              <td><Sparkline values={rec.lastLaps} /></td>
              {isStaff && (
                <td>
                  {rec.verified_by
                    ? <span className="lap-verified">✓ verificato</span>
                    : <span className="lap-pending">⏳ da verificare</span>
                  }
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}


function MineView({ driver, filters, tracks, cars }) {
  const { data, isLoading, isError, error } = useMyBestLaps(driver?.driver_id, filters);

  if (!driver) {
    return <Prompt title="Accesso richiesto" text="Effettua il login per vedere i tuoi tempi." />;
  }

  return (
    <>
      <SubmitLapSection />

      {isLoading && <Prompt text="Caricamento…" />}
      {isError && <Prompt text={`Errore: ${error?.message || 'sconosciuto'}`} />}
      {!isLoading && !isError && (!data || data.length === 0) && (
        <Prompt
          icon="🏁"
          title="Nessun giro registrato"
          text="Non risultano tuoi giri per i filtri selezionati."
        />
      )}
      {!isLoading && !isError && data && data.length > 0 && (
        <MineTables data={data} tracks={tracks} cars={cars} />
      )}
    </>
  );
}

function MineTables({ data, tracks, cars }) {
  const classified = data.filter(r => r.race_class);
  const unclassified = data.filter(r => !r.race_class);

  return (
    <>
      {classified.length > 0 && (
        <table className="laps-table">
          <thead>
            <tr>
              <th>Sim</th>
              <th>Tracciato</th>
              <th>Classe</th>
              <th>Auto</th>
              <th>Mio tempo</th>
              <th>Gap dal record team</th>
              <th>Trend</th>
            </tr>
          </thead>
          <tbody>
            {classified.map(rec => (
              <tr key={`${rec.sim}-${rec.track_id}-${rec.race_class}`}>
                <td><SimBadge sim={rec.sim} /></td>
                <td>{formatTrack(rec.track_id, tracks)}</td>
                <td>{rec.race_class}</td>
                <td>{formatCar(rec.car_id, cars)}</td>
                <td><LapTime ms={rec.lap_time_ms} /></td>
                <td>
                  {rec.is_record_holder ? (
                    <span className="lap-badge-record">★ RECORD</span>
                  ) : rec.gap_ms != null && rec.team_record_ms != null ? (
                    <span className="cell-gap">
                      {formatGapPercent(rec.lap_time_ms, rec.team_record_ms)}
                    </span>
                  ) : (
                    <span className="cell-gap">—</span>
                  )}
                </td>
                <td><Sparkline values={rec.lastLaps} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {unclassified.length > 0 && (
        <div className="section-unclassified">
          <div className="section-unclassified-title">
            Da classificare ({unclassified.length})
          </div>
          <table className="laps-table">
            <thead>
              <tr>
                <th>Sim</th>
                <th>Tracciato</th>
                <th>Auto</th>
                <th>Mio tempo</th>
                <th>Trend</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {unclassified.map(rec => (
                <tr key={`${rec.sim}-${rec.track_id}-${rec.car_id}-unclassified`}>
                  <td><SimBadge sim={rec.sim} /></td>
                  <td>{formatTrack(rec.track_id, tracks)}</td>
                  <td>{formatCar(rec.car_id, cars)}</td>
                  <td><LapTime ms={rec.lap_time_ms} /></td>
                  <td><Sparkline values={rec.lastLaps} color="var(--vsd-orange)" /></td>
                  <td>
                    <span className="lap-badge-unclassified">Race class non assegnata</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}


const SUBMISSION_STATUS_LABEL = {
  pending: { label: '⏳ In attesa di validazione', className: 'submit-lap-status-pending' },
  approved: { label: '✓ Approvato', className: 'submit-lap-status-approved' },
  rejected: { label: '✕ Rifiutato', className: 'submit-lap-status-rejected' },
};

const INITIAL_SUBMIT_FORM = {
  sim: 'LMU',
  track_id: '',
  car_id: '',
  lap_time_display: '',
  conditions: 'dry',
  air_temp_c: '',
  track_temp_c: '',
  session_type: 'practice',
  notes: '',
};

/**
 * SubmitLapSection — un pilota VSD invia un proprio tempo con foto di
 * prova (screenshot del tempo a fine giro). Resta 'pending' finché un
 * admin non lo valida (vedi coda in AdminBestLaps.jsx) — solo allora
 * finisce nella classifica ufficiale. La foto va caricata: non è un
 * campo opzionale, è la prova che rende il tempo verificabile.
 */
function SubmitLapSection() {
  const { token, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(INITIAL_SUBMIT_FORM);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const tracksQuery = useTracks(form.sim || undefined);
  const carsQuery = useCars(form.sim || undefined);
  const submissionsQuery = useMyLapSubmissions(open);
  const submitMutation = useSubmitLap();
  const removeMutation = useRemoveLapSubmission();

  function update(field, value) {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'sim') {
        next.track_id = '';
        next.car_id = '';
      }
      return next;
    });
  }

  function resetForm() {
    setForm(INITIAL_SUBMIT_FORM);
    setFile(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!form.track_id) return setError('Seleziona il tracciato');
    if (!form.car_id) return setError('Seleziona l\'auto');
    if (!/^\d+:\d{1,2}\.\d{1,3}$/.test(form.lap_time_display.trim())) {
      return setError('Tempo non valido. Formato atteso: M:SS.mmm (es. 1:30.333)');
    }
    if (!file) return setError('Carica una foto che documenti il tempo — è obbligatoria per la validazione');
    if (form.air_temp_c !== '' && Number.isNaN(Number(form.air_temp_c))) {
      return setError('Temperatura aria non valida');
    }
    if (form.track_temp_c !== '' && Number.isNaN(Number(form.track_temp_c))) {
      return setError('Temperatura pista non valida');
    }

    setUploading(true);
    try {
      const blob = await upload(file.name, file, {
        access: 'public',
        handleUploadUrl: '/api/media-upload',
        clientPayload: JSON.stringify({ token }),
      });

      await submitMutation.mutateAsync({
        sim: form.sim,
        track_id: form.track_id,
        car_id: form.car_id,
        lap_time_display: form.lap_time_display.trim(),
        conditions: form.conditions,
        air_temp_c: form.air_temp_c !== '' ? Number(form.air_temp_c) : '',
        track_temp_c: form.track_temp_c !== '' ? Number(form.track_temp_c) : '',
        session_type: form.session_type,
        notes: form.notes,
        evidence_url: blob.url,
      });

      setSuccess('Tempo inviato — in attesa di validazione da parte dello staff.');
      resetForm();
    } catch (err) {
      setError(err.message || 'Errore durante l\'invio');
    } finally {
      setUploading(false);
    }
  }

  const isPending = uploading || submitMutation.isPending;
  const submissions = submissionsQuery.data || [];

  return (
    <div className="submit-lap-section">
      <button
        type="button"
        className="submit-lap-toggle"
        onClick={() => setOpen(v => !v)}
      >
        {open ? '− Chiudi' : '+ Invia un nuovo tempo'}
      </button>

      {open && (
        <div className="submit-lap-body">
          <p className="submit-lap-hint">
            Il tempo resta in attesa finché non viene validato da un admin sulla base della
            foto inviata. La foto serve solo per la verifica: una volta approvato o rifiutato
            il tempo viene cancellata automaticamente.
          </p>

          <form onSubmit={handleSubmit} className="submit-lap-form">
            <div className="submit-lap-row">
              <div className="filter-group">
                <label className="filter-label">Sim</label>
                <select className="filter-select" value={form.sim}
                  onChange={e => update('sim', e.target.value)}>
                  {SIM_LIST.map(s => <option key={s.id} value={s.id}>{s.short || s.name || s.id}</option>)}
                </select>
              </div>

              <div className="filter-group">
                <label className="filter-label">Tracciato</label>
                <select className="filter-select" value={form.track_id}
                  onChange={e => update('track_id', e.target.value)}>
                  <option value="">— Seleziona —</option>
                  {(tracksQuery.data || []).map(t => (
                    <option key={t.track_id} value={t.track_id}>{t.track_name}</option>
                  ))}
                </select>
              </div>

              <div className="filter-group">
                <label className="filter-label">Auto</label>
                <select className="filter-select" value={form.car_id}
                  onChange={e => update('car_id', e.target.value)}>
                  <option value="">— Seleziona —</option>
                  {(carsQuery.data || []).map(c => (
                    <option key={c.car_id} value={c.car_id}>
                      {c.car_name || c.display_name || c.car_id}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="submit-lap-row">
              <div className="filter-group">
                <label className="filter-label">Tempo (M:SS.mmm)</label>
                <input type="text" className="filter-select" value={form.lap_time_display}
                  onChange={e => update('lap_time_display', e.target.value)}
                  placeholder="1:30.333" />
              </div>

              <div className="filter-group">
                <label className="filter-label">Condizioni</label>
                <select className="filter-select" value={form.conditions}
                  onChange={e => update('conditions', e.target.value)}>
                  <option value="dry">Dry</option>
                  <option value="wet">Wet</option>
                </select>
              </div>

              <div className="filter-group">
                <label className="filter-label">Sessione</label>
                <select className="filter-select" value={form.session_type}
                  onChange={e => update('session_type', e.target.value)}>
                  <option value="practice">Practice</option>
                  <option value="qualifying">Qualifying</option>
                  <option value="race">Race</option>
                  <option value="time_trial">Time trial</option>
                </select>
              </div>
            </div>

            <div className="submit-lap-row">
              <div className="filter-group">
                <label className="filter-label">Temp. aria °C (facoltativo)</label>
                <input type="number" step="0.1" className="filter-select" value={form.air_temp_c}
                  onChange={e => update('air_temp_c', e.target.value)}
                  placeholder="es. 22" />
              </div>

              <div className="filter-group">
                <label className="filter-label">Temp. pista °C (facoltativo)</label>
                <input type="number" step="0.1" className="filter-select" value={form.track_temp_c}
                  onChange={e => update('track_temp_c', e.target.value)}
                  placeholder="es. 28" />
              </div>
            </div>

            <div className="filter-group">
              <label className="filter-label">Foto di prova (obbligatoria)</label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={e => setFile(e.target.files?.[0] || null)}
              />
              {file && <div className="submit-lap-filename">📎 {file.name}</div>}
            </div>

            <button type="submit" className="reset-btn submit-lap-btn" disabled={isPending}>
              {isPending ? 'Invio…' : 'Invia per validazione'}
            </button>

            {error && <div className="submit-lap-error">❌ {error}</div>}
            {success && <div className="submit-lap-success">✓ {success}</div>}
          </form>

          {submissions.length > 0 && (
            <div className="submit-lap-history">
              <div className="submit-lap-history-title">Le tue richieste</div>
              {removeMutation.isError && (
                <div className="submit-lap-error">
                  Errore rimozione: {removeMutation.error?.message}
                </div>
              )}
              {submissions.map(s => {
                const status = SUBMISSION_STATUS_LABEL[s.status] || SUBMISSION_STATUS_LABEL.pending;
                return (
                  <div key={s.submission_id} className="submit-lap-history-row">
                    <span>{s.sim} · {s.track_id} · {s.lap_time_display}</span>
                    <span className={status.className}>{status.label}</span>
                    {isAdmin && (
                      <button
                        type="button"
                        className="submit-lap-history-remove"
                        title="Rimuovi dallo storico (solo admin)"
                        disabled={removeMutation.isPending}
                        onClick={() => {
                          if (window.confirm('Rimuovere questa richiesta dallo storico?')) {
                            removeMutation.mutate(s.submission_id);
                          }
                        }}
                      >
                        🗑
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Prompt({ icon, title, text }) {
  return (
    <div className="leaderboard-prompt">
      {icon && <div className="leaderboard-prompt-icon">{icon}</div>}
      {title && <div className="leaderboard-prompt-title">{title}</div>}
      {text && <div className="leaderboard-prompt-text">{text}</div>}
    </div>
  );
}