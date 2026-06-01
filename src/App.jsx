import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import AppShell from './components/layout/AppShell';
import ProtectedRoute from './components/layout/ProtectedRoute';
import AdminRoute from './components/layout/AdminRoute';

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
const ChampionshipDetail  = lazy(() => import('./pages/ChampionshipDetail'));
const AdminImportResults  = lazy(() => import('./pages/AdminImportResults'));
const AdminImportStandings= lazy(() => import('./pages/AdminImportStandings'));
const AdminTeamDashboard  = lazy(() => import('./pages/AdminTeamDashboard'));
const AdminGarage61Sync   = lazy(() => import('./pages/AdminGarage61Sync'));
const AdminPosters        = lazy(() => import('./pages/AdminPosters'));

import './App.css';

// Fallback minimale durante il caricamento di una chunk lazy
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
            {/* Pubbliche */}
            <Route path="/login" element={<Login />} />
            <Route path="/joinus" element={<JoinUs />} />
            <Route path="/auth/callback" element={<AuthCallback />} />

            {/* Protette: usano lo shell con sidebar+topbar */}
            <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
              <Route path="/" element={<Landing />} />
              <Route path="/roster" element={<Roster />} />
              <Route path="/roster/:driverId" element={<DriverProfile />} />
              <Route path="/race" element={<Race />} />
              <Route path="/race/:raceId" element={<RaceDetail />} />
              <Route path="/calendar" element={<Calendar />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/laps" element={<BestLaps />} />
              <Route path="/laps/:sim/:track/:category" element={<LapsDrilldown />} />
              <Route path="/training" element={<Training />} />
              <Route path="/academy" element={<Academy />} />
              <Route path="/endurance" element={<Endurance />} />

              {/* Championships — Wave 9.9 */}
              <Route path="/championships" element={<ChampionshipsList />} />
              <Route
                path="/championships/:championshipId"
                element={<ChampionshipDetail />}
              />

              {/* Admin only — Wave 9.8 + 9.10 */}
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
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
