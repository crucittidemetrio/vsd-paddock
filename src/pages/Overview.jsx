import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useUpcomingRaces } from '../hooks/useRaces';
import { useRaceRSVP } from '../hooks/useRaceRSVP';
import { useRaceCrews } from '../hooks/useRaceCrews';
import { useStints } from '../hooks/useEnduranceStints';
import { useDrivers } from '../hooks/useRoster';
import { useNow } from '../hooks/useNow';
import { useTreasury } from '../hooks/useTreasury';
import { useRecentTeamRaceResults } from '../hooks/useRaceResults';
import { isActiveDriver } from '../utils/driverStatus';
import { formatCountdown, formatDuration, formatRaceDateTime } from '../utils/format';
import {
  activePilotTrend,
  buildReadiness,
  countRsvps,
  crewRule,
  crewStatus,
  treasuryRunway,
} from '../utils/overview';
import SimBadge from '../components/shared/SimBadge';
import styles from './Overview.module.css';

const UPCOMING_ROWS = 5;
const RACE_GRACE_MS = 3 * 60 * 60 * 1000; // una gara appena partita resta "prossima"

// Gli hook restituiscono a volte l'array, a volte { races | drivers | ... }
// a seconda che il livello di unwrap sia già stato applicato: accettiamo
// entrambe le forme invece di dipendere da un dettaglio del layer API.
function toList(data, key) {
  if (Array.isArray(data)) return data;
  return (data && data[key]) || [];
}

function toStints(data) {
  if (Array.isArray(data)) return data;
  return data?.stints || data?.data?.stints || [];
}

const eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

const LEVEL_TEXT = {
  ok: 'Equipaggio coperto',
  risk: 'Da confermare',
  ko: 'Equipaggio scoperto',
};

function CrewChip({ status }) {
  return (
    <span className={`${styles.chip} ${styles[`chip_${status.level}`]}`}>
      {LEVEL_TEXT[status.level]}
    </span>
  );
}

function Ring({ percent }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(100, Math.max(0, percent)) / 100);
  const tone = percent >= 100 ? styles.ringOk : percent >= 50 ? styles.ringMid : styles.ringLow;
  return (
    <div className={styles.ringWrap} role="img" aria-label={`Prontezza ${percent}%`}>
      <svg viewBox="0 0 100 100" className={styles.ring}>
        <circle cx="50" cy="50" r={r} className={styles.ringTrack} />
        <circle
          cx="50"
          cy="50"
          r={r}
          className={`${styles.ringBar} ${tone}`}
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <div className={styles.ringLabel}>
        <span className={styles.ringValue}>{percent}%</span>
        <span className={styles.ringSub}>pronta</span>
      </div>
    </div>
  );
}

