import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import AppShell from './components/layout/AppShell';
import AdminRoute from './components/layout/AdminRoute';
import RequireTier from './components/auth/RequireTier';
import LoginPrompt from './components/auth/LoginPrompt';

// ── Eager: entry point + navigazione primaria ─────────────────
import Login from './pages/Login';
import AuthCallback from './pages/AuthCallback';
import Landing from './pages/Landing';
import Roster from './pages/Roster';
import Race from './pages/Race';
import BestLaps from './pages/BestLaps';
import Calendar from './pages/Calendar';
import ChampionshipsList from './pages/ChampionshipsList';

// ── Lazy: pagine deep, secondarie, admin ──────────────────────
const JoinUs              = lazy(() => import('./pages/JoinUs'));
const DriverProfile       = lazy(() => import('./pages/DriverProfile'));
const RaceDetail          = lazy(() => import('./pages/RaceDetail'));
const Reports             = lazy(() => import('./pages/Reports'));
const LapsDrilldown       = lazy(() => import('./pages/LapsDrilldown'));
const Training            = lazy(() => import('./pages/Training'));
const Academy             = lazy(() => import('./pages/Academy'));
const Endurance           = lazy(() => import('./pages/Endurance'));
const EnduranceDetail     = lazy(() => import('./pages/EnduranceDetail'));
const ChampionshipDetail  = lazy(() => import('./pages/ChampionshipDetail'));
const AdminImportResults  = lazy(() => import('./pages/AdminImportResults'));
const AdminImportStandings= lazy(() => import('./pages/AdminImportStandings'));
const AdminTeamDashboard  = lazy(() => import('./pages/AdminTeamDashboard'));
const AdminGarage61Sync   = lazy(() => import('./pages/AdminGarage61Sync'));
const AdminPosters        = lazy(() => import('./pages/AdminPosters'));
const AdminEndurance      = lazy(() => import('./pages/AdminEndurance'));

import './App.css';

function PageLoader() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      color: 'rgba(255, 255, 255, 0.5)',
      fontFamily: 'inherit',
      fontSize: 14,
      letterSpacing: 1,
      textTransform: 'uppercase',
    }}>
      Caricamento…
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* ════ Standalone (senza AppShell) ════ */}
            <Route path="/login" element={<Login />} />
            <Route path="/auth/callback" element={<AuthCallback />} />

            {/* ════ Dentro AppShell — sidebar + topbar ════ */}
            <Route element={<AppShell />}>

              {/* ── Pubbliche: accessibili a tutti i tier ── */}
              <Route path="/" element={<Landing />} />
              <Route path="/joinus" element={<JoinUs />} />
              <Route path="/roster" element={<Roster />} />
              <Route path="/roster/:driverId" element={<DriverProfile />} />
              <Route path="/race" element={<Race />} />
              <Route path="/race/:raceId" element={<RaceDetail />} />
              <Route path="/calendar" element={<Calendar />} />
              <Route path="/laps" element={<BestLaps />} />
              <Route path="/laps/:sim/:track/:category" element={<LapsDrilldown />} />
              <Route path="/championships" element={<ChampionshipsList />} />
              <Route path="/championships/:championshipId" element={<ChampionshipDetail />} />
              <Route path="/endurance" element={<Endurance />} />
              <Route path="/endurance/:auditionId" element={<EnduranceDetail />} />

              {/* ── Private: richiede pilot_vsd o superiore ── */}
              <Route
                path="/reports"
                element={
                  <RequireTier minTier="pilot_vsd" fallback={<LoginPrompt feature="i report di gara" />}>
                    <Reports />
                  </RequireTier>
                }
              />
              <Route
                path="/training"
                element={
                  <RequireTier minTier="pilot_vsd" fallback={<LoginPrompt feature="il modulo Training" />}>
                    <Training />
                  </RequireTier>
                }
              />
              <Route
                path="/academy"
                element={
                  <RequireTier minTier="pilot_vsd" fallback={<LoginPrompt feature="VSD Academy" />}>
                    <Academy />
                  </RequireTier>
                }
              />

              {/* ── Admin/Staff: AdminRoute è già staff-aware ── */}
              <Route
                path="/admin/import-results"
                element={<AdminRoute><AdminImportResults /></AdminRoute>}
              />
              <Route
                path="/admin/team-dashboard"
                element={<AdminRoute><AdminTeamDashboard /></AdminRoute>}
              />
              <Route
                path="/admin/import-standings"
                element={<AdminRoute><AdminImportStandings /></AdminRoute>}
              />
              <Route
                path="/admin/garage61-sync"
                element={<AdminRoute><AdminGarage61Sync /></AdminRoute>}
              />
              <Route
                path="/admin/posters"
                element={<AdminRoute><AdminPosters /></AdminRoute>}
              />
              <Route
                path="/admin/endurance"
                element={<AdminRoute><AdminEndurance /></AdminRoute>}
              />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
