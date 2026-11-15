import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, unwrap } from '../../lib/supabase';
import type { Membership, Profile } from '../../types/database';

interface AuthState {
  /** true até sabermos se há sessão e carregarmos perfil/vínculos */
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  memberships: Membership[];
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

async function loadAccount(userId: string): Promise<{ profile: Profile | null; memberships: Membership[] }> {
  const [profileResult, membershipResult] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email, phone, is_super_admin').eq('id', userId).maybeSingle(),
    supabase
      .from('establishment_users')
      .select('id, role, permissions, professional_id, establishment:establishments(*)')
      .eq('user_id', userId)
      .eq('is_active', true),
  ]);
  const profile = unwrap<Profile | null>(profileResult);
  const memberships = unwrap<Membership[]>(membershipResult).filter((m) => m.establishment);
  return { profile, memberships };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [accountUserId, setAccountUserId] = useState<string | null | undefined>(undefined);

  const userId = session?.user.id ?? null;

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionReady(true);
    });
    // Importante: não fazer chamadas ao Supabase dentro deste callback.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setSessionReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setMemberships([]);
      setAccountUserId(null);
      return;
    }
    try {
      const account = await loadAccount(userId);
      setProfile(account.profile);
      setMemberships(account.memberships);
    } catch {
      setProfile(null);
      setMemberships([]);
    } finally {
      setAccountUserId(userId);
    }
  }, [userId]);

  useEffect(() => {
    if (sessionReady) void refresh();
  }, [sessionReady, refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      loading: !sessionReady || accountUserId !== userId,
      session,
      profile,
      memberships,
      signIn,
      signOut,
      refresh,
    }),
    [sessionReady, accountUserId, userId, session, profile, memberships, signIn, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de AuthProvider');
  return ctx;
}

/** Para onde mandar o usuário logo após o login. */
export function homePathFor(profile: Profile | null, memberships: Membership[]): string {
  if (profile?.is_super_admin) return '/admin';
  if (memberships.length > 0) return '/painel';
  return '/sem-acesso';
}
