import { useCallback, useState, type FormEvent } from 'react';
import { Button, Field, Modal } from '../../components/ui';
import { SlotPicker } from '../../components/SlotPicker';
import { useToast } from '../../components/Toast';
import { formatDateTime, formatPhone, onlyDigits } from '../../lib/format';
import { errorMessage, supabase, unwrap } from '../../lib/supabase';
import { useLoad } from '../../lib/useLoad';
import type { AppointmentWithRelations, Customer, Establishment, Professional, Service, Slot } from '../../types/database';

export interface AgendaCatalog {
  services: Service[];
  professionals: Professional[];
  /** pares profissional × serviço */
  links: { professional_id: string; service_id: string }[];
}

function professionalsFor(catalog: AgendaCatalog, serviceId: string): Professional[] {
  const ids = new Set(catalog.links.filter((l) => l.service_id === serviceId).map((l) => l.professional_id));
  return catalog.professionals.filter((p) => p.is_active && ids.has(p.id));
}

async function loadAdminSlots(establishmentId: string, serviceId: string, date: string, professionalId: string, ignoreId: string | null): Promise<Slot[]> {
  return unwrap<Slot[]>(
    await supabase.rpc('get_available_slots_admin', {
      p_establishment_id: establishmentId,
      p_service_id: serviceId,
      p_date: date,
      p_professional_id: professionalId || null,
      p_ignore_appointment_id: ignoreId,
    }),
  );
}

// ---------------------------------------------------------------------
// Novo agendamento (feito pela equipe)
// ---------------------------------------------------------------------
interface NewProps {
  establishment: Establishment;
  catalog: AgendaCatalog;
  onClose: () => void;
  onSaved: () => void;
}

