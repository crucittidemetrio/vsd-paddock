import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useDrivers } from '../hooks/useRoster';
import { useRaces } from '../hooks/useRaces';
import { useRecentTeamRaceResults } from '../hooks/useRaceResults';
import { useTracks } from '../hooks/useLookups';
import { useBestLaps } from '../hooks/useBestLaps';
import { useTeamRecords } from '../hooks/useTeamRecords';
import Logo from '../components/shared/Logo';
import Avatar from '../components/shared/Avatar';
import SimBadge from '../components/shared/SimBadge';
import LapTime from '../components/shared/LapTime';
import TrackPhotoBackdrop from '../components/shared/TrackPhotoBackdrop';
import NextRaceHero from '../components/landing/NextRaceHero';
import { useConsentSocialFlags } from '../hooks/useConsent';
import SiteFooter from '../components/shared/SiteFooter';
import { resolvePhotoUrl } from '../utils/driverPhotos';
import { formatDate, formatTrack } from '../utils/format';
import { SOCIAL_LINKS, PILOT_OF_MONTH } from '../utils/constants';
import styles from './LandingPublic.module.css';

const DISCORD_INVITE = SOCIAL_LINKS.DISCORD;
const INSTAGRAM_URL = SOCIAL_LINKS.INSTAGRAM;
const FACEBOOK_URL = SOCIAL_LINKS.FACEBOOK;

