import { Link } from 'react-router-dom';
import { useMediaKit } from '../hooks/useShowcase';
import { useConsentSocialFlags } from '../hooks/useConsent';
import { usePageMeta } from '../hooks/usePageMeta';
import { resolvePhotoUrl } from '../utils/driverPhotos';
import Logo from '../components/shared/Logo';
import SimBadge from '../components/shared/SimBadge';
import totalPaintLogo from '../assets/total-paint-logo.webp';
import { SOCIAL_LINKS } from '../utils/constants';
import './MediaKit.css';

const PLATFORM_META = {
  instagram: { label: 'Instagram', url: SOCIAL_LINKS.INSTAGRAM, icon: '📷' },
  facebook: { label: 'Facebook', url: SOCIAL_LINKS.FACEBOOK, icon: '👍' },
};

function fmtRecordedDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
}

function initials(name) {
  if (!name) return '?';
  return name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

export default function MediaKit() {
  usePageMeta({
    title: 'Media Kit — Virtual Sim Driver | Sponsorizzazioni',
    description: 'Numeri e presenza del team Virtual Sim Driver: piloti, gare, podi e reach social su Le Mans Ultimate, iRacing e Assetto Corsa EVO. Media kit per sponsor.',
  });

  const { data, isLoading, error } = useMediaKit();
  const flagsQuery = useConsentSocialFlags();
  const socialFlags = flagsQuery.data?.flags || {};

  if (isLoading) {
    return <div className="mk-loading">Caricamento…</div>;
  }
  if (error || !data) {
    return <div className="mk-loading mk-error">Errore nel caricamento dei dati.</div>;
  }

  const { stats, sims, social, topDrivers } = data;

  return (
    <div className="mk">
      {/* TOP BAR */}
      <header className="mk-topbar">
        <div className="mk-brand">
          <span className="mk-brand-mark">VSD</span>
          <span className="mk-brand-name">MEDIA KIT</span>
        </div>
        <Link to="/joinus" className="mk-pilot-link">
          Unisciti al team →
        </Link>
      </header>

      {/* HERO */}
      <section className="mk-hero">
        <div className="mk-hero-glow" />
        <div className="mk-hero-content">
          <div className="mk-hero-logo-wrap">
            <Logo size={120} />
          </div>
          <h1 className="mk-hero-title">
            Virtual Sim Driver<br />
            <span className="mk-hero-accent">Media Kit</span>
          </h1>
          <p className="mk-hero-sub">
            Squadra italiana di sim racing su Le Mans Ultimate, iRacing e Assetto Corsa EVO.
            {stats.founded_year && ` Attivi dal ${stats.founded_year}.`} Numeri aggiornati in
            tempo reale, per chi valuta una sponsorizzazione o una collaborazione.
          </p>
          <div className="mk-hero-cta">
            <a href={SOCIAL_LINKS.DISCORD} target="_blank" rel="noopener noreferrer" className="mk-cta-primary">
              Contattaci su Discord
            </a>
          </div>
        </div>
      </section>

      {/* STATS */}
      <section className="mk-section">
        <div className="mk-stats-grid">
          <div className="mk-stat-card">
            <div className="mk-stat-value">{stats.drivers_count}</div>
            <div className="mk-stat-label">Piloti attivi</div>
          </div>
          <div className="mk-stat-card">
            <div className="mk-stat-value">{stats.races_count}</div>
            <div className="mk-stat-label">Gare disputate</div>
          </div>
          <div className="mk-stat-card">
            <div className="mk-stat-value">{stats.podiums_count}</div>
            <div className="mk-stat-label">Podi totali</div>
          </div>
          <div className="mk-stat-card">
            <div className="mk-stat-value">{stats.wins_count}</div>
            <div className="mk-stat-label">Vittorie</div>
          </div>
        </div>
      </section>

      {/* SIM COVERAGE */}
      {sims.length > 0 && (
        <section className="mk-section">
          <h2 className="mk-section-title">Presenza multi-sim</h2>
          <div className="mk-sims-row">
            {sims.map(s => (
              <div key={s.sim} className="mk-sim-card">
                <SimBadge sim={s.sim} variant="solid" size="md" />
                <span className="mk-sim-count">{s.races_count} gare</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* SOCIAL REACH */}
      <section className="mk-section">
        <h2 className="mk-section-title">Presenza social</h2>
        {social.length === 0 ? (
          <p className="mk-empty">Numeri social in aggiornamento — contattaci per i dati più recenti.</p>
        ) : (
          <div className="mk-social-grid">
            {social.map(s => {
              const meta = PLATFORM_META[s.platform] || { label: s.platform, url: null, icon: '🔗' };
              const dateLabel = fmtRecordedDate(s.recorded_date);
              return (
                <a
                  key={s.platform}
                  href={meta.url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mk-social-card"
                >
                  <span className="mk-social-icon">{meta.icon}</span>
                  <span className="mk-social-followers">{s.followers.toLocaleString('it-IT')}</span>
                  <span className="mk-social-label">{meta.label}</span>
                  {dateLabel && <span className="mk-social-date">aggiornato {dateLabel}</span>}
                </a>
              );
            })}
          </div>
        )}
      </section>

      {/* TOP DRIVERS */}
      {topDrivers.length > 0 && (
        <section className="mk-section">
          <h2 className="mk-section-title">Piloti in evidenza</h2>
          <div className="mk-drivers-grid">
            {topDrivers.map(d => {
              const photoUrl = resolvePhotoUrl(d.driver_id, socialFlags);
              return (
                <div key={d.driver_id} className="mk-driver-card">
                  <div className="mk-driver-avatar">
                    {photoUrl ? (
                      <img src={photoUrl} alt={d.display_name} loading="lazy" />
                    ) : (
                      <span>{initials(d.display_name)}</span>
                    )}
                  </div>
                  <div className="mk-driver-name">{d.display_name}</div>
                  <div className="mk-driver-record">
                    {d.podiums} pod{d.podiums === 1 ? 'io' : 'i'}
                    {d.wins > 0 && ` · ${d.wins} vittori${d.wins === 1 ? 'a' : 'e'}`}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* SPONSOR ATTUALE */}
      <section className="mk-section mk-sponsor-section">
        <h2 className="mk-section-title">Chi ci sostiene già</h2>
        <a
          href="https://www.totalpaint.it"
          target="_blank"
          rel="noopener noreferrer"
          className="mk-sponsor-card"
          title="Total Paint — Sponsor ufficiale VSD"
        >
          <img src={totalPaintLogo} alt="Total Paint" />
          <span>Total Paint — Sponsor ufficiale</span>
        </a>
      </section>

      {/* CONTACT CTA */}
      <section className="mk-contact">
        <h2 className="mk-contact-title">Interessato a una collaborazione?</h2>
        <p className="mk-contact-sub">
          Scrivici su Discord: rispondiamo direttamente allo staff del team.
        </p>
        <a href={SOCIAL_LINKS.DISCORD} target="_blank" rel="noopener noreferrer" className="mk-cta-primary">
          Apri Discord
        </a>
      </section>

      <footer className="mk-footer">
        © {new Date().getFullYear()} Virtual Sim Driver — Team italiano sim racing
      </footer>
    </div>
  );
}