export function NewAppointmentModal({ establishment, catalog, onClose, onSaved }: NewProps) {
  const toast = useToast();
  const activeServices = catalog.services.filter((s) => s.is_active);
  const [serviceId, setServiceId] = useState(activeServices[0]?.id ?? '');
  const [professionalId, setProfessionalId] = useState('');
  const [slot, setSlot] = useState<Slot | null>(null);
  const [search, setSearch] = useState('');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const term = search.trim();
  const results = useLoad(async () => {
    if (term.length < 2) return [];
    const safe = term.replace(/[%,()]/g, ' ');
    const digits = onlyDigits(term);
    let query = supabase.from('customers').select('*').eq('establishment_id', establishment.id).limit(6).order('name');
    query = digits.length >= 3 ? query.or(`name.ilike.%${safe}%,phone.ilike.%${digits}%`) : query.ilike('name', `%${safe}%`);
    return unwrap<Customer[]>(await query);
  }, [term, establishment.id]);

  const loadSlots = useCallback(
    (date: string) => loadAdminSlots(establishment.id, serviceId, date, professionalId, null),
    [establishment.id, serviceId, professionalId],
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!slot) return toast.error('Escolha um horário.');
    setSaving(true);
    try {
      let customerId = customer?.id ?? null;
      if (isNew) {
        const phone = onlyDigits(newPhone);
        if (phone.length < 10 || phone.length > 13) throw new Error('Informe um telefone válido com DDD.');
        const existing = unwrap<Customer | null>(
          await supabase.from('customers').select('*').eq('establishment_id', establishment.id).eq('phone', phone).maybeSingle(),
        );
        customerId =
          existing?.id ??
          unwrap<Customer>(
            await supabase.from('customers').insert({ establishment_id: establishment.id, name: newName.trim(), phone }).select().single(),
          ).id;
      }
      if (!customerId) throw new Error('Selecione ou cadastre o cliente.');

      unwrap(
        await supabase.from('appointments').insert({
          establishment_id: establishment.id,
          professional_id: slot.professional_id,
          service_id: serviceId,
          customer_id: customerId,
          starts_at: slot.slot_start,
          status: 'confirmed',
          admin_notes: notes.trim() || null,
        }),
      );
      toast.success('Agendamento criado.');
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open title="Novo agendamento" onClose={onClose} wide>
      {activeServices.length === 0 ? (
        <p className="text-sm text-slate-600">Cadastre pelo menos um serviço ativo e vincule um profissional antes de agendar.</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">Cliente</span>
              <button
                type="button"
                className="text-xs font-medium text-slate-600 underline"
                onClick={() => {
                  setIsNew(!isNew);
                  setCustomer(null);
                }}
              >
                {isNew ? 'Buscar cliente cadastrado' : 'Cadastrar novo cliente'}
              </button>
            </div>
            {isNew ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <input className="input" placeholder="Nome completo" required minLength={2} value={newName} onChange={(e) => setNewName(e.target.value)} />
                <input className="input" placeholder="Telefone com DDD" inputMode="tel" required value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
              </div>
            ) : customer ? (
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <span>
                  {customer.name} · {formatPhone(customer.phone)}
                </span>
                <button type="button" className="text-xs font-medium underline" onClick={() => setCustomer(null)}>
                  Trocar
                </button>
              </div>
            ) : (
              <>
                <input className="input" placeholder="Buscar por nome ou telefone" value={search} onChange={(e) => setSearch(e.target.value)} />
                {term.length >= 2 && (
                  <div className="mt-1 divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {results.loading && <p className="px-3 py-2 text-sm text-slate-500">Buscando…</p>}
                    {!results.loading && (results.data ?? []).length === 0 && <p className="px-3 py-2 text-sm text-slate-500">Nenhum cliente encontrado.</p>}
                    {!results.loading &&
                      (results.data ?? []).map((c) => (
                        <button key={c.id} type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => setCustomer(c)}>
                          {c.name} · {formatPhone(c.phone)}
                        </button>
                      ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Serviço">
              <select
                className="input"
                value={serviceId}
                onChange={(e) => {
                  setServiceId(e.target.value);
                  setProfessionalId('');
                  setSlot(null);
                }}
              >
                {activeServices.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Profissional">
              <select
                className="input"
                value={professionalId}
                onChange={(e) => {
                  setProfessionalId(e.target.value);
                  setSlot(null);
                }}
              >
                <option value="">Qualquer disponível</option>
                {professionalsFor(catalog, serviceId).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div>
            <span className="mb-2 block text-sm font-medium text-slate-700">Data e horário</span>
            <SlotPicker
              timeZone={establishment.timezone}
              maxDays={establishment.max_advance_days}
              loadSlots={loadSlots}
              value={slot}
              onChange={setSlot}
              reloadKey={`${serviceId}:${professionalId}`}
            />
          </div>

          <Field label="Observações internas (opcional)">
            <textarea className="input" rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" loading={saving}>
              Agendar
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Reagendar / trocar profissional
// ---------------------------------------------------------------------
interface RescheduleProps {
  establishment: Establishment;
  catalog: AgendaCatalog;
  appointment: AppointmentWithRelations;
  onClose: () => void;
  onSaved: () => void;
}

export function RescheduleModal({ establishment, catalog, appointment, onClose, onSaved }: RescheduleProps) {
  const toast = useToast();
  const [professionalId, setProfessionalId] = useState(appointment.professional_id);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [saving, setSaving] = useState(false);

  const loadSlots = useCallback(
    (date: string) => loadAdminSlots(establishment.id, appointment.service_id, date, professionalId, appointment.id),
    [establishment.id, appointment.service_id, appointment.id, professionalId],
  );

  async function handleSave() {
    if (!slot) return toast.error('Escolha o novo horário.');
    setSaving(true);
    try {
      unwrap(
        await supabase
          .from('appointments')
          .update({ starts_at: slot.slot_start, professional_id: slot.professional_id })
          .eq('id', appointment.id),
      );
      toast.success('Agendamento atualizado.');
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      wide
      title="Reagendar ou trocar profissional"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Voltar
          </Button>
          <Button onClick={() => void handleSave()} loading={saving} disabled={!slot}>
            Salvar alteração
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-slate-600">
        {appointment.customer?.name} · {appointment.service?.name} · atualmente em {formatDateTime(appointment.starts_at, establishment.timezone)} com{' '}
        {appointment.professional?.name}.
      </p>
      <Field label="Profissional">
        <select
          className="input"
          value={professionalId}
          onChange={(e) => {
            setProfessionalId(e.target.value);
            setSlot(null);
          }}
        >
          {professionalsFor(catalog, appointment.service_id).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="mt-4">
        <SlotPicker
          timeZone={establishment.timezone}
          maxDays={establishment.max_advance_days}
          loadSlots={loadSlots}
          value={slot}
          onChange={setSlot}
          reloadKey={professionalId}
        />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Observações administrativas
// ---------------------------------------------------------------------
interface NotesProps {
  appointment: AppointmentWithRelations;
  onClose: () => void;
  onSaved: () => void;
}

export function NotesModal({ appointment, onClose, onSaved }: NotesProps) {
  const toast = useToast();
  const [notes, setNotes] = useState(appointment.admin_notes ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      unwrap(await supabase.from('appointments').update({ admin_notes: notes.trim() || null }).eq('id', appointment.id));
      toast.success('Observações salvas.');
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title="Observações do agendamento"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Voltar
          </Button>
          <Button onClick={() => void handleSave()} loading={saving}>
            Salvar
          </Button>
        </>
      }
    >
      {appointment.customer_notes && (
        <div className="mb-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Mensagem do cliente</p>
          <p className="mt-1 whitespace-pre-wrap">{appointment.customer_notes}</p>
        </div>
      )}
      {appointment.cancellation_reason && (
        <p className="mb-4 text-sm text-slate-600">Motivo do cancelamento: {appointment.cancellation_reason}</p>
      )}
      <Field label="Observações internas" hint="Visível apenas para a equipe.">
        <textarea className="input" rows={4} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </Modal>
  );
}
