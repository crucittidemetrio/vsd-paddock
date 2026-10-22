import { useState, useMemo, useEffect, useRef, Fragment } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useReports, useRaces, useUpdateReport, useSubmitOwnReport } from '../hooks/useRaces';
import { useDrivers } from '../hooks/useRoster';
import { useAuth } from '../hooks/useAuth';
import { useBlobUpload } from '../hooks/useBlobUpload';
import { useNow } from '../hooks/useNow';
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

// Limiti allineati a reports.submitOwn (cloud/functions/social-manager).
const SUMMARY_MIN = 20;
const SUMMARY_MAX = 1500;
const KEY_MOMENT_MAX = 300;
const MEDIA_MAX = 4;

// Finestra in cui una gara è proponibile al pilota per il report.
const PENDING_WINDOW_DAYS = 60;
const OTHER_RACES_WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;

function raceTitle(race, fallback = '') {
  return race?.race_name || race?.title || fallback;
}

function raceTime(race) {
  const t = race?.date ? new Date(race.date).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
}

// Arrivo null (DNF o risultati non importati) in fondo, non in testa.
function byFinish(a, b) {
  const fa = a.finish_position ?? Infinity;
  const fb = b.finish_position ?? Infinity;
  return fa - fb;
}

function positionDelta(report) {
  if (report.grid_position == null || report.finish_position == null) return 0;
  return report.grid_position - report.finish_position;
}

function clip(text, max) {
  if (!text) return '';
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

export default function Reports() {
  const [view, setView] = useState('by-race');
  const [driverFilter, setDriverFilter] = useState('all');
  const [searchParams, setSearchParams] = useSearchParams();
  const raceParam = searchParams.get('race') || '';
  const { isStaff, isVsdPilot, driver: myDriver } = useAuth();

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
      if (raceParam && r.race_id !== raceParam) return false;
      return true;
    });
  }, [reports, driverFilter, raceParam]);

  // Raggruppa per gara
  const grouped = useMemo(() => {
    const groups = {};
    filtered.forEach(r => {
      if (!groups[r.race_id]) groups[r.race_id] = [];
      groups[r.race_id].push(r);
    });
    Object.values(groups).forEach(arr => arr.sort(byFinish));
    return Object.entries(groups)
      .map(([race_id, rows]) => ({ race: raceMap[race_id], race_id, rows }))
      .sort((a, b) => raceTime(b.race) - raceTime(a.race));
  }, [filtered, raceMap]);

  const myCode = myDriver?.driver_id || null;
  const canSubmit = isVsdPilot && !!myCode;

  function clearRaceFilter() {
    const next = new URLSearchParams(searchParams);
    next.delete('race');
    setSearchParams(next, { replace: true });
  }

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

      {canSubmit && (
        <MyReportSection
          key={raceParam || 'default'}
          reports={reports || []}
          races={races || []}
          raceMap={raceMap}
          myCode={myCode}
          initialRaceId={raceParam}
        />
      )}

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

        {raceParam && (
          <button type="button" className="rc-edit-toggle-btn" onClick={clearRaceFilter}>
            Mostra tutte le gare
          </button>
        )}
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
            {driverFilter !== 'all' || raceParam ? 'Cambia filtro.' : 'I report appariranno qui dopo le gare.'}
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
            .sort((a, b) => new Date(b.submitted_at || b.created_at) - new Date(a.submitted_at || a.created_at))
            .map(r => (
              <ReportCard
                key={r.report_id}
                report={r}
                race={raceMap[r.race_id]}
                driver={driverMap[r.driver_id]}
                isStaff={isStaff}
                reactions={reactionsByReport[r.report_id] || []}
                myDriverId={myCode}
              />
            ))
          }
        </div>
      )}
    </div>
  );
}