function NextRaceCard({ race, activeDrivers }) {
  const raceId = race.race_id;
  const rule = crewRule(race.duration_minutes);
  const { data: rsvps = [], isLoading: rsvpLoading } = useRaceRSVP(raceId);
  const { data: crews = [] } = useRaceCrews(raceId);
  const { data: stintsData } = useStints(rule.kind === 'endurance' ? raceId : undefined);

  const readiness = useMemo(
    () => buildReadiness({
      race,
      activeDrivers,
      rsvps,
      crews,
      stints: toStints(stintsData),
    }),
    [race, activeDrivers, rsvps, crews, stintsData],
  );

  const names = useMemo(() => {
    const byId = new Map(activeDrivers.map(d => [d.driver_id, d.display_name]));
    return readiness.missingRsvpIds.map(id => byId.get(id) || id);
  }, [activeDrivers, readiness.missingRsvpIds]);

  const { crew } = readiness;
  const duration = Number(race.duration_minutes);

  return (
    <section className={`${styles.card} ${styles.cardWide}`}>
      <header className={styles.cardHead}>
        <div>
          <div className={styles.eyebrow}>Prossima gara</div>
          <h2 className={styles.raceTitle}>{race.race_name || race.title || raceId}</h2>
          <div className={styles.meta}>
            {race.sim && <SimBadge sim={race.sim} variant="solid" size="sm" />}
            <span>{formatRaceDateTime(race.date)}</span>
            {Number.isFinite(duration) && duration > 0 && <span>{formatDuration(duration)}</span>}
            <span className={styles.countdown}>tra {formatCountdown(race.date)}</span>
          </div>
        </div>
        <CrewChip status={crew} />
      </header>

      {rsvpLoading ? (
        <p className={styles.muted}>Caricamento…</p>
      ) : (
        <div className={styles.readyGrid}>
          <Ring percent={readiness.percent} />
          <ul className={styles.checklist}>
            {readiness.items.map(item => (
              <li key={item.key} className={item.done ? styles.done : styles.todo}>
                <span className={styles.tick} aria-hidden="true">{item.done ? '✓' : '○'}</span>
                <span className={styles.itemBody}>
                  <span className={styles.itemLabel}>{item.label}</span>
                  <span className={styles.itemDetail}>{item.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.crewLine}>
        <strong>{crew.confirmed}</strong> confermati
        {crew.tentative > 0 && <> · <strong>{crew.tentative}</strong> forse</>}
        <span className={styles.muted}>
          {' '}· regola {rule.kind === 'sprint' ? 'sprint' : 'endurance'}: {rule.min}–{rule.max} piloti
        </span>
        {crew.overMax && (
          <span className={styles.note}> · oltre il massimo per una vettura: serve una seconda macchina</span>
        )}
      </div>

      {names.length > 0 && (
        <p className={styles.pending}>
          Senza risposta: {names.slice(0, 6).join(', ')}
          {names.length > 6 && ` e altri ${names.length - 6}`}
        </p>
      )}

      <Link to={`/race/${raceId}`} className={styles.cta}>Apri la gara →</Link>
    </section>
  );
}

function UpcomingRow({ race, activeIds }) {
  const { data: rsvps = [] } = useRaceRSVP(race.race_id);
  const status = useMemo(() => {
    const counts = countRsvps(rsvps, activeIds);
    return crewStatus({
      confirmed: counts.confirmed,
      tentative: counts.tentative,
      durationMin: race.duration_minutes,
    });
  }, [rsvps, activeIds, race.duration_minutes]);

  const duration = Number(race.duration_minutes);

  return (
    <li className={styles.row}>
      <Link to={`/race/${race.race_id}`} className={styles.rowLink}>
        <span className={styles.rowMain}>
          <span className={styles.rowName}>{race.race_name || race.title || race.race_id}</span>
          <span className={styles.rowMeta}>
            {formatRaceDateTime(race.date)}
            {Number.isFinite(duration) && duration > 0 && ` · ${formatDuration(duration)}`}
          </span>
        </span>
        <span className={styles.rowCount}>
          {status.confirmed}/{status.min}
          {status.tentative > 0 && <small> +{status.tentative}?</small>}
        </span>
        <CrewChip status={status} />
      </Link>
    </li>
  );
}

function UpcomingCard({ races, activeIds }) {
  return (
    <section className={styles.card}>
      <div className={styles.eyebrow}>Copertura equipaggio</div>
      <h2 className={styles.cardTitle}>Prossime gare</h2>
      {races.length === 0 ? (
        <p className={styles.muted}>Nessuna gara in programma.</p>
      ) : (
        <ul className={styles.list}>
          {races.map(r => <UpcomingRow key={r.race_id} race={r} activeIds={activeIds} />)}
        </ul>
      )}
    </section>
  );
}

function PilotsCard({ activeDrivers, activeIds }) {
  const { data: resultsData, isLoading } = useRecentTeamRaceResults(500);
  const trend = useMemo(
    () => activePilotTrend(toList(resultsData, 'results'), activeIds),
    [resultsData, activeIds],
  );
  const sign = trend.delta > 0 ? '+' : '';
  const tone = trend.delta > 0 ? styles.up : trend.delta < 0 ? styles.down : styles.flat;

  return (
    <section className={styles.card}>
      <div className={styles.eyebrow}>Squadra</div>
      <h2 className={styles.cardTitle}>Piloti attivi</h2>
      <div className={styles.big}>{activeDrivers.length}</div>
      <p className={styles.muted}>tesserati attivi oggi</p>
      <div className={styles.divider} />
      {isLoading ? (
        <p className={styles.muted}>Caricamento…</p>
      ) : (
        <p className={styles.trendLine}>
          <strong>{trend.current}</strong> hanno corso negli ultimi 30 giorni
          <span className={`${styles.delta} ${tone}`}> {sign}{trend.delta}</span>
          <span className={styles.muted}> rispetto ai 30 precedenti ({trend.previous})</span>
        </p>
      )}
    </section>
  );
}

function TreasuryCard() {
  const { data, isLoading } = useTreasury();
  const runway = useMemo(
    () => treasuryRunway(toList(data, 'entries')),
    [data],
  );

  return (
    <section className={styles.card}>
      <div className={styles.eyebrow}>Solo admin</div>
      <h2 className={styles.cardTitle}>Cassa</h2>
      {isLoading ? (
        <p className={styles.muted}>Caricamento…</p>
      ) : (
        <>
          <div className={styles.big}>{eur.format(runway.balance)}</div>
          <p className={styles.muted}>saldo attuale</p>
          <div className={styles.divider} />
          {runway.runwayMonths == null ? (
            <p className={styles.muted}>Nessuna spesa negli ultimi 6 mesi: autonomia non calcolabile.</p>
          ) : (
            <p className={styles.trendLine}>
              <strong>{runway.runwayMonths.toFixed(1).replace('.', ',')}</strong> mesi di autonomia
              <span className={styles.muted}> · spesa media {eur.format(runway.monthlySpend)}/mese</span>
            </p>
          )}
          <Link to="/admin/treasury" className={styles.cta}>Apri la cassa →</Link>
        </>
      )}
    </section>
  );
}

export default function Overview() {
  const { isAdmin } = useAuth();
  const { data: upcomingData, isLoading: racesLoading } = useUpcomingRaces();
  const { data: driversData, isLoading: driversLoading } = useDrivers({});

  const activeDrivers = useMemo(
    () => toList(driversData, 'drivers').filter(isActiveDriver),
    [driversData],
  );
  const activeIds = useMemo(
    () => new Set(activeDrivers.map(d => d.driver_id)),
    [activeDrivers],
  );

  // Aggiornato ogni minuto: una gara appena partita esce da "prossima" da sola.
  const now = useNow(60_000);

  const races = useMemo(() => {
    return toList(upcomingData, 'races')
      .filter(r => r && r.race_id && r.date && r.status !== 'cancelled'
        && new Date(r.date).getTime() > now - RACE_GRACE_MS)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [upcomingData, now]);

  const nextRace = races[0] || null;
  const loading = racesLoading || driversLoading;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>Panoramica</div>
        <h1 className={styles.title}>Siamo pronti a correre?</h1>
        <p className={styles.sub}>
          Stato della prossima gara, copertura degli equipaggi e salute della squadra,
          in un colpo d&apos;occhio.
        </p>
      </header>

      {loading ? (
        <p className={styles.muted}>Caricamento…</p>
      ) : (
        <div className={styles.grid}>
          {nextRace ? (
            <NextRaceCard race={nextRace} activeDrivers={activeDrivers} />
          ) : (
            <section className={`${styles.card} ${styles.cardWide}`}>
              <div className={styles.eyebrow}>Prossima gara</div>
              <p className={styles.muted}>Nessuna gara in programma.</p>
            </section>
          )}
          <UpcomingCard races={races.slice(0, UPCOMING_ROWS)} activeIds={activeIds} />
          <PilotsCard activeDrivers={activeDrivers} activeIds={activeIds} />
          {isAdmin && <TreasuryCard />}
        </div>
      )}
    </div>
  );
}
