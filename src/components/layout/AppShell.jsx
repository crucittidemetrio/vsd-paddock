import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import ConsentGate from '../auth/ConsentGate';
import { useCanonicalUrl } from '../../hooks/useCanonicalUrl';
import { usePresenceHeartbeat } from '../../hooks/usePresence';
import './AppShell.css';

export default function AppShell() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useCanonicalUrl();
  usePresenceHeartbeat();

  const openMenu = () => setIsMobileMenuOpen(true);
  const closeMenu = () => setIsMobileMenuOpen(false);

  // Body scroll lock quando drawer aperto
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  // ESC chiude
  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape') closeMenu();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isMobileMenuOpen]);

  return (
    <div className="app-shell">
      <Sidebar isMobileOpen={isMobileMenuOpen} onMobileClose={closeMenu} />
      {isMobileMenuOpen && (
        <div
          className="app-shell-backdrop"
          onClick={closeMenu}
          aria-hidden="true"
        />
      )}
      <div className="app-shell-main">
        <TopBar onHamburgerClick={openMenu} />
        <main className="app-shell-content">
          <ConsentGate>
            <Outlet />
          </ConsentGate>
        </main>
      </div>
    </div>
  );
}