function getNextRace(races) {
  if (!races || !races.length) return null;
  const now = new Date();
  const upcoming = races
    .filter(r => {
      if (r.status === 'cancelled') return false;
      const d = new Date(r.date);
      return !isNaN(d.getTime()) && d > now;
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  return upcoming[0] || null;
}

function getRecentPodiums(raceResults, limit = 5) {
  return raceResults
    .filter(r => {
      if (!r.is_vsd_driver) return false;
      if (r.dns || r.dnf) return false;
      if (r.finish_position == null || r.finish_position > 3) return false;
      return String(r.session_type || 'race').toLowerCase() === 'race';
    })
    .sort((a, b) => new Date(b.set_date) - new Date(a.set_date))
    .slice(0, limit);
}

export default function LandingPublic() {
  const { data: drivers, isLoading: driversLoading } = useDrivers();
  const { data: races, isLoading: racesLoading } = useRaces();
  const { data: raceResultsData } = useRecentTeamRaceResults(200);
  const { data: tracks = [] } = useTracks();
  const { data: socialFlagsData } = useConsentSocialFlags();
  // Solo per il banner statistiche in hero — numeri aggregati come primo
  // colpo d'occhio "il team è vivo e attivo" per un visitatore che non
  // si è mai loggato, ispirato alla home di togamotorsport.co.uk.
  const { data: allLaps } = useBestLaps();
  // Teaser "Record di pista" — solo una manciata di righe, il Muro dei Record
  // completo resta dietro login (RequireTier minTier="pilot_vsd" su /records):
  // qui vogliamo dare un assaggio che fa venire voglia di entrare, non
  // duplicare l'intera pagina interattiva.
  const { data: teamRecordsData } = useTeamRecords();
  const socialFlags = socialFlagsData?.flags || {};
  const raceResults = raceResultsData?.results || [];

  const activeRoster = useMemo(
    () => (drivers || []).filter(d => String(d.status || '').toLowerCase() === 'active'),
    [drivers]
  );

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

  const pilotOfMonth = useMemo(() => {
    if (!PILOT_OF_MONTH?.driverId) return null;
    return driverMap[PILOT_OF_MONTH.driverId] || null;
  }, [driverMap]);

  const nextRace = useMemo(() => getNextRace(races), [races]);
  const recentPodiums = useMemo(() => getRecentPodiums(raceResults, 5), [raceResults]);

  const recordsTeaser = useMemo(() => {
    const list = teamRecordsData?.records || [];
    return [...list]
      .sort((a, b) => formatTrack(a.track_id, tracks).localeCompare(formatTrack(b.track_id, tracks)))
      .slice(0, 6);
  }, [teamRecordsData, tracks]);

  const completedRaces = useMemo(
    () => (races || []).filter(r => String(r.status || '').toLowerCase() === 'completed').length,
    [races]
  );

  if (driversLoading || racesLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>Caricamento…</div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* ════ HERO ════ */}
      <section className={styles.hero}>
        <TrackPhotoBackdrop />
        <div className={styles.heroContent}>
          <div className={styles.heroLogo}>
            <Logo size={180} withWordmark glow />
          </div>
          <h1 className={styles.heroTitle}>Virtual Sim Driver</h1>
          <p className={styles.heroTagline}>Italian Sim Racing Team</p>
          <div className={styles.heroSims}>
            <SimBadge sim="LMU" />
            <SimBadge sim="IRC" />
            <SimBadge sim="ACE" />
          </div>
          <div className={styles.heroActions}>
            <a
              href={DISCORD_INVITE}
              target="_blank"
              rel="noopener noreferrer"
              className={`${styles.btn} ${styles.btnPrimary}`}
            >
              Discord
            </a>
            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.btn}
            >
              Instagram
            </a>
            <a
              href={FACEBOOK_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.btn}
            >
              Facebook
            </a>
            <Link to="/joinus" className={`${styles.btn} ${styles.btnAccent}`}>
              Unisciti al team
            </Link>
            <Link to="/login" className={`${styles.btn} ${styles.btnGhost}`}>
              Accedi
            </Link>
          </div>

          <div className={styles.statBand}>
            <div className={styles.statItem}>
              <span className={styles.statValue}>{activeRoster.length}</span>
              <span className={styles.statLabel}>Piloti</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statValue}>{completedRaces}</span>
              <span className={styles.statLabel}>Gare disputate</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statValue}>{(allLaps || []).length}</span>
              <span className={styles.statLabel}>Giri registrati</span>
            </div>
          </div>
        </div>
      </section>

      {/* ════ PROSSIMA GARA ════ */}
      <NextRaceHero race={nextRace} tracks={tracks} />

      {/* ════ ROSTER ════ */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          Il Team
          <span className={styles.sectionCount}>{activeRoster.length} piloti</span>
        </h2>
        <div className={styles.rosterGrid}>
          {activeRoster.map(d => (
            <Link key={d.driver_id} to={`/roster/${d.driver_id}`} className={styles.rosterCard}>
              <Avatar name={d.display_name} driverId={d.driver_id} size={56} photoUrl={resolvePhotoUrl(d.driver_id, socialFlags)} />
              {d.race_number != null && d.race_number !== '' && (
                <div className={styles.rosterNumber}>#{d.race_number}</div>
              )}
              <div className={styles.rosterName}>{d.display_name}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* ════ PILOTA DEL MESE (vetrina, riflette il ruolo Discord) ════ */}
      {pilotOfMonth && (
        <section className={styles.section}>
          <Link to={`/roster/${pilotOfMonth.driver_id}`} className={styles.spotlightCard}>
            <Avatar
              name={pilotOfMonth.display_name}
              driverId={pilotOfMonth.driver_id}
              size={72}
              photoUrl={resolvePhotoUrl(pilotOfMonth.driver_id, socialFlags)}
            />
            <div>
              <div className={styles.spotlightBadge}>
                🔥 Attivo del Mese{PILOT_OF_MONTH.monthLabel ? ` · ${PILOT_OF_MONTH.monthLabel}` : ''}
              </div>
              <div className={styles.spotlightName}>{pilotOfMonth.display_name}</div>
            </div>
          </Link>
        </section>
      )}

      {/* ════ RISULTATI RECENTI ════ */}
      {recentPodiums.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Risultati recenti</h2>
          <ul className={styles.podiumList}>
            {recentPodiums.map((r, idx) => {
              const driver = driverMap[r.driver_id];
              const race = raceMap[r.race_id];
              const medal = r.finish_position === 1 ? '🥇' : r.finish_position === 2 ? '🥈' : '🥉';
              return (
                <li key={`${r.race_id}-${r.driver_id}-${idx}`} className={styles.podiumItem}>
                  <span className={styles.podiumMedal}>{medal}</span>
                  <div className={styles.podiumInfo}>
                    <div className={styles.podiumRace}>
                      {race?.race_name || r.race_id}
                    </div>
                    <div className={styles.podiumDriver}>
                      {driver?.display_name || r.driver_name_external || r.driver_id}
                      <span className={styles.podiumDot}>·</span>
                      <span className={styles.podiumDate}>{formatDate(r.set_date)}</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ════ RECORD DI PISTA (teaser) ════ */}
      {recordsTeaser.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Record di pista</h2>
          <div className={styles.recordsGrid}>
            {recordsTeaser.map(r => (
              <div key={`${r.sim}-${r.track_id}`} className={styles.recordCard}>
                <SimBadge sim={r.sim} />
                <div className={styles.recordTrack}>{formatTrack(r.track_id, tracks)}</div>
                <LapTime display={r.lap_time_display} size="lg" emphasis="best" />
                <div className={styles.recordHolder}>{r.display_name}</div>
              </div>
            ))}
          </div>
          <div className={styles.recordsCta}>
            <Link to="/records" className={`${styles.btn} ${styles.btnGhost}`}>
              Vedi tutti i record →
            </Link>
          </div>
        </section>
      )}

      {/* ════ CTA RECRUITING ════ */}
      <section className={styles.ctaSection}>
        <h2 className={styles.ctaTitle}>Unisciti a VSD</h2>
        <p className={styles.ctaText}>
          Cerchiamo piloti motivati per la stagione 2026.
          Endurance, sprint, multi-sim: scegli la tua categoria.
        </p>
        <div className={styles.ctaActions}>
          <Link to="/joinus" className={`${styles.btn} ${styles.btnAccent}`}>
            Compila il form
          </Link>
          <a
            href={DISCORD_INVITE}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.btn}
          >
            Entra nel Discord
          </a>
          <a
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.btn}
          >
            Instagram
          </a>
          <a
            href={FACEBOOK_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.btn}
          >
            Facebook
          </a>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
