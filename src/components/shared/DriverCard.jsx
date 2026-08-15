import { Link } from 'react-router-dom';
import Avatar from './Avatar';
import SimBadge from './SimBadge';
import StatusDot from './StatusDot';
import { useConsentedDriverPhoto } from '../../hooks/useConsent';
import { ROLES } from '../../utils/constants';
import './DriverCard.css';

/**
 * Card pilota riutilizzabile per liste/griglie.
 * - driver: oggetto pilota completo
 * - compact: layout più stretto (per sidebar/sezioni minori)
 *
 * Foto reale al posto delle iniziali SOLO se il pilota ha dato
 * consenso social (useConsentedDriverPhoto — pubblico, funziona anche
 * per visitatori anonimi, esattamente il pubblico di questa pagina).
 */
export default function DriverCard({ driver, compact = false, online }) {
  const photoUrl = useConsentedDriverPhoto(driver?.driver_id);
  if (!driver) return null;

  const sims = (driver.preferred_sims || '').split(',').filter(Boolean);
  const specs = (driver.specialties || '').split(',').filter(Boolean).slice(0, 3);
  const isStaff = driver.role === ROLES.STAFF || driver.role === ROLES.ADMIN;
  const isEx = !!driver.is_ex_vsd;

  return (
    <Link
      to={`/roster/${driver.driver_id}`}
      className={`driver-card${compact ? ' driver-card-compact' : ''}${isEx ? ' is-ex' : ''}`}
    >
      <div className="driver-card-top">
        <Avatar
          name={driver.display_name}
          driverId={driver.driver_id}
          size={compact ? 44 : 56}
          photoUrl={photoUrl}
        />
        <div className="driver-card-id-block">
          <div className="driver-card-id">
            {driver.race_number != null && driver.race_number !== ''
              ? `#${driver.race_number}`
              : driver.driver_id}
          </div>
          {isEx
            ? (
              <div className="driver-ex-block">
                <span className="driver-ex-badge">EX VSD</span>
                {driver.removed_at && (
                  <span className="driver-ex-date">
                    {new Date(driver.removed_at).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </span>
                )}
              </div>
            )
            : <StatusDot status={driver.status} online={online} />
          }
        </div>
      </div>

      <div className="driver-card-name">{driver.display_name}</div>

      {isStaff && !isEx && (
        <div className="driver-card-role">
          {driver.role === ROLES.ADMIN ? 'TEAM PRINCIPAL' : 'STAFF'}
        </div>
      )}

      <div className="driver-card-sims">
        {sims.map(s => <SimBadge key={s} sim={s.trim()} size="sm" />)}
      </div>

      {specs.length > 0 && (
        <div className="driver-card-specs">
          {specs.map(s => (
            <span key={s} className="driver-card-spec">{s.trim()}</span>
          ))}
        </div>
      )}
    </Link>
  );
}