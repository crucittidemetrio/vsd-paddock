import { Link } from 'react-router-dom';
import { useIncidents } from '../hooks/useIncidents';
import { useSponsors } from '../hooks/useSponsors';
import { useCandidates } from '../hooks/useCandidates';
import { useUpcomingRaces } from '../hooks/useRaces';
import { useRaceRSVP } from '../hooks/useRaceRSVP';
import { useDrivers } from '../hooks/useRoster';
import styles from './AdminHome.module.css';

function isOverdue(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

/**
 * AdminHome — punto di ingresso unico per lo staff: quello che negli
 * ultimi round è finito sparso in 4+ strumenti separati (Incidenti,
 * Sponsor, Candidature, RSVP) qui converge in un solo colpo d'occhio.
 * Nessun nuovo backend: riusa gli hook già esistenti, filtra/aggrega
 * lato client.
 */
export default function AdminHome() {
  const { data: openIncidents, isLoading: incidentsLoading } = useIncidents('open');
  const { data: sponsors, isLoading: sponsorsLoading } = useSponsors();
  const { data: newCandidates, isLoading: candidatesLoading } = useCandidates('new');
  const { data: upcomingData, isLoading: racesLoading } = useUpcomingRaces();

  const nextRace = upcomingData?.races?.[0] || null;

  const { data: rsvps, isLoading: rsvpLoading } = useRaceRSVP(nextRace?.race_id);
  const { data: driversData, isLoading: driversLoading } = useDrivers({});
  const activeDrivers = driversData?.drivers || [];

  const overdueSponsors = (sponsors || []).filter(
    s => isOverdue(s.next_follow_up) && s.status !== 'declined' && s.status !== 'lapsed'
  );

  const respondedIds = new Set((rsvps || []).map(r => r.driver_id));
  const missingRsvp = nextRace
    ? activeDrivers.filter(d => !respondedIds.has(d.driver_id))
    : [];

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>COMMAND CENTER</div>
        <h1 className={styles.title}>Admin Home</h1>
        <p className={styles.sub}>
          Cosa richiede attenzione oggi, aggregato dai vari strumenti dello staff.
        </p>
      </header>

      <div className={styles.grid}>
        <Link
          to="/admin/incidents"
          className={`${styles.card} ${openIncidents?.length > 0 ? styles.cardAlert : styles.cardEmpty}`}
        >
          <div className={styles.cardHead}>
            <span className={styles.cardTitle}>Incidenti aperti</span>
            <span className={styles.cardCount}>
              {incidentsLoading ? '…' : (openIncidents?.length || 0)}
            </span>
          </div>
          {incidentsLoading ? (
            <span className={styles.loadingText}>Caricamento…</span>
          ) : openIncidents?.length > 0 ? (
            <div className={styles.itemList}>
              {openIncidents.slice(0, 3).map(inc => (
                <div key={inc.complaint_key} className={styles.item}>
                  {inc.reporter_sim} → {inc.against} · {inc.track}
                </div>
              ))}
              {openIncidents.length > 3 && (
                <span className={styles.itemMore}>+{openIncidents.length - 3} altri</span>
              )}
            </div>
          ) : (
            <span className={styles.emptyText}>Nessun incidente aperto.</span>
          )}
        </Link>

        <Link
          to="/admin/sponsors"
          className={`${styles.card} ${overdueSponsors.length > 0 ? styles.cardAlert : styles.cardEmpty}`}
        >
          <div className={styles.cardHead}>
            <span className={styles.cardTitle}>Follow-up sponsor scaduti</span>
            <span className={styles.cardCount}>
              {sponsorsLoading ? '…' : overdueSponsors.length}
            </span>
          </div>
          {sponsorsLoading ? (
            <span className={styles.loadingText}>Caricamento…</span>
          ) : overdueSponsors.length > 0 ? (
            <div className={styles.itemList}>
              {overdueSponsors.slice(0, 3).map(s => (
                <div key={s.sponsor_id} className={styles.item}>{s.company_name}</div>
              ))}
              {overdueSponsors.length > 3 && (
                <span className={styles.itemMore}>+{overdueSponsors.length - 3} altri</span>
              )}
            </div>
          ) : (
            <span className={styles.emptyText}>Nessun follow-up scaduto.</span>
          )}
        </Link>

        <Link
          to="/admin/candidates"
          className={`${styles.card} ${newCandidates?.length > 0 ? styles.cardAlert : styles.cardEmpty}`}
        >
          <div className={styles.cardHead}>
            <span className={styles.cardTitle}>Candidature nuove</span>
            <span className={styles.cardCount}>
              {candidatesLoading ? '…' : (newCandidates?.length || 0)}
            </span>
          </div>
          {candidatesLoading ? (
            <span className={styles.loadingText}>Caricamento…</span>
          ) : newCandidates?.length > 0 ? (
            <div className={styles.itemList}>
              {newCandidates.slice(0, 3).map(c => (
                <div key={c.candidate_id} className={styles.item}>{c.display_name}</div>
              ))}
              {newCandidates.length > 3 && (
                <span className={styles.itemMore}>+{newCandidates.length - 3} altre</span>
              )}
            </div>
          ) : (
            <span className={styles.emptyText}>Nessuna candidatura nuova.</span>
          )}
        </Link>

        <Link
          to={nextRace ? `/race/${nextRace.race_id}` : '/race'}
          className={`${styles.card} ${missingRsvp.length > 0 ? styles.cardAlert : styles.cardEmpty}`}
        >
          <div className={styles.cardHead}>
            <span className={styles.cardTitle}>Senza RSVP — prossima gara</span>
            <span className={styles.cardCount}>
              {racesLoading || rsvpLoading || driversLoading ? '…' : missingRsvp.length}
            </span>
          </div>
          {racesLoading ? (
            <span className={styles.loadingText}>Caricamento…</span>
          ) : !nextRace ? (
            <span className={styles.emptyText}>Nessuna gara in programma.</span>
          ) : rsvpLoading || driversLoading ? (
            <span className={styles.loadingText}>Caricamento…</span>
          ) : missingRsvp.length > 0 ? (
            <div className={styles.itemList}>
              <span className={styles.item}>{nextRace.race_name || nextRace.race_id}</span>
              {missingRsvp.slice(0, 3).map(d => (
                <div key={d.driver_id} className={styles.item}>{d.display_name}</div>
              ))}
              {missingRsvp.length > 3 && (
                <span className={styles.itemMore}>+{missingRsvp.length - 3} altri</span>
              )}
            </div>
          ) : (
            <span className={styles.emptyText}>Tutti hanno risposto per {nextRace.race_name || nextRace.race_id}.</span>
          )}
        </Link>
      </div>
    </div>
  );
}
