import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

/**
 * Guard dedicato a /admin/messenger — distinto da AdminRoute (che
 * gate-a su isStaff, cioè tutta l'area admin). Il compilatore
 * messaggi Discord ha un permesso più stretto: isStaff OPPURE
 * canMessage (colonna can_message su Drivers, vedi AuthContext).
 * Così un pilota abilitato al solo Messenger non sblocca Best Laps,
 * Gestione Gare, Import Risultati, Candidature, Sponsor, Incidenti...
 * (Task #102 — la promozione a staff era troppo permissiva).
 */
export default function MessengerRoute({ children }) {
  const { isStaff, canMessage, loading } = useAuth();

  if (loading) return null;
  if (!isStaff && !canMessage) return <Navigate to="/" replace />;

  return children;
}
