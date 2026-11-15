import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { CalendarCheck } from 'lucide-react';
import { Button, Field } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { errorMessage, isSupabaseConfigured, supabase } from '../../lib/supabase';
import { homePathFor, useAuth } from './AuthContext';

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2 text-slate-900">
          <CalendarCheck className="h-7 w-7" />
          <span className="text-lg font-semibold">Agenda</span>
        </Link>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
          <p className="mb-5 mt-1 text-sm text-slate-500">{subtitle}</p>
          {!isSupabaseConfigured && (
            <p className="mb-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
              Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env para conectar ao Supabase.
            </p>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { loading, session, profile, memberships, signIn } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!loading && session) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from ?? homePathFor(profile, memberships)} replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title="Entrar" subtitle="Acesse o painel do seu estabelecimento.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="E-mail">
          <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Senha">
          <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" loading={submitting} className="w-full">
          Entrar
        </Button>
        <p className="text-center text-sm">
          <Link to="/recuperar-senha" className="text-slate-600 underline hover:text-slate-900">
            Esqueci minha senha
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
    setSubmitting(false);
    if (resetError) setError(errorMessage(resetError));
    else setSent(true);
  }

  return (
    <AuthShell title="Recuperar senha" subtitle="Enviaremos um link para você criar uma nova senha.">
      {sent ? (
        <div className="space-y-4 text-sm text-slate-600">
          <p>Se existir uma conta com este e-mail, o link de recuperação foi enviado. Confira sua caixa de entrada e o spam.</p>
          <Link to="/login" className="font-medium text-slate-900 underline">
            Voltar para o login
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="E-mail">
            <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" loading={submitting} className="w-full">
            Enviar link
          </Button>
          <p className="text-center text-sm">
            <Link to="/login" className="text-slate-600 underline hover:text-slate-900">
              Voltar para o login
            </Link>
          </p>
        </form>
      )}
    </AuthShell>
  );
}

/** Destino dos links de recuperação de senha e dos convites por e-mail. */
export function ResetPasswordPage() {
  const { loading, session, profile, memberships } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waited, setWaited] = useState(false);

  // o Supabase leva um instante para trocar o token do link por uma sessão
  useEffect(() => {
    const timer = window.setTimeout(() => setWaited(true), 2500);
    return () => window.clearTimeout(timer);
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (password.length < 8) return setError('A senha deve ter pelo menos 8 caracteres.');
    if (password !== confirm) return setError('As senhas não conferem.');
    setSubmitting(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (updateError) return setError(errorMessage(updateError));
    toast.success('Senha definida com sucesso.');
    navigate(homePathFor(profile, memberships), { replace: true });
  }

  const hasSession = Boolean(session);

  return (
    <AuthShell title="Definir nova senha" subtitle="Escolha uma senha com pelo menos 8 caracteres.">
      {!hasSession && (loading || !waited) && <p className="text-sm text-slate-500">Validando o link…</p>}
      {!hasSession && !loading && waited && (
        <div className="space-y-4 text-sm text-slate-600">
          <p>Este link é inválido ou expirou. Solicite um novo link de recuperação.</p>
          <Link to="/recuperar-senha" className="font-medium text-slate-900 underline">
            Solicitar novo link
          </Link>
        </div>
      )}
      {hasSession && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Nova senha">
            <input className="input" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="Confirmar senha">
            <input className="input" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" loading={submitting} className="w-full">
            Salvar senha
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

export function NoAccessPage() {
  const { signOut, profile } = useAuth();
  return (
    <AuthShell title="Sem acesso" subtitle="Sua conta não está vinculada a nenhum estabelecimento ativo.">
      <p className="mb-4 text-sm text-slate-600">
        {profile?.email ? `Conta: ${profile.email}. ` : ''}Peça ao responsável pelo estabelecimento para liberar seu acesso.
      </p>
      <Button variant="secondary" className="w-full" onClick={() => void signOut()}>
        Sair
      </Button>
    </AuthShell>
  );
}
