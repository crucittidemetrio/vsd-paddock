import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

/**
 * Guard route per pagine admin-only.
 * Assume che il parent sia già ProtectedRoute (utente autenticato).
 * Se non admin, redirect a /.
 */
export default function AdminRoute({ children }) {
  const { isStaff, loading } = useAuth();

  if (loading) return null;
  if (!isStaff) return <Navigate to="/" replace />;

  return children;
}