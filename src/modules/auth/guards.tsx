import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Spinner } from '../../components/ui';
import { useAuth } from './AuthContext';

// Estes guards só organizam a navegação. A proteção real dos dados é
// feita pelas políticas RLS no banco: mesmo que alguém force uma rota,
// o Supabase não devolve nada que o usuário não possa ver.

function FullScreenSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner />
    </div>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, session } = useAuth();
  const location = useLocation();
  if (loading) return <FullScreenSpinner />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

export function RequireSuperAdmin({ children }: { children: ReactNode }) {
  const { loading, session, profile } = useAuth();
  if (loading) return <FullScreenSpinner />;
  if (!session) return <Navigate to="/login" replace />;
  if (!profile?.is_super_admin) return <Navigate to="/painel" replace />;
  return <>{children}</>;
}

export function RequireMembership({ children }: { children: ReactNode }) {
  const { loading, session, profile, memberships } = useAuth();
  if (loading) return <FullScreenSpinner />;
  if (!session) return <Navigate to="/login" replace />;
  if (memberships.length === 0) return <Navigate to={profile?.is_super_admin ? '/admin' : '/sem-acesso'} replace />;
  return <>{children}</>;
}
