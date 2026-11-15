import { useCallback, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CalendarCheck, MessageCircle, Share2 } from 'lucide-react';
import { SlotPicker } from '../../components/SlotPicker';
import { Badge, Button, Card, ConfirmModal, ErrorBox, Spinner } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { formatDate, formatMoney, formatTime, STATUS_LABEL, whatsappLink } from '../../lib/format';
import { errorMessage, supabase, unwrap } from '../../lib/supabase';
import { useLoad } from '../../lib/useLoad';
import type { AppointmentStatus, PublicAppointment, Slot } from '../../types/database';
import { appointmentMessage, fetchPublicAppointment, fetchPublicSlots, readSavedTokens } from './publicApi';

const TONE: Record<AppointmentStatus, 'yellow' | 'blue' | 'green' | 'red' | 'gray'> = {
  pending: 'yellow',
  confirmed: 'blue',
  completed: 'green',
  cancelled: 'red',
  no_show: 'gray',
};

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-lg">
        <Link to="/" className="mb-6 flex items-center gap-2 text-slate-900">
          <CalendarCheck className="h-6 w-6" />
          <span className="font-semibold">Agenda</span>
        </Link>
        {children}
      </div>
    </div>
  );
}

/** Consulta, cancelamento e reagendamento pelo código secreto do agendamento. */
export function AppointmentPage() {
  const { token = '' } = useParams();
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => fetchPublicAppointment(token), [token]);
  const [current, setCurrent] = useState<PublicAppointment | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [working, setWorking] = useState(false);

  const appointment = current ?? data;
  const slug = appointment?.establishment.slug ?? '';
  const serviceId = appointment?.service.id ?? '';
  const loadSlots = useCallback((date: string) => fetchPublicSlots(slug, serviceId, date, null), [slug, serviceId]);

  if (loading) {
    return (
      <Shell>
        <Spinner />
      </Shell>
    );
  }
  if (error) {
    return (
      <Shell>
        <ErrorBox message={error} onRetry={() => void reload()} />
      </Shell>
    );
  }
  if (!appointment) {
    return (
      <Shell>
        <Card className="p-6 text-center">
          <h1 className="text-lg font-semibold text-slate-900">Agendamento não encontrado</h1>
          <p className="mt-2 text-sm text-slate-600">Confira se o link ou código está completo.</p>
          <Link to="/meus-agendamentos" className="mt-4 inline-block text-sm font-medium text-slate-900 underline">
            Consultar com outro código
          </Link>
        </Card>
      </Shell>
    );
  }

  const tz = appointment.establishment.timezone;
  const est = appointment.establishment;

  async function handleCancel() {
    setWorking(true);
    try {
      setCurrent(unwrap<PublicAppointment>(await supabase.rpc('cancel_public_appointment', { p_token: token })));
      toast.success('Agendamento cancelado.');
      setConfirmCancel(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setWorking(false);
    }
  }

  async function handleReschedule() {
    if (!slot) return;
    setWorking(true);
    try {
      setCurrent(
        unwrap<PublicAppointment>(await supabase.rpc('reschedule_public_appointment', { p_token: token, p_starts_at: slot.slot_start })),
      );
      toast.success('Agendamento reagendado.');
      setRescheduling(false);
      setSlot(null);
    } catch (err) {
      toast.error(errorMessage(err));
      setSlot(null);
    } finally {
      setWorking(false);
    }
  }

  const open = appointment.status === 'pending' || appointment.status === 'confirmed';

  return (
    <Shell>
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">{est.name}</p>
            <h1 className="text-lg font-semibold text-slate-900">{appointment.service.name}</h1>
          </div>
          <Badge tone={TONE[appointment.status]}>{STATUS_LABEL[appointment.status]}</Badge>
        </div>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Data</dt>
            <dd className="text-right font-medium capitalize">{formatDate(appointment.starts_at, tz)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Horário</dt>
            <dd className="text-right font-medium">
              {formatTime(appointment.starts_at, tz)} – {formatTime(appointment.ends_at, tz)}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Profissional</dt>
            <dd className="text-right font-medium">{appointment.professional.name}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Cliente</dt>
            <dd className="text-right font-medium">{appointment.customer_name}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Valor</dt>
            <dd className="text-right font-medium">{formatMoney(appointment.price_cents)}</dd>
          </div>
          {est.address && (
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Endereço</dt>
              <dd className="text-right">{[est.address, est.city, est.state].filter(Boolean).join(' · ')}</dd>
            </div>
          )}
        </dl>

        {rescheduling ? (
          <div className="mt-5 border-t border-slate-200 pt-4">
            <p className="mb-3 text-sm font-medium text-slate-900">Escolha o novo horário</p>
            <SlotPicker timeZone={tz} maxDays={est.max_advance_days} loadSlots={loadSlots} value={slot} onChange={setSlot} />
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="secondary"
                disabled={working}
                onClick={() => {
                  setRescheduling(false);
                  setSlot(null);
                }}
              >
                Voltar
              </Button>
              <Button disabled={!slot} loading={working} onClick={() => void handleReschedule()}>
                Confirmar novo horário
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-2 border-t border-slate-200 pt-4">
            {appointment.can_change && (
              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="secondary" onClick={() => setRescheduling(true)}>
                  Reagendar
                </Button>
                <Button variant="danger" onClick={() => setConfirmCancel(true)}>
                  Cancelar agendamento
                </Button>
              </div>
            )}
            {open && !appointment.can_change && (
              <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                O prazo para alterar este agendamento pela internet terminou. Fale com o estabelecimento.
              </p>
            )}
            {open && est.whatsapp && (
              <a
                href={whatsappLink(est.whatsapp, appointmentMessage(appointment, 'Olá! Gostaria de cancelar ou reagendar este agendamento:'))}
                target="_blank"
                rel="noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
              >
                <MessageCircle className="h-4 w-4" />
                Solicitar alteração pelo WhatsApp
              </a>
            )}
            <a
              href={`https://wa.me/?text=${encodeURIComponent(appointmentMessage(appointment, `Meu agendamento em ${est.name}:`))}`}
              target="_blank"
              rel="noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              <Share2 className="h-4 w-4" />
              Compartilhar detalhes
            </a>
          </div>
        )}
      </Card>

      <p className="mt-4 text-center text-sm">
        <Link to={`/agendar/${est.slug}`} className="text-slate-600 underline hover:text-slate-900">
          Fazer novo agendamento em {est.name}
        </Link>
      </p>

      <ConfirmModal
        open={confirmCancel}
        title="Cancelar agendamento"
        message="Tem certeza? O horário será liberado para outros clientes."
        confirmLabel="Cancelar agendamento"
        danger
        loading={working}
        onConfirm={() => void handleCancel()}
        onClose={() => setConfirmCancel(false)}
      />
    </Shell>
  );
}

/** Lista os agendamentos feitos neste aparelho e permite consultar por código. */
export function MyAppointmentsPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const { data, loading } = useLoad(async () => {
    const results = await Promise.all(readSavedTokens().map((t) => fetchPublicAppointment(t).catch(() => null)));
    return results
      .filter((a): a is PublicAppointment => a !== null)
      .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime());
  }, []);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    // aceita o código ou o link completo colado
    const token = code.trim().split('/').filter(Boolean).pop() ?? '';
    if (token) navigate(`/agendamento/${token}`);
  }

  return (
    <Shell>
      <h1 className="text-xl font-semibold text-slate-900">Meus agendamentos</h1>
      <p className="mt-1 text-sm text-slate-500">Agendamentos feitos neste aparelho. Para consultar outro, cole o link ou código recebido na confirmação.</p>

      <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
        <input className="input" placeholder="Link ou código do agendamento" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Link ou código do agendamento" />
        <Button type="submit" disabled={!code.trim()}>
          Consultar
        </Button>
      </form>

      <div className="mt-6 space-y-3">
        {loading && <Spinner />}
        {!loading && (data ?? []).length === 0 && (
          <Card className="p-6 text-center text-sm text-slate-600">Nenhum agendamento encontrado neste aparelho.</Card>
        )}
        {!loading &&
          (data ?? []).map((a) => (
            <Link key={a.id} to={`/agendamento/${a.public_token}`} className="block">
              <Card className="p-4 transition hover:border-slate-400">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{a.service.name}</p>
                    <p className="truncate text-sm text-slate-600">{a.establishment.name}</p>
                    <p className="mt-1 text-sm capitalize text-slate-700">
                      {formatDate(a.starts_at, a.establishment.timezone)} às {formatTime(a.starts_at, a.establishment.timezone)}
                    </p>
                  </div>
                  <Badge tone={TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
                </div>
              </Card>
            </Link>
          ))}
      </div>
    </Shell>
  );
}
