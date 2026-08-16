import { Link } from 'react-router-dom';
import SimBadge from '../shared/SimBadge';
import CountdownLive from '../shared/CountdownLive';
import { formatTrack, formatRaceDateTime } from '../../utils/format';
import './NextRaceHero.css';

/**
 * NextRaceHero — hero scenico per la prossima gara in calendario, sostituisce
 * la vecchia mini-card sulla Landing pubblica. Foto cinematica di sfondo
 * (stesso trattamento fotografico dell'hero principale), countdown live al
 * secondo (CountdownLive, già usato nella dashboard privata).
 *
 * @param {Object} race - oggetto race da races.list/upcoming (race_name, sim,
 *   track_id, date, round, championship_name, race_id)
 * @param {Array} tracks - lista tracks per formatTrack()
 */
export default function NextRaceHero({ race, tracks }) {
  if (!race) return null;

  return (
    <section className="nrh">
      <div className="nrh-bg" aria-hidden="true" />
      <div className="nrh-overlay" aria-hidden="true" />
      <div className="nrh-content">
        <div className="nrh-eyebrow">Prossima gara</div>

        <div className="nrh-meta">
          <SimBadge sim={race.sim} variant="solid" />
          {race.round > 0 && <span className="nrh-round">Round {race.round}</span>}
          {race.championship_name && (
            <span className="nrh-champ">{race.championship_name}</span>
          )}
        </div>

        <h2 className="nrh-title">{race.race_name}</h2>
        <div className="nrh-track">{formatTrack(race.track_id, tracks)}</div>

        <div className="nrh-countdown">
          <CountdownLive targetIso={race.date} size="lg" />
        </div>

        <div className="nrh-footer">
          <span className="nrh-datetime">{formatRaceDateTime(race.date)}</span>
          <Link to="/calendar" className="nrh-cta">
            Calendario completo →
          </Link>
        </div>
      </div>
    </section>
  );
}
