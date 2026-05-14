import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import AppShell from './components/layout/AppShell';
import ProtectedRoute from './components/layout/ProtectedRoute';

import Login from './pages/Login';
import JoinUs from './pages/JoinUs';
import Landing from './pages/Landing';
import Roster from './pages/Roster';
import DriverProfile from './pages/DriverProfile';
import Race from './pages/Race';
import RaceDetail from './pages/RaceDetail';
import Reports from './pages/Reports';
import BestLaps from './pages/BestLaps';
import Training from './pages/Training';
import Academy from './pages/Academy';
import Endurance from './pages/Endurance';
import AdminImportResults from './pages/AdminImportResults';
import AdminRoute from './components/layout/AdminRoute';
import ChampionshipDetail from './pages/ChampionshipDetail';
import AdminImportStandings from './pages/AdminImportStandings';

import './App.css';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Pubbliche */}
          <Route path="/login" element={<Login />} />
          <Route path="/joinus" element={<JoinUs />} />

          {/* Protette: usano lo shell con sidebar+topbar */}
          <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
            <Route path="/" element={<Landing />} />
            <Route path="/roster" element={<Roster />} />
            <Route path="/roster/:driverId" element={<DriverProfile />} />
            <Route path="/race" element={<Race />} />
            <Route path="/race/:raceId" element={<RaceDetail />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/laps" element={<BestLaps />} />
            <Route path="/training" element={<Training />} />
            <Route path="/academy" element={<Academy />} />
            <Route path="/endurance" element={<Endurance />} />
            
            {/* Admin only — Wave 9.8 */}
            <Route
              path="/admin/import-results"
              element={<AdminRoute><AdminImportResults /></AdminRoute>}
            />
<Route
          path="/admin/import-standings"
          element={<AdminRoute><AdminImportStandings /></AdminRoute>}
        />
            {/* Championships — Wave 9.9 */}
            <Route
              path="/championships/:championshipId"
              element={<ChampionshipDetail />}
            />
          </Route>
          
          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}