import { useState } from 'react';
import { ChevronLeft, ChevronRight, MessageCircle, Plus, StickyNote } from 'lucide-react';
import { Badge, Button, Card, ConfirmModal, EmptyState, ErrorBox, PageHeader, Spinner } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { addDays, formatDateLong, formatMoney, formatPhone, formatTime, STATUS_LABEL, todayInZone, whatsappLink, zonedToIso } from '../../lib/format';
import { errorMessage, supabase, unwrap } from '../../lib/supabase';
import { useLoad } from '../../lib/useLoad';
import type { AppointmentStatus, AppointmentWithRelations, Professional, Service } from '../../types/database';
import { NewAppointmentModal, NotesModal, RescheduleModal, type AgendaCatalog } from './AppointmentModals';
import { useEstablishment } from './EstablishmentContext';

export const STATUS_TONE: Record<AppointmentStatus, 'yellow' | 'blue' | 'green' | 'red' | 'gray'> = {
  pending: 'yellow',
  confirmed: 'blue',
  completed: 'green',
  cancelled: 'red',
  no_show: 'gray',
};

interface PendingAction {
  appointment: AppointmentWithRelations;
  status: AppointmentStatus;
  title: string;
  message: string;
  danger: boolean;
}

export function AppointmentsPage() {
  const { establishment, can } = useEstablishment();
  const toast = useToast();
  const tz = establishment.timezone;
  const [date, setDate] = useState(() => todayInZone(tz));
  const [professionalFilter, setProfessionalFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [rescheduling, setRescheduling] = useState<AppointmentWithRelations | null>(null);
  const [notesFor, setNotesFor] = useState<AppointmentWithRelations | null>(null);
  const [action, setAction] = useState<PendingAction | null>(null);
  const [working, setWorking] = useState(false);

  const catalog = useLoad<AgendaCatalog>(async () => {
    const [services, professionals, links] = await Promise.all([
      supabase.from('services').select('*').eq('establishment_id', establishment.id).order('name'),
      supabase.from('professionals').select('*').eq('establishment_id', establishment.id).order('name'),
      supabase.from('professional_services').select('professional_id, service_id').eq('establishment_id', establishment.id),
    ]);
    return {
      services: unwrap<Service[]>(services),
      professionals: unwrap<Professional[]>(professionals),
      links: unwrap<AgendaCatalog['links']>(links),
    };
  }, [establishment.id]);

  const list = useLoad(async () => {
    let query = supabase
      .from('appointments')
      .select('*, customer:customers(id, name, phone), service:services(id, name, duration_minutes), professional:professionals(id, name)')
      .eq('establishment_id', establishment.id)
      .gte('starts_at', zonedToIso(date, '00:00', tz))
      .lt('starts_at', zonedToIso(addDays(date, 1), '00:00', tz))
      .order('starts_at');
    if (professionalFilter) query = query.eq('professional_id', professionalFilter);
    if (statusFilter) query = query.eq('status', statusFilter);
    return unwrap<AppointmentWithRelations[]>(await query);
  }, [establishment.id, date, professionalFilter, statusFilter, tz]);

  function ask(appointment: AppointmentWithRelations, status: AppointmentStatus) {
    const who = appointment.customer?.name ?? 'cliente';
    const when = formatTime(appointment.starts_at, tz);
    const texts: Record<AppointmentStatus, [string, string]> = {
      confirmed: ['Confirmar agendamento', `Confirmar o horário das ${when} de ${who}?`],
      completed: ['Concluir atendimento', `Marcar o atendimento das ${when} de ${who} como concluído?`],
      cancelled: ['Cancelar agendamento', `Cancelar o horário das ${when} de ${who}? O horário volta a ficar disponível.`],
      no_show: ['Registrar falta', `Registrar que ${who} não compareceu às ${when}? O horário volta a ficar disponível.`],
      pending: ['Voltar para pendente', `Voltar o agendamento de ${who} para pendente?`],
    };
    setAction({ appointment, status, title: texts[status][0], message: texts[status][1], danger: status === 'cancelled' || status === 'no_show' });
  }

  async function runAction() {
    if (!action) return;
    setWorking(true);
    try {
      const patch: Record<string, unknown> = { status: action.status };
      if (action.status === 'cancelled') patch.cancellation_reason = 'Cancelado pelo estabelecimento';
      unwrap(await supabase.from('appointments').update(patch).eq('id', action.appointment.id));
      toast.success('Agendamento atualizado.');
      setAction(null);
      await list.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setWorking(false);
    }
  }

  const today = todayInZone(tz);

  return (
    <>
      <PageHeader
        title="Agenda"
        description="Agendamentos do dia, por profissional e status."
        actions={
          can('manage_appointments') && catalog.data ? (
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
              Novo agendamento
            </Button>
          ) : undefined
        }
      />

      <Card className="mb-4 p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setDate(addDays(date, -1))} aria-label="Dia anterior" icon={<ChevronLeft className="h-4 w-4" />} />
            <input type="date" className="input w-auto" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
            <Button variant="secondary" size="sm" onClick={() => setDate(addDays(date, 1))} aria-label="Próximo dia" icon={<ChevronRight className="h-4 w-4" />} />
            {date !== today && (
              <Button variant="ghost" size="sm" onClick={() => setDate(today)}>
                Hoje
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 lg:flex">
            <select className="input lg:w-48" value={professionalFilter} onChange={(e) => setProfessionalFilter(e.target.value)} aria-label="Filtrar por profissional">
              <option value="">Todos os profissionais</option>
              {catalog.data?.professionals.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select className="input lg:w-44" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filtrar por status">
              <option value="">Todos os status</option>
              {(Object.keys(STATUS_LABEL) as AppointmentStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="mt-2 text-sm font-medium capitalize text-slate-700">{formatDateLong(date)}</p>
      </Card>

      {list.loading && <Spinner />}
      {list.error && <ErrorBox message={list.error} onRetry={() => void list.reload()} />}
      {!list.loading && !list.error && list.data && list.data.length === 0 && (
        <EmptyState title="Nenhum agendamento nesta data" description="Os horários reservados pela página pública ou criados pela equipe aparecem aqui." />
      )}
      {!list.loading && !list.error && list.data && list.data.length > 0 && (
        <div className="space-y-3">
          {list.data.map((a) => {
            const open = a.status === 'pending' || a.status === 'confirmed';
            return (
              <Card key={a.id} className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex gap-4">
                    <div className="w-14 shrink-0 text-center">
                      <p className="text-lg font-semibold tabular-nums text-slate-900">{formatTime(a.starts_at, tz)}</p>
                      <p className="text-xs tabular-nums text-slate-500">{formatTime(a.ends_at, tz)}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">{a.customer?.name ?? 'Cliente'}</p>
                      <p className="text-sm text-slate-600">
                        {a.service?.name} · {a.professional?.name} · {formatMoney(a.price_cents)}
                      </p>
                      {a.customer?.phone && (
                        <a
                          href={whatsappLink(a.customer.phone)}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-sm text-emerald-700 hover:underline"
                        >
                          <MessageCircle className="h-4 w-4" />
                          {formatPhone(a.customer.phone)}
                        </a>
                      )}
                      {a.admin_notes && <p className="mt-1 text-xs text-slate-500">Obs.: {a.admin_notes}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {a.source === 'public' && <Badge>Online</Badge>}
                    <Badge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  {a.status === 'pending' && (
                    <Button size="sm" onClick={() => ask(a, 'confirmed')}>
                      Confirmar
                    </Button>
                  )}
                  {a.status === 'confirmed' && (
                    <>
                      <Button size="sm" onClick={() => ask(a, 'completed')}>
                        Concluir
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => ask(a, 'no_show')}>
                        Não compareceu
                      </Button>
                    </>
                  )}
                  {open && (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => setRescheduling(a)} disabled={!catalog.data}>
                        Reagendar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => ask(a, 'cancelled')}>
                        Cancelar
                      </Button>
                    </>
                  )}
                  <Button size="sm" variant="ghost" icon={<StickyNote className="h-4 w-4" />} onClick={() => setNotesFor(a)}>
                    Observações
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {creating && catalog.data && (
        <NewAppointmentModal
          establishment={establishment}
          catalog={catalog.data}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            void list.reload();
          }}
        />
      )}
      {rescheduling && catalog.data && (
        <RescheduleModal
          establishment={establishment}
          catalog={catalog.data}
          appointment={rescheduling}
          onClose={() => setRescheduling(null)}
          onSaved={() => {
            setRescheduling(null);
            void list.reload();
          }}
        />
      )}
      {notesFor && (
        <NotesModal
          appointment={notesFor}
          onClose={() => setNotesFor(null)}
          onSaved={() => {
            setNotesFor(null);
            void list.reload();
          }}
        />
      )}
      <ConfirmModal
        open={action !== null}
        title={action?.title ?? ''}
        message={action?.message ?? ''}
        danger={action?.danger}
        loading={working}
        onConfirm={() => void runAction()}
        onClose={() => setAction(null)}
      />
    </>
  );
}
