import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import type { Establishment, Membership, Permission } from '../../types/database';

interface EstablishmentState {
  membership: Membership;
  establishment: Establishment;
  memberships: Membership[];
  /** espelha has_permission() do banco, apenas para montar a interface */
  can: (permission: Permission) => boolean;
  select: (establishmentId: string) => void;
  /** recarrega os dados do estabelecimento após salvar configurações */
  refresh: () => Promise<void>;
}

const EstablishmentContext = createContext<EstablishmentState | null>(null);
const STORAGE_KEY = 'agenda.establishment';

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function EstablishmentProvider({ children }: { children: ReactNode }) {
  const { memberships, refresh } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(readStored);

  const membership = memberships.find((m) => m.establishment.id === selectedId) ?? memberships[0];

  const select = useCallback((establishmentId: string) => {
    setSelectedId(establishmentId);
    try {
      window.localStorage.setItem(STORAGE_KEY, establishmentId);
    } catch {
      // armazenamento indisponível: a escolha vale só nesta sessão
    }
  }, []);

  const value = useMemo<EstablishmentState | null>(() => {
    if (!membership) return null;
    const full = membership.role === 'owner' || membership.role === 'admin';
    return {
      membership,
      establishment: membership.establishment,
      memberships,
      can: (permission) => full || membership.permissions[permission] === true,
      select,
      refresh,
    };
  }, [membership, memberships, select, refresh]);

  if (!value) return null;
  return <EstablishmentContext.Provider value={value}>{children}</EstablishmentContext.Provider>;
}

export function useEstablishment(): EstablishmentState {
  const ctx = useContext(EstablishmentContext);
  if (!ctx) throw new Error('useEstablishment precisa estar dentro de EstablishmentProvider');
  return ctx;
}
