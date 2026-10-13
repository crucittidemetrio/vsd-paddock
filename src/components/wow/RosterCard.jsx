import DriverCard from './DriverCard';
import SimBadge from '../shared/SimBadge';
import StatusDot from '../shared/StatusDot';
import { useConsentedDriverPhoto } from '../../hooks/useConsent';
import { ROLES } from '../../utils/constants';

// Card "da collezione" per la griglia del Roster (13/10/2026): stessa card
// del profilo pilota, con dentro tutto ciò che mostrava la vecchia card
// (ruolo, percorso Competitivo/Amatoriale, sim, specialità, stato/presenza,
// EX VSD). Elo/Safety e gare/vittorie/podi arrivano solo se la pagina li
// ha (dati riservati ai piloti): per i visitatori le caselle non compaiono.
export default function RosterCard({ driver, online, stats }) {
  const photoUrl = useConsentedDriverPhoto(driver?.driver_id);
  if (!driver) return null;

  const sims = String(driver.preferred_sims || '').split(',').map(s => s.trim()).filter(Boolean);
  const specs = String(driver.specialties || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 3);
  const isEx = !!driver.is_ex_vsd;
  const isStaff = !isEx && (driver.role === ROLES.STAFF || driver.role === ROLES.ADMIN);
  const meta = isStaff ? (driver.role === ROLES.ADMIN ? 'TEAM PRINCIPAL' : 'STAFF') : null;
  const number = driver.race_number != null && driver.race_number !== '' ? driver.race_number : null;

  return (
    <DriverCard
      size="grid"
      to={`/roster/${driver.driver_id}`}
      name={driver.display_name}
      photoUrl={photoUrl}
      number={number}
      elo={isEx ? undefined : stats?.elo}
      safety={isEx ? undefined : stats?.safety}
      races={stats?.races}
      wins={stats?.wins}
      podiums={stats?.podiums}
      meta={meta}
      muted={isEx}
      status={isEx ? null : <StatusDot status={driver.status} online={online} />}
    >
      {(isEx || driver.roster_track) && (
        <div className="dcard-chips">
          {isEx ? (
            <span className="dcard-chip dcard-chip-ex">
              EX VSD
              {driver.removed_at && ` · ${new Date(driver.removed_at).toLocaleDateString('it-IT', { month: '2-digit', year: 'numeric' })}`}
            </span>
          ) : (
            <span className={`dcard-chip dcard-chip-${driver.roster_track}`}>
              {driver.roster_track === 'competitivo' ? '🏆 Competitivo' : '🎮 Amatoriale'}
            </span>
          )}
        </div>
      )}
      {sims.length > 0 && (
        <div className="dcard-chips">
          {sims.map(s => <SimBadge key={s} sim={s} size="sm" />)}
        </div>
      )}
      {specs.length > 0 && (
        <div className="dcard-chips">
          {specs.map(s => <span key={s} className="dcard-chip">{s}</span>)}
        </div>
      )}
    </DriverCard>
  );
}
