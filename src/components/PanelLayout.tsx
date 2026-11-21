import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { CalendarCheck, LogOut, Menu, Moon, Sun, X } from 'lucide-react';
import { useAuth } from '../modules/auth/AuthContext';

export interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
}

interface Props {
  title: string;
  subtitle?: string;
  items: NavItem[];
  banner?: ReactNode;
  extra?: ReactNode;
}

const PANEL_MODE_KEY = 'agenda.panelMode';

function readPanelDark(): boolean {
  try {
    const saved = window.localStorage.getItem(PANEL_MODE_KEY);
    if (saved === 'dark' || saved === 'light') return saved === 'dark';
  } catch {
    // sem armazenamento: segue o sistema
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
}

/** Botão claro/escuro do painel (a escolha fica salva neste aparelho). */
function ModeButton({ dark, onToggle, compact = false }: { dark: boolean; onToggle: () => void; compact?: boolean }) {
  const label = dark ? 'Modo claro' : 'Modo escuro';
  if (compact) {
    return (
      <button type="button" onClick={onToggle} className="rounded-lg p-2 text-slate-700 hover:bg-slate-100" aria-label={`Ativar ${label.toLowerCase()}`} aria-pressed={dark}>
        {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={dark}
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
    >
      <span className="flex items-center gap-3">
        {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        {label}
      </span>
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition ${dark ? 'bg-slate-900' : 'bg-slate-300'}`} aria-hidden>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${dark ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

/** Estrutura dos painéis: navegação lateral no desktop, gaveta no celular. */
export function PanelLayout({ title, subtitle, items, banner, extra }: Props) {
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(readPanelDark);
  const { profile, signOut } = useAuth();

  useEffect(() => {
    try {
      window.localStorage.setItem(PANEL_MODE_KEY, dark ? 'dark' : 'light');
    } catch {
      // ignora: a escolha vale até fechar a página
    }
    // fundo do navegador (rolagem além da página) acompanha o modo
    document.body.style.backgroundColor = dark ? '#0b1120' : '';
    return () => {
      document.body.style.backgroundColor = '';
    };
  }, [dark]);

  const toggleDark = () => setDark((d) => !d);
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate('/login', { replace: true });
  }

  const nav = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-5 py-5">
        <CalendarCheck className="h-6 w-6 shrink-0 text-slate-900" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{title}</p>
          {subtitle && <p className="truncate text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`
            }
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>
      {extra && <div className="px-3 py-2">{extra}</div>}
      <div className="border-t border-slate-200 p-3">
        <div className="mb-2">
          <ModeButton dark={dark} onToggle={toggleDark} />
        </div>
        <p className="truncate px-3 text-xs text-slate-500">{profile?.full_name || profile?.email}</p>
        <button
          type="button"
          onClick={() => void handleSignOut()}
          className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen lg:flex ${dark ? 'panel-dark' : ''}`}>
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:fixed lg:inset-y-0 lg:block">{nav}</aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <CalendarCheck className="h-5 w-5 shrink-0" />
          <span className="truncate text-sm font-semibold">{title}</span>
        </div>
        <div className="flex items-center gap-1">
          <ModeButton dark={dark} onToggle={toggleDark} compact />
          <button type="button" onClick={() => setOpen(true)} className="rounded-lg p-2 text-slate-700 hover:bg-slate-100" aria-label="Abrir menu">
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-xl">
            <button type="button" onClick={() => setOpen(false)} className="absolute right-2 top-4 rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Fechar menu">
              <X className="h-5 w-5" />
            </button>
            {nav}
          </div>
        </div>
      )}

      <main className="min-w-0 flex-1 lg:pl-64">
        {banner}
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
