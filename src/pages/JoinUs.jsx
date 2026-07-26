import React from 'react';
import { Link } from 'react-router-dom';
import { useShowcase } from '../hooks/useShowcase';
import './JoinUs.css';
import Logo from '../components/shared/Logo';
import totalPaintLogo from '../assets/total-paint-logo.webp';

const DISCORD_INVITE = 'https://discord.gg/hdt8uHEfsy';
const JOIN_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLScA6mFauERcpKetn0T58LMPioRZHJ1W5PQpl9e9ytV5QB31Tw/viewform';

// Testimonianze reali di piloti — messaggi spontanei postati su Discord
// a fine campionato, riportati con il loro consenso implicito (pubblici nel server).
const TESTIMONIALS = [
  {
    quote: 'Gare dure ma sempre corrette. Ho visto sempre molta attenzione, e non è una cosa consueta.',
    name: 'Renzo O.',
    context: 'Toyota GR86 "Zero Cost" Championship',
  },
  {
    quote: 'Alla mia prima esperienza in un campionato: siete davvero tutti molto forti e soprattutto corretti.',
    name: 'Daniele F.',
    context: 'Toyota GR86 "Zero Cost" Championship',
  },
  {
    quote: 'Grazie a tutti i partecipanti e a VSD per l\'organizzazione.',
    name: 'Giovanni P.',
    context: 'Toyota GR86 "Zero Cost" Championship',
  },
];

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

      {/* PARTNER UFFICIALE */}
      <section className="joinus-section">
        <div className="joinus-section-head">
          <div className="joinus-section-eyebrow">PARTNER UFFICIALE</div>
          <h2 className="joinus-section-title">Sostenuti da</h2>
        </div>
        <a
          href="https://www.totalpaint.it"
          target="_blank"
          rel="noopener noreferrer"
          className="joinus-partner-card"
          title="Total Paint — Sponsor ufficiale VSD"
        >
          <img
            src={totalPaintLogo}
            alt="Total Paint"
            className="joinus-partner-logo"
          />
        </a>
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

      {/* TESTIMONIANZE */}
      <section className="joinus-section">
        <div className="joinus-section-head">
          <div className="joinus-section-eyebrow">VOCI DAL PADDOCK</div>
          <h2 className="joinus-section-title">Cosa dicono i piloti</h2>
        </div>
        <div className="joinus-testimonials-grid">
          {TESTIMONIALS.map((t, i) => (
            <div key={i} className="joinus-testimonial-card">
              <div className="joinus-testimonial-mark">"</div>
              <p className="joinus-testimonial-quote">{t.quote}</p>
              <div className="joinus-testimonial-name">{t.name}</div>
              <div className="joinus-testimonial-context">{t.context}</div>
            </div>
          ))}
        </div>
      </section>

      {/* COME UNIRSI */}
      <section className="joinus-section joinus-join-section" id="unisciti">
        <div className="joinus-section-head">
          <div className="joinus-section-eyebrow">CANDIDATURA</div>
          <h2 className="joinus-section-title">Come unirsi al team</h2>
        </div>

        <div className="joinus-steps">
          <Step n={1} title="Compila il form di candidatura">
            <p className="joinus-step-text">
              Ti chiederà nome, esperienza, sim preferenze e una breve motivazione.
              Tempo richiesto: 3-5 minuti.
            </p>
            <a
              href={JOIN_FORM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="joinus-discord-btn"
            >
              Apri il form ↗
            </a>
          </Step>
          <Step n={2} title="Entra nel server Discord VSD">
            <p className="joinus-step-text">
              Lo staff ti risponderà direttamente in DM. È utile essere già sul server per accelerare i tempi.
            </p>
            <a
              href={DISCORD_INVITE}
              target="_blank"
              rel="noopener noreferrer"
              className="joinus-discord-btn"
            >
              Apri invito Discord ↗
            </a>
          </Step>
          <Step n={3} title="Attendi la valutazione dello staff">
            <p className="joinus-step-text">
              Solitamente entro 48-72 ore. Se selezionato, riceverai accesso al server come pilota VSD e potrai iniziare a correre con noi.
            </p>
          </Step>
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

      {/* UE144 BANNER */}
      <section className="joinus-ue144-banner">
        <div className="joinus-ue144-inner">
          <div className="joinus-ue144-text">
            <div className="joinus-ue144-eyebrow">Non vuoi unirti al team?</div>
            <div className="joinus-ue144-title">Corri comunque con noi — UE144</div>
            <div className="joinus-ue144-sub">
              Il nostro campionato endurance è aperto a tutti. 144 minuti su Le Mans Ultimate,
              tre classi, pilota singolo. Nessun requisito di membership.
            </div>
          </div>
          <Link to="/ue144" className="joinus-ue144-btn">Scopri UE144 →</Link>
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
