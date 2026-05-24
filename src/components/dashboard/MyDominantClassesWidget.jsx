import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useMyDominantClasses } from '../../hooks/useBestLaps';
import { useTracks } from '../../hooks/useLookups';
import { formatTrack } from '../../utils/format';
import SimBadge from '../shared/SimBadge';
import LapTime from '../shared/LapTime';
import './MyDominantClassesWidget.css';

const VISIBLE_LIMIT = 5;

/**
 * Widget "classi dominanti" — combo dove il pilota è team record holder.
 * @param {Object} props
 * @param {string} [props.driverId] - Se omesso, usa il pilota loggato.
 */
export default function MyDominantClassesWidget({ driverId: driverIdProp } = {}) {
  const { driver } = useAuth();
  const driverId = driverIdProp || driver?.driver_id;
  const isOwn = !driverIdProp || driverIdProp === driver?.driver_id;
  const navigate = useNavigate();

  const { data: records, isLoading } = useMyDominantClasses(driverId);
  const { data: tracks = [] } = useTracks();

  if (isLoading) return null;
  if (!records || records.length === 0) return null;

  const visible = records.slice(0, VISIBLE_LIMIT);
  const overflow = records.length - VISIBLE_LIMIT;

  const goToDrilldown = (rec) => {
    const sim = String(rec.sim).toLowerCase();
    const track = String(rec.track_id).toLowerCase();
    const category = String(rec.race_class).toLowerCase();
    navigate(`/laps/${sim}/${track}/${category}`);
  };

  return (
    // FISSARE QUI: Aggiunto il tag d'apertura <section className="..."> coerente con il </section> finale
    <section className="mc-dominant-widget"> 
      <div className="mc-section-head">
        <div className="mc-section-eyebrow">
          {isOwn ? 'LE TUE CLASSI DOMINANTI' : 'CLASSI DOMINANTI'}
        </div>
        <span className="mc-section-link">{records.length} record team</span>
      </div>

      <ul className="mc-dominant-list">
        {visible.map(rec => (
          <li
            key={`${rec.sim}__${rec.track_id}__${rec.race_class}`}
            className="mc-dominant-item"
            onClick={() => goToDrilldown(rec)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                goToDrilldown(rec);
              }
            }}
            tabIndex={0}
            role="button"
            aria-label={`Apri drilldown ${rec.sim} ${formatTrack(rec.track_id, tracks)} ${rec.race_class}`}
          >
            <span className="mc-dominant-trophy" aria-hidden="true">🏆</span>
            <div className="mc-dominant-info">
              <div className="mc-dominant-line1">
                <SimBadge sim={rec.sim} size="sm" />
                <span className="mc-dominant-track">
                  {formatTrack(rec.track_id, tracks)}
                </span>
                <span className="mc-dominant-class">{rec.race_class}</span>
              </div>
            </div>
            <div className="mc-dominant-time">
              <LapTime ms={rec.lap_time_ms} size="md" emphasis="best" />
            </div>
          </li>
        ))}
      </ul>

      {overflow > 0 && (
        <div className="mc-dominant-more">
          <button
            type="button"
            className="mc-dominant-more-btn"
            onClick={() => navigate('/laps')}
          >
            + altri {overflow} → vai a Best Laps
          </button>
        </div>
      )}
    </section>
  );
}