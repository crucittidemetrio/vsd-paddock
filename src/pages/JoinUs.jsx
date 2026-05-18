import React from 'react';
import { Link } from 'react-router-dom';
import { useShowcase } from '../hooks/useShowcase';
import './JoinUs.css';
import Logo from '../components/shared/Logo';

const DISCORD_INVITE = 'https://discord.gg/W4yWkU3YAd';

// Funzione per formattare la data della gara
function formatRaceDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const datePart = d.toLocaleDateString('it-IT', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
  const timePart = d.toLocaleTimeString('it-IT', {
    hour: '2-digit', minute: '2-digit',
  });
  return `${datePart} · ${timePart}`;
}

// Funzione per formattare la durata
function formatDuration(minutes) {
  if (minutes == null) return '—';
  const m = Number(minutes);
  if (isNaN(m)) return '—';
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h === 0) return `${mm} min`;
  if (mm === 0) return `${h}h`;
  return `${h}h ${mm}min`;
}

export default function JoinUs() {
 const { data, isLoading } = useShowcase();
  
  // Debug per vedere cosa arriva dalle API
  
  if (isLoading) {
    return <div className="joinus-loading">Caricamento in corso...</div>;
  }

  return (
    <div className="joinus">
      {/* TOP BAR */}
      <header className="joinus-topbar">
        <div className="joinus-brand">
          <span className="joinus-brand-mark">VSD</span>
          <span className="joinus-brand-name">VIRTUAL SIM DRIVER</span>
        </div>
        <Link to="/login" className="joinus-pilot-link">
          Area Piloti →
        </Link>
      </header>

      {/* HERO SECTION */}
      <section className="joinus-hero">
        <div className="joinus-hero-glow" />
        <div className="joinus-hero-content">
  <div className="joinus-hero-logo-wrap">
    <Logo size={140} withWordmark />
  </div>
  <div className="joinus-hero-eyebrow">...</div>
  ...
          <h1 className="joinus-hero-title">
            La community italiana<br />
            di <span className="joinus-hero-accent">sim racing</span>
          </h1>
          <p className="joinus-hero-sub">
            Virtual Sim Driver è la community italiana di sim racing dedicata a
            Le Mans Ultimate, iRacing e AC Evo, con eventi, ranking e competizioni.
          </p>
          <div className="joinus-hero-cta">
            <a href="#unisciti" className="joinus-cta-primary">
              Unisciti al team
            </a>
            {/* CORRETTO: Aggiunto il tag <a> mancante */}
            <a 
              href={DISCORD_INVITE}
              target="_blank"
              rel="noopener noreferrer"
              className="joinus-cta-secondary"
            >
              Entra nel Discord →
            </a>
          </div>
        </div>
      </section>

      {/* STATS */}
      <section className="joinus-stats">
        <Stat value={data?.stats?.drivers_count} label="Piloti attivi" />
        <Stat value={data?.stats?.races_count} label="Gare disputate" />
        <Stat value={data?.stats?.podiums_count} label="Podi conquistati" />
        <Stat value={data?.stats?.verified_laps_count} label="Best lap verificate" />
      </section>

      {/* TOP PILOTI */}
      {data?.topDrivers?.length > 0 && (
        <section className="joinus-section">
          <div className="joinus-section-head">
            <div className="joinus-section-eyebrow">TOP PILOTI</div>
            <h2 className="joinus-section-title">Chi corre per VSD</h2>
          </div>
          <div className="joinus-drivers-grid">
            {data.topDrivers.map((d, i) => {
              const initials = (d.display_name || '?')
                .split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();
              return (
                <div key={d.driver_id} className="joinus-driver-card">
                  <div className="joinus-driver-rank">#{i + 1}</div>
                  <div className="joinus-driver-avatar">{initials}</div>
                  <div className="joinus-driver-name">{d.display_name}</div>
                  <div className="joinus-driver-stat">
                    {d.podiums} {d.podiums === 1 ? 'podio' : 'podi'}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* CALENDARIO */}
      {data?.upcomingRaces?.length > 0 && (
        <section className="joinus-section">
          <div className="joinus-section-head">
            <div className="joinus-section-eyebrow">CALENDARIO</div>
            <h2 className="joinus-section-title">Prossime gare</h2>
          </div>
          <div className="joinus-races-list">
            {data.upcomingRaces.map(r => (
              <div key={r.race_id} className="joinus-race-card">
                <div className="joinus-race-meta">
                  <span className="joinus-race-sim">{r.sim}</span>
                  {r.championship && (
                    <span className="joinus-race-champ">{r.championship}</span>
                  )}
                </div>
                <h3 className="joinus-race-name">{r.race_name}</h3>
                <div className="joinus-race-info">
                  <span>{r.track_name || r.track_id}</span>
                  {r.car_name && <span> · {r.car_name}</span>}
                </div>
                <div className="joinus-race-bottom">
                  <span className="joinus-race-date">{formatRaceDate(r.date)}</span>
                  <span className="joinus-race-duration">{formatDuration(r.duration_minutes)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* BEST LAP */}
      {data?.latestBestLap && (
        <section className="joinus-section">
          <div className="joinus-section-head">
            <div className="joinus-section-eyebrow">PERFORMANCE</div>
            <h2 className="joinus-section-title">Ultimo best lap verificato</h2>
          </div>
          <div className="joinus-lap-card">
            <div className="joinus-lap-time">{data.latestBestLap.lap_time_display}</div>
            <div className="joinus-lap-driver">{data.latestBestLap.driver_name}</div>
            <div className="joinus-lap-meta">
              <span className="joinus-lap-sim">{data.latestBestLap.sim}</span>
              <span> · </span>
              <span>{data.latestBestLap.track_name || data.latestBestLap.track_id}</span>
              {data.latestBestLap.car_name && (
                <>
                  <span> · </span>
                  <span>{data.latestBestLap.car_name}</span>
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {/* COME UNIRSI */}
      <section className="joinus-section joinus-join-section" id="unisciti">
        <div className="joinus-section-head">
          <div className="joinus-section-eyebrow">CANDIDATURA</div>
          <h2 className="joinus-section-title">Come unirsi al team</h2>
        </div>

        <div className="joinus-steps">
          <Step n={1} title="Entra nel server Discord VSD">
            {/* CORRETTO: Aggiunto il tag <a> mancante */}
            <a 
              href={DISCORD_INVITE}
              target="_blank"
              rel="noopener noreferrer"
              className="joinus-discord-btn"
            >
              Apri invito Discord ↗
            </a>
          </Step>
          <Step n={2} title="Vai al canale #iscrizioni-e-presentazioni" />
          <Step n={3} title="Apri un nuovo post seguendo questo template:">
            <ul className="joinus-template">
              <li>Nome e Cognome</li>
              <li>Categoria preferita (LMGT3, Hypercar, ecc.)</li>
              <li>Esperienza nel sim racing</li>
              <li>Perché vuoi entrare nel Team VSD</li>
            </ul>
          </Step>
          <Step n={4} title="Lo staff valuterà la richiesta e ti risponderà direttamente nel post" />
        </div>

        <div className="joinus-requirements">
          <h3 className="joinus-requirements-title">Requisiti minimi</h3>
          <ul>
            <li>Approccio corretto e sportivo in pista e fuori</li>
            <li>Disponibilità a partecipare a eventi, campionati, attività interne</li>
            <li>Condividere la filosofia VSD: impegno, fair play, crescita costante</li>
          </ul>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="joinus-footer">
        <div>© 2026 Virtual Sim Driver — Team italiano sim racing</div>
        <a href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer">Discord</a>
      </footer>
    </div>
  );
}

// Sotto-componenti (Utility)

function Stat({ value, label }) {
  return (
    <div className="joinus-stat">
      <div className="joinus-stat-value">{value ?? '—'}</div>
      <div className="joinus-stat-label">{label}</div>
    </div>
  );
}

function Step({ n, title, children }) {
  return (
    <div className="joinus-step">
      <div className="joinus-step-num">{n}</div>
      <div className="joinus-step-body">
        <div className="joinus-step-title">{title}</div>
        {children}
      </div>
    </div>
  );
}