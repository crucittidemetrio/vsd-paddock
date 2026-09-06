import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import AppShell from './components/layout/AppShell';
import AdminRoute from './components/layout/AdminRoute';
import MessengerRoute from './components/layout/MessengerRoute';
import RequireTier from './components/auth/RequireTier';
import LoginPrompt from './components/auth/LoginPrompt';

// ── Eager: entry point + navigazione primaria ─────────────────
import Login from './pages/Login';
import AuthCallback from './pages/AuthCallback';
import Landing from './pages/Landing';
import Roster from './pages/Roster';
import Race from './pages/Race';
import BestLaps from './pages/BestLaps';
import AdminRaceStints from './pages/AdminRaceStints';
import Results from './pages/Results';
import Calendar from './pages/Calendar';
import ChampionshipsList from './pages/ChampionshipsList';

// ── Lazy: pagine deep, secondarie, admin ──────────────────────
const JoinUs              = lazy(() => import('./pages/JoinUs'));
const MediaKit            = lazy(() => import('./pages/MediaKit'));
const Setup                = lazy(() => import('./pages/Setup'));
const DriverProfile       = lazy(() => import('./pages/DriverProfile'));
const RaceDetail          = lazy(() => import('./pages/RaceDetail'));
const Reports             = lazy(() => import('./pages/Reports'));
const LapsDrilldown       = lazy(() => import('./pages/LapsDrilldown'));
const Training            = lazy(() => import('./pages/Training'));
const FuelEnergy          = lazy(() => import('./pages/FuelEnergy'));
const Academy             = lazy(() => import('./pages/Academy'));
const Endurance           = lazy(() => import('./pages/Endurance'));
const EnduranceDetail     = lazy(() => import('./pages/EnduranceDetail'));
const UE144               = lazy(() => import('./pages/UE144'));
const ChampionshipDetail  = lazy(() => import('./pages/ChampionshipDetail'));
const AdminImportResults  = lazy(() => import('./pages/AdminImportResults'));
const AdminImportLapData  = lazy(() => import('./pages/AdminImportLapData'));
const PaceAnalysis        = lazy(() => import('./pages/PaceAnalysis'));
const PitWall             = lazy(() => import('./pages/PitWall'));
const AdminImportStandings= lazy(() => import('./pages/AdminImportStandings'));
const AdminTeamDashboard  = lazy(() => import('./pages/AdminTeamDashboard'));
const AdminGarage61Sync   = lazy(() => import('./pages/AdminGarage61Sync'));
const AdminPosters        = lazy(() => import('./pages/AdminPosters'));
const AdminEndurance      = lazy(() => import('./pages/AdminEndurance'));
const AdminEnduranceForm  = lazy(() => import('./pages/AdminEnduranceForm'));
const AdminBestLaps = lazy(() => import('./pages/AdminBestLaps'));
const SeasonRecap = lazy(() => import('./pages/SeasonRecap'));
const TeamRecords = lazy(() => import('./pages/TeamRecords'));
const StintPlanner        = lazy(() => import('./pages/StintPlanner'));
const AdminRaces = lazy(() => import('./pages/AdminRaces'));
const Compare    = lazy(() => import('./pages/Compare'));
const Privacy     = lazy(() => import('./pages/Privacy'));
const Terms       = lazy(() => import('./pages/Terms'));
const ConsentForm = lazy(() => import('./pages/ConsentForm'));
const AdminConsents = lazy(() => import('./pages/AdminConsents'));
const AdminAuditLog = lazy(() => import('./pages/AdminAuditLog'));
const AdminHome = lazy(() => import('./pages/AdminHome'));
const AdminCandidates = lazy(() => import('./pages/AdminCandidates'));
const AdminSponsors = lazy(() => import('./pages/AdminSponsors'));
const AdminTeamSessions = lazy(() => import('./pages/AdminTeamSessions'));
const AdminMessenger = lazy(() => import('./pages/AdminMessenger'));
const AdminIncidents = lazy(() => import('./pages/AdminIncidents'));
const AdminTreasury = lazy(() => import('./pages/AdminTreasury'));
const SocialManager = lazy(() => import('./pages/SocialManager'));
const ClashOfClasses = lazy(() => import('./pages/ClashOfClasses'));
const AdminClashResults = lazy(() => import('./pages/AdminClashResults'));
const AciLmgt3Challenge = lazy(() => import('./pages/AciLmgt3Challenge'));
const EraSeason3         = lazy(() => import('./pages/EraSeason3'));

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
            <Route
              path="/admin/social-manager"
              element={
                <RequireTier minTier="admin" fallback={<Navigate to="/" replace />}>
                  <SocialManager />
                </RequireTier>
              }
            />

            {/* ════ Dentro AppShell — sidebar + topbar ════ */}
            <Route element={<AppShell />}>

              {/* ── Pubbliche: accessibili a tutti i tier ── */}
              <Route path="/" element={<Landing />} />
              <Route path="/joinus" element={<JoinUs />} />
              <Route path="/media-kit" element={<MediaKit />} />
              <Route path="/setup" element={<Setup />} />
              <Route path="/roster" element={<Roster />} />
              <Route path="/roster/:driverId" element={<DriverProfile />} />
              <Route path="/race" element={<Race />} />
              <Route path="/race/:raceId" element={<RaceDetail />} />
              <Route path="/calendar" element={<Calendar />} />
              <Route path="/laps" element={<BestLaps />} />
              <Route path="/results" element={<Results />} />
              <Route path="/laps/:sim/:track/:category" element={<LapsDrilldown />} />
              <Route path="/championships" element={<ChampionshipsList />} />
              <Route path="/championships/:championshipId" element={<ChampionshipDetail />} />
              <Route path="/endurance" element={<Endurance />} />
              <Route path="/endurance/:auditionId" element={<EnduranceDetail />} />
              <Route path="/ue144" element={<UE144 />} />
              <Route path="/clash-of-classes" element={<ClashOfClasses />} />
              <Route path="/aci-lmgt3-challenge" element={<AciLmgt3Challenge />} />
              <Route path="/era-season-3" element={<EraSeason3 />} />
              <Route path="/compare" element={<Compare />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />

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
                path="/pace-analysis"
                element={
                  <RequireTier minTier="pilot_vsd" fallback={<LoginPrompt feature="l'Analisi di Passo" />}>
                    <PaceAnalysis />
                  </RequireTier>
                }
              />
              <Route
                path="/pitwall"
                element={
                  <RequireTier minTier="pilot_vsd" fallback={<LoginPrompt feature="il Pit Wall" />}>
                    <PitWall />
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
                  <RequireTier minTier="pilot_vsd" fallback={<LoginPrompt feature="i Punti Merito" />}>
                    <Academy />
                  </RequireTier>
                }
              />
              <Route
                path="/recap"
                element={
                  <RequireTier minTier="pilot_vsd" fallback={<LoginPrompt feature="il Season Recap" />}>
                    <SeasonRecap />
                  </RequireTier>
                }
              />
              <Route
                path="/records"
                element={
                  <RequireTier minTier="pilot_vsd" fallback={<LoginPrompt feature="il Muro dei Record" />}>
                    <TeamRecords />
                  </RequireTier>
                }
              />
              <Route
                path="/carburante-energia"
                element={
                  <RequireTier minTier="pilot_vsd" fallback={<LoginPrompt feature="il pannello Carburante/Energia" />}>
                    <FuelEnergy />
                  </RequireTier>
                }
              />
              <Route
                path="/consenso"
                element={
                  <RequireTier minTier="pilot_vsd" fallback={<LoginPrompt feature="il consenso privacy" />}>
                    <ConsentForm />
                  </RequireTier>
                }
              />
              <Route
                path="/team-sessions"
                element={
                  <RequireTier minTier="pilot_vsd" fallback={<LoginPrompt feature="le sessioni team" />}>
                    <AdminTeamSessions />
                  </RequireTier>
                }
              />

              {/* ── Admin/Staff: AdminRoute è già staff-aware ── */}
              <Route
                path="/admin/import-results"
                element={<AdminRoute><AdminImportResults /></AdminRoute>}
              />
              <Route
                path="/admin/import-lap-data"
                element={<AdminRoute><AdminImportLapData /></AdminRoute>}
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
                path="/admin/best-laps"
                element={<AdminRoute><AdminBestLaps /></AdminRoute>}
              />
              <Route
                path="/admin/endurance"
                element={<AdminRoute><AdminEndurance /></AdminRoute>}
              />
              <Route
                path="/admin/endurance/new"
                element={<AdminRoute><AdminEnduranceForm /></AdminRoute>}
              />
              <Route
                path="/admin/endurance/:auditionId/edit"
                element={<AdminRoute><AdminEnduranceForm /></AdminRoute>}
              />
              <Route
                path="/admin/race/:raceId/stints"
                element={<AdminRoute><AdminRaceStints /></AdminRoute>}
              />
              <Route
                path="/admin/race/:raceId/stint-planner"
                element={<AdminRoute><StintPlanner /></AdminRoute>}
              />
              <Route
                path="/admin/races"
                element={<AdminRoute><AdminRaces /></AdminRoute>}
              />
              <Route
                path="/admin/clash-results"
                element={<AdminRoute><AdminClashResults /></AdminRoute>}
              />
              <Route
                path="/admin/consents"
                element={<AdminRoute><AdminConsents /></AdminRoute>}
              />
              <Route
                path="/admin/audit-log"
                element={<AdminRoute><AdminAuditLog /></AdminRoute>}
              />
              <Route
                path="/admin"
                element={<AdminRoute><AdminHome /></AdminRoute>}
              />
              <Route
                path="/admin/candidates"
                element={<AdminRoute><AdminCandidates /></AdminRoute>}
              />
              <Route
                path="/admin/sponsors"
                element={<AdminRoute><AdminSponsors /></AdminRoute>}
              />
              <Route
                path="/admin/messenger"
                element={<MessengerRoute><AdminMessenger /></MessengerRoute>}
              />
              <Route
                path="/admin/incidents"
                element={<AdminRoute><AdminIncidents /></AdminRoute>}
              />
              {/* Dato finanziario — solo admin/Team Principal, non staff generico */}
              <Route
                path="/admin/treasury"
                element={
                  <RequireTier minTier="admin" fallback={<Navigate to="/admin" replace />}>
                    <AdminTreasury />
                  </RequireTier>
                }
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

