import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { LABELS } from '../../utils/constants';
import './TopBar.css';

export default function TopBar({ onHamburgerClick = () => {} }) {
  const { driver, discordAvatarUrl, logout, isAuthenticated } = useAuth();

  const initials = (driver?.display_name || '?')
    .split(' ')
    .map(s => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          className="hamburger-btn"
          onClick={onHamburgerClick}
          aria-label="Apri menu"
        >
          <span /><span /><span />
        </button>
        <div className="status-strip">
          <span className="status-dot" />
          <span className="status-text">SYSTEM ONLINE</span>
        </div>
      </div>

      <div className="topbar-right">
        {isAuthenticated ? (
          <>
            {/* Cliccabile → scheda pilota personale (/roster/:driverId), stessa
                destinazione delle roster card (vedi Roster.jsx). Se per qualche
                motivo non abbiamo ancora un driver_id (es. profilo minimale
                subito dopo il login Discord), resta un div non cliccabile
                invece di puntare a un link rotto. */}
            {driver?.driver_id ? (
              <Link to={`/roster/${driver.driver_id}`} className="user-card user-card-link">
                <div className="user-avatar">
                  {discordAvatarUrl ? (
                    <img
                      src={discordAvatarUrl}
                      alt={driver?.display_name || 'avatar'}
                      style={{
                        width: '100%',
                        height: '100%',
                        borderRadius: '50%',
                        objectFit: 'cover',
                        display: 'block',
                      }}
                    />
                  ) : (
                    initials
                  )}
                </div>
                <div className="user-meta">
                  <div className="user-name">{driver?.display_name || '—'}</div>
                  <div className="user-role">{driver?.role?.toUpperCase() || ''}</div>
                </div>
              </Link>
            ) : (
              <div className="user-card">
                <div className="user-avatar">
                  {discordAvatarUrl ? (
                    <img
                      src={discordAvatarUrl}
                      alt={driver?.display_name || 'avatar'}
                      style={{
                        width: '100%',
                        height: '100%',
                        borderRadius: '50%',
                        objectFit: 'cover',
                        display: 'block',
                      }}
                    />
                  ) : (
                    initials
                  )}
                </div>
                <div className="user-meta">
                  <div className="user-name">{driver?.display_name || '—'}</div>
                  <div className="user-role">{driver?.role?.toUpperCase() || ''}</div>
                </div>
              </div>
            )}
            <button className="logout-btn" onClick={logout}>
              {LABELS.nav_logout}
            </button>
          </>
        ) : (
          <Link to="/login" className="login-btn">
            Accedi con Discord
          </Link>
        )}
      </div>
    </header>
  );
}