// =====================================================
// IL TUO REPORT — il pilota completa il proprio report
// (22/10/2026, sostituisce il Google Form "Report Gara Piloti").
// Mostra le gare con report ancora da compilare e, sotto, le gare
// recenti per cui l'import risultati non ha ancora creato il report.
// =====================================================
function MyReportSection({ reports, races, raceMap, myCode, initialRaceId }) {
  const sectionRef = useRef(null);
  const now = useNow(3_600_000); // basta un tick all'ora: serve solo per la finestra delle gare recenti

  const myReports = useMemo(
    () => reports.filter(r => r.driver_id === myCode),
    [reports, myCode]
  );

  const pending = useMemo(() => {
    return myReports
      .filter(r => !r.submitted_at && raceMap[r.race_id])
      .filter(r => now - raceTime(raceMap[r.race_id]) <= PENDING_WINDOW_DAYS * DAY_MS)
      .sort((a, b) => raceTime(raceMap[b.race_id]) - raceTime(raceMap[a.race_id]));
  }, [myReports, raceMap, now]);

  const otherRaces = useMemo(() => {
    const mine = new Set(myReports.map(r => r.race_id));
    return races
      .filter(r => r.status !== 'cancelled' && !mine.has(r.race_id))
      .filter(r => {
        const t = raceTime(r);
        return t > 0 && t <= now && now - t <= OTHER_RACES_WINDOW_DAYS * DAY_MS;
      })
      .sort((a, b) => raceTime(b) - raceTime(a));
  }, [races, myReports, now]);

  const submittedForParam = initialRaceId
    ? myReports.find(r => r.race_id === initialRaceId && r.submitted_at)
    : null;

  // Link diretto (?race=…) da Discord/annunci: preseleziona la gara e
  // porta il form in vista, anche se il report era già stato inviato.
  // Il componente è montato con key={raceParam}: un nuovo link rimonta
  // e reinizializza la selezione, niente setState dentro l'effect.
  const [selectedRaceId, setSelectedRaceId] = useState(initialRaceId || '');
  const [doneRaceId, setDoneRaceId] = useState('');

  useEffect(() => {
    if (!initialRaceId) return;
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [initialRaceId]);

  const options = useMemo(() => {
    const list = pending.map(r => ({ race_id: r.race_id, label: raceTitle(raceMap[r.race_id], r.race_id), race: raceMap[r.race_id] }));
    otherRaces.forEach(r => list.push({ race_id: r.race_id, label: raceTitle(r, r.race_id), race: r }));
    if (initialRaceId && !list.some(o => o.race_id === initialRaceId) && raceMap[initialRaceId]) {
      list.unshift({ race_id: initialRaceId, label: raceTitle(raceMap[initialRaceId], initialRaceId), race: raceMap[initialRaceId] });
    }
    return list;
  }, [pending, otherRaces, raceMap, initialRaceId]);

  const activeRaceId = selectedRaceId || options[0]?.race_id || '';
  const existing = myReports.find(r => r.race_id === activeRaceId) || null;

  if (options.length === 0 && !doneRaceId) {
    return (
      <section className="my-report" ref={sectionRef}>
        <div className="my-report-head">
          <div className="my-report-title">Il tuo report</div>
          <div className="my-report-sub">Nessuna gara da raccontare negli ultimi {OTHER_RACES_WINDOW_DAYS} giorni.</div>
        </div>
      </section>
    );
  }

  return (
    <section className="my-report" ref={sectionRef}>
      <div className="my-report-head">
        <div className="my-report-title">Il tuo report</div>
        <div className="my-report-sub">
          {pending.length > 0
            ? `${pending.length} ${pending.length === 1 ? 'gara aspetta' : 'gare aspettano'} il tuo racconto. Senza report il post non esce.`
            : 'Racconta la tua gara: bastano 30 secondi. Senza report il post non esce.'}
        </div>
      </div>

      {doneRaceId && (
        <div className="my-report-done">
          ✅ Report inviato per <strong>{raceTitle(raceMap[doneRaceId], doneRaceId)}</strong>. Lo staff è stato avvisato.
        </div>
      )}

      {options.length > 0 && (
        <>
          <div className="rc-edit-field">
            <label className="rc-edit-label" htmlFor="my-report-race">Gara</label>
            <select
              id="my-report-race"
              className="filter-select"
              value={activeRaceId}
              onChange={e => { setSelectedRaceId(e.target.value); setDoneRaceId(''); }}
            >
              {pending.length > 0 && (
                <optgroup label="Report da completare">
                  {options.filter(o => pending.some(p => p.race_id === o.race_id)).map(o => (
                    <option key={o.race_id} value={o.race_id}>
                      {o.label}{o.race?.date ? ` — ${formatDate(o.race.date)}` : ''}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label={pending.length > 0 ? 'Altre gare recenti' : 'Gare recenti'}>
                {options.filter(o => !pending.some(p => p.race_id === o.race_id)).map(o => (
                  <option key={o.race_id} value={o.race_id}>
                    {o.label}{o.race?.date ? ` — ${formatDate(o.race.date)}` : ''}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {submittedForParam && submittedForParam.race_id === activeRaceId && (
            <div className="my-report-note">Hai già inviato questo report: puoi correggerlo e salvarlo di nuovo.</div>
          )}

          <DriverReportForm
            key={activeRaceId}
            raceId={activeRaceId}
            existing={existing}
            myCode={myCode}
            onSubmitted={() => { setDoneRaceId(activeRaceId); setSelectedRaceId(''); }}
          />
        </>
      )}
    </section>
  );
}

// =====================================================
// DRIVER REPORT FORM — racconto, momento chiave, foto, ok social.
// Usato in "Il tuo report" e per correggere un proprio report già
// inviato dalla vista cronologica.
// =====================================================
function DriverReportForm({ raceId, existing, myCode, onSubmitted, onCancel }) {
  const mutation = useSubmitOwnReport();
  const { uploadFiles, uploading, progress, error: uploadError, setError: setUploadError } = useBlobUpload();
  const { data: socialFlagsData } = useConsentSocialFlags();
  const hasSocialConsent = !!socialFlagsData?.flags?.[myCode];

  const [summary, setSummary] = useState(existing?.driver_summary || '');
  const [keyMoment, setKeyMoment] = useState(existing?.key_moment || '');
  const [mediaUrls, setMediaUrls] = useState(existing?.media_urls || []);
  const [socialOk, setSocialOk] = useState(existing?.social_ok ?? true);
  const fileInputRef = useRef(null);

  const trimmedLen = summary.trim().length;
  const tooShort = trimmedLen < SUMMARY_MIN;
  const busy = mutation.isPending || uploading;

  async function handleFiles(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    const room = MEDIA_MAX - mediaUrls.length;
    if (room <= 0) {
      setUploadError(`Massimo ${MEDIA_MAX} foto`);
      return;
    }
    try {
      const uploaded = await uploadFiles(files.slice(0, room));
      setMediaUrls(prev => [...prev, ...uploaded.map(u => u.url)].slice(0, MEDIA_MAX));
    } catch {
      // errore già esposto da useBlobUpload
    }
  }

  function removeMedia(url) {
    setMediaUrls(prev => prev.filter(u => u !== url));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (tooShort || busy) return;
    mutation.mutate(
      {
        race_id: raceId,
        driver_summary: summary.trim(),
        key_moment: keyMoment.trim(),
        media_urls: mediaUrls,
        social_ok: socialOk,
      },
      { onSuccess: () => onSubmitted?.() }
    );
  }

  return (
    <form className="rc-edit my-report-form" onSubmit={handleSubmit}>
      <div className="rc-edit-field">
        <label className="rc-edit-label" htmlFor={`summary-${raceId}`}>
          Com'è andata *
        </label>
        <textarea
          id={`summary-${raceId}`}
          className="rc-edit-textarea"
          rows={4}
          maxLength={SUMMARY_MAX}
          value={summary}
          onChange={e => setSummary(e.target.value)}
          placeholder="Partenza, sorpassi, strategia, errori, come hai chiuso. Scrivi come lo racconteresti a un compagno di squadra."
        />
        <div className={`my-report-counter${tooShort && trimmedLen > 0 ? ' is-warn' : ''}`}>
          {tooShort ? `Almeno ${SUMMARY_MIN} caratteri (${trimmedLen}/${SUMMARY_MIN})` : `${summary.length}/${SUMMARY_MAX}`}
        </div>
      </div>

      <div className="rc-edit-field">
        <label className="rc-edit-label" htmlFor={`moment-${raceId}`}>Momento chiave</label>
        <input
          id={`moment-${raceId}`}
          className="rc-edit-textarea"
          type="text"
          maxLength={KEY_MOMENT_MAX}
          value={keyMoment}
          onChange={e => setKeyMoment(e.target.value)}
          placeholder="Una riga: il sorpasso, il pit perfetto, il contatto al giro 12…"
        />
      </div>

      <div className="rc-edit-field">
        <span className="rc-edit-label">Foto o screenshot ({mediaUrls.length}/{MEDIA_MAX})</span>
        <div className="my-report-media">
          {mediaUrls.map(url => (
            <div key={url} className="my-report-thumb">
              <img src={url} alt="" loading="lazy" />
              <button type="button" className="my-report-thumb-remove" onClick={() => removeMedia(url)} aria-label="Rimuovi foto" disabled={busy}>
                ×
              </button>
            </div>
          ))}
          {mediaUrls.length < MEDIA_MAX && (
            <button
              type="button"
              className="my-report-add-media"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
            >
              {uploading ? 'Caricamento…' : '+ Aggiungi'}
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            hidden
            onChange={handleFiles}
          />
        </div>
        {progress && <div className="my-report-counter">{progress}</div>}
        {uploadError && <div className="rc-edit-error">{uploadError}</div>}
        <div className="my-report-hint">Un fermo immagine dell'auto in pista vale più di dieci righe: è quello che serve per il post.</div>
      </div>

      <label className="my-report-check">
        <input type="checkbox" checked={socialOk} onChange={e => setSocialOk(e.target.checked)} />
        <span>Ok a usare racconto e foto sui social VSD</span>
      </label>
      {socialOk && !hasSocialConsent && (
        <div className="my-report-hint is-warn">
          Non hai ancora dato il consenso social: senza quello useremo il report solo internamente.{' '}
          <Link to="/consenso">Compila il consenso dati</Link>
        </div>
      )}

      {mutation.isError && (
        <div className="rc-edit-error">Errore: {mutation.error?.message || 'invio fallito'}</div>
      )}

      <div className="rc-edit-actions">
        {onCancel && (
          <button type="button" className="rc-edit-cancel-btn" onClick={onCancel} disabled={busy}>
            Annulla
          </button>
        )}
        <button type="submit" className="rc-edit-save-btn" disabled={busy || tooShort}>
          {mutation.isPending ? 'Invio…' : existing?.submitted_at ? 'Salva modifiche' : 'Invia report'}
        </button>
      </div>
    </form>
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
  const podiums = rows.filter(r => r.finish_position != null && r.finish_position <= 3).length;
  const submitted = rows.filter(r => r.submitted_at).length;
  const columnCount = isStaff ? 8 : 6;

  return (
    <section className="race-group">
      <div className="race-group-head">
        <div className="rg-context">
          <SimBadge sim={race.sim} variant="solid" size="sm" />
          <div className="rg-titles">
            <div className="rg-title">{raceTitle(race, race.race_id)}</div>
            <div className="rg-meta">
              {formatTrack(race.track_id)} · {formatDate(race.date)} · {rows.length} report
              {` · ${submitted}/${rows.length} raccontati`}
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
              <th>Racconto</th>
              {isStaff && <th className="num">Rating</th>}
              {isStaff && <th className="num">Azioni</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const d = driverMap[r.driver_id];
              const delta = positionDelta(r);
              const isPodium = r.finish_position != null && r.finish_position <= 3;
              const isEditing = editingId === r.report_id;
              const story = r.driver_summary || r.strategy_notes;
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
                    <td className="num">{r.grid_position ?? '—'}</td>
                    <td className="num">
                      {r.finish_position != null ? (
                        <span className={`finish-pos${isPodium ? ' is-podium' : ''}`}>
                          P{r.finish_position}
                        </span>
                      ) : (
                        <span className="finish-pos">—</span>
                      )}
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
                        {r.incidents ?? '—'}
                      </span>
                    </td>
                    <td className="cell-notes">
                      {story ? clip(story, 140) : <span className="rc-missing">da compilare</span>}
                      {r.media_urls?.length > 0 && <span className="rc-media-count"> · 📷 {r.media_urls.length}</span>}
                    </td>
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
                      <td colSpan={columnCount}>
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
  const [isEditingOwn, setIsEditingOwn] = useState(false);
  if (!race || !driver) return null;
  const delta = positionDelta(report);
  const isPodium = report.finish_position != null && report.finish_position <= 3;
  const isMine = !!myDriverId && report.driver_id === myDriverId;

  return (
    <div className="report-card">
      <div className="rc-head">
        <Link to={`/roster/${driver.driver_id}`} className="driver-link">
          <Avatar name={driver.display_name} driverId={driver.driver_id} size={40} ring={isPodium} photoUrl={photoUrl} />
          <div className="rc-driver-block">
            <div className="rc-driver-name">{driver.display_name}</div>
            <div className="rc-race-context">
              <SimBadge sim={race.sim} size="sm" />
              <span className="rc-race-title">{raceTitle(race, race.race_id)}</span>
            </div>
          </div>
        </Link>
        <div className="rc-finish">
          <div className="rc-finish-row">
            <span className={`finish-pos rc-pos${isPodium ? ' is-podium' : ''}`}>
              {report.finish_position != null ? `P${report.finish_position}` : '—'}
            </span>
            {delta !== 0 && (
              <span className={`pos-delta${delta > 0 ? ' is-gain' : ' is-loss'}`}>
                {delta > 0 ? `+${delta}` : delta}
              </span>
            )}
          </div>
          {report.grid_position != null && <div className="rc-grid">da P{report.grid_position}</div>}
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
            {report.incidents ?? '—'}
          </span>
        } />
        {isStaff && <RcStat label="Rating Staff" value={<RatingStars value={report.staff_rating} />} />}
        {isStaff && report.submitted_at && (
          <RcStat label="Social" value={<span className="cell-date">{report.social_ok ? '✅ ok' : '⛔ interno'}</span>} />
        )}
        <RcStat label="Data" value={<span className="cell-date">{formatDate(race.date || report.created_at)}</span>} />
      </div>

      {(report.driver_summary || report.key_moment) && !isEditingOwn && (
        <div className="rc-notes">
          {report.driver_summary && (
            <div className="rc-note-block">
              <div className="rc-note-label">Racconto del pilota</div>
              <div className="rc-note-text rc-note-text-pre">{report.driver_summary}</div>
            </div>
          )}
          {report.key_moment && (
            <div className="rc-note-block">
              <div className="rc-note-label">Momento chiave</div>
              <div className="rc-note-text">{report.key_moment}</div>
            </div>
          )}
        </div>
      )}

      {report.media_urls?.length > 0 && !isEditingOwn && (
        <div className="rc-media">
          {report.media_urls.map(url => (
            <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="rc-media-item">
              <img src={url} alt="" loading="lazy" />
            </a>
          ))}
        </div>
      )}

      {isMine && !isEditingOwn && (
        <button type="button" className="rc-edit-toggle-btn rc-edit-toggle-btn-card" onClick={() => setIsEditingOwn(true)}>
          {report.submitted_at ? 'Modifica il mio racconto' : 'Racconta la tua gara'}
        </button>
      )}
      {isMine && isEditingOwn && (
        <DriverReportForm
          raceId={report.race_id}
          existing={report}
          myCode={myDriverId}
          onSubmitted={() => setIsEditingOwn(false)}
          onCancel={() => setIsEditingOwn(false)}
        />
      )}

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
      {report.driver_summary && (
        <div className="rc-edit-field">
          <span className="rc-edit-label">Racconto del pilota (lo modifica solo il pilota)</span>
          <div className="rc-note-text rc-note-text-pre">{report.driver_summary}</div>
        </div>
      )}
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
