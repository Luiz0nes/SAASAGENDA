import { useState, type FormEvent } from 'react';
import { Clock, Pencil, Plus, Trash2, UserRound } from 'lucide-react';
import { ImageUpload } from '../../components/ImageUpload';
import { Badge, Button, Card, ConfirmModal, EmptyState, ErrorBox, Field, Modal, PageHeader, Spinner, Toggle } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { formatPhone, onlyDigits, trimTime, WEEKDAYS } from '../../lib/format';
import { errorMessage, supabase, unwrap } from '../../lib/supabase';
import { useLoad } from '../../lib/useLoad';
import type { Professional, ProfessionalSchedule, Service } from '../../types/database';
import { useEstablishment } from './EstablishmentContext';

interface ProfessionalForm {
  id: string | null;
  name: string;
  specialty: string;
  bio: string;
  phone: string;
  email: string;
  photoUrl: string | null;
  isActive: boolean;
  serviceIds: string[];
}

const EMPTY: ProfessionalForm = {
  id: null, name: '', specialty: '', bio: '', phone: '', email: '', photoUrl: null, isActive: true, serviceIds: [],
};

interface DayForm {
  weekday: number;
  isWorking: boolean;
  start: string;
  end: string;
  hasBreak: boolean;
  breakStart: string;
  breakEnd: string;
}

export function ProfessionalsPage() {
  const { establishment } = useEstablishment();
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(async () => {
    const [professionals, services, links, schedules] = await Promise.all([
      supabase.from('professionals').select('*').eq('establishment_id', establishment.id).order('name'),
      supabase.from('services').select('*').eq('establishment_id', establishment.id).order('name'),
      supabase.from('professional_services').select('professional_id, service_id').eq('establishment_id', establishment.id),
      supabase.from('professional_schedules').select('*').eq('establishment_id', establishment.id),
    ]);
    return {
      professionals: unwrap<Professional[]>(professionals),
      services: unwrap<Service[]>(services),
      links: unwrap<{ professional_id: string; service_id: string }[]>(links),
      schedules: unwrap<ProfessionalSchedule[]>(schedules),
    };
  }, [establishment.id]);

  const [form, setForm] = useState<ProfessionalForm | null>(null);
  const [schedule, setSchedule] = useState<{ professional: Professional; days: DayForm[] } | null>(null);
  const [toDelete, setToDelete] = useState<Professional | null>(null);
  const [saving, setSaving] = useState(false);

  function servicesOf(professionalId: string): string[] {
    return (data?.links ?? []).filter((l) => l.professional_id === professionalId).map((l) => l.service_id);
  }

  function workingDays(professionalId: string): number {
    return (data?.schedules ?? []).filter((s) => s.professional_id === professionalId && s.is_working).length;
  }

  function openEdit(p: Professional) {
    setForm({
      id: p.id,
      name: p.name,
      specialty: p.specialty ?? '',
      bio: p.bio ?? '',
      phone: p.phone ?? '',
      email: p.email ?? '',
      photoUrl: p.photo_url,
      isActive: p.is_active,
      serviceIds: servicesOf(p.id),
    });
  }

  function openSchedule(p: Professional) {
    const rows = (data?.schedules ?? []).filter((s) => s.professional_id === p.id);
    const days: DayForm[] = WEEKDAYS.map((_, weekday) => {
      const row = rows.find((r) => r.weekday === weekday);
      return {
        weekday,
        isWorking: row ? row.is_working : false,
        start: trimTime(row?.starts_at) || '09:00',
        end: trimTime(row?.ends_at) || '18:00',
        hasBreak: Boolean(row?.break_start),
        breakStart: trimTime(row?.break_start) || '12:00',
        breakEnd: trimTime(row?.break_end) || '13:00',
      };
    });
    setSchedule({ professional: p, days });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    const payload = {
      establishment_id: establishment.id,
      name: form.name.trim(),
      specialty: form.specialty.trim() || null,
      bio: form.bio.trim() || null,
      phone: onlyDigits(form.phone) || null,
      email: form.email.trim() || null,
      photo_url: form.photoUrl,
      is_active: form.isActive,
    };
    setSaving(true);
    try {
      const saved = form.id
        ? unwrap<Professional>(await supabase.from('professionals').update(payload).eq('id', form.id).select().single())
        : unwrap<Professional>(await supabase.from('professionals').insert(payload).select().single());

      const current = form.id ? servicesOf(form.id) : [];
      const toAdd = form.serviceIds.filter((id) => !current.includes(id));
      const toRemove = current.filter((id) => !form.serviceIds.includes(id));
      if (toAdd.length > 0) {
        unwrap(
          await supabase
            .from('professional_services')
            .insert(toAdd.map((service_id) => ({ establishment_id: establishment.id, professional_id: saved.id, service_id }))),
        );
      }
      if (toRemove.length > 0) {
        unwrap(await supabase.from('professional_services').delete().eq('professional_id', saved.id).in('service_id', toRemove));
      }
      toast.success(form.id ? 'Profissional salvo.' : 'Profissional criado. Defina agora os horários de atendimento.');
      setForm(null);
      await reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveSchedule() {
    if (!schedule) return;
    for (const day of schedule.days) {
      if (!day.isWorking) continue;
      if (day.end <= day.start) return toast.error(`${WEEKDAYS[day.weekday]}: o fim deve ser depois do início.`);
      if (day.hasBreak && (day.breakEnd <= day.breakStart || day.breakStart < day.start || day.breakEnd > day.end)) {
        return toast.error(`${WEEKDAYS[day.weekday]}: o intervalo deve ficar dentro do expediente.`);
      }
    }
    setSaving(true);
    try {
      unwrap(
        await supabase.from('professional_schedules').upsert(
          schedule.days.map((day) => ({
            establishment_id: establishment.id,
            professional_id: schedule.professional.id,
            weekday: day.weekday,
            is_working: day.isWorking,
            starts_at: day.start,
            ends_at: day.end,
            break_start: day.isWorking && day.hasBreak ? day.breakStart : null,
            break_end: day.isWorking && day.hasBreak ? day.breakEnd : null,
          })),
          { onConflict: 'professional_id,weekday' },
        ),
      );
      toast.success('Horários salvos.');
      setSchedule(null);
      await reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!toDelete) return;
    setSaving(true);
    try {
      unwrap(await supabase.from('professionals').delete().eq('id', toDelete.id));
      toast.success('Profissional excluído.');
      setToDelete(null);
      await reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function updateDay(weekday: number, patch: Partial<DayForm>) {
    if (!schedule) return;
    setSchedule({ ...schedule, days: schedule.days.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)) });
  }

  return (
    <>
      <PageHeader
        title="Profissionais"
        description="Cada profissional tem agenda própria, com dias, horários e intervalos."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setForm(EMPTY)}>
            Novo profissional
          </Button>
        }
      />

      {loading && <Spinner />}
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {!loading && !error && data && data.professionals.length === 0 && (
        <EmptyState title="Nenhum profissional cadastrado" description="Cadastre quem realiza os atendimentos. Depois, defina os horários e os serviços de cada um." />
      )}
      {!loading && !error && data && data.professionals.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {data.professionals.map((p) => {
            const days = workingDays(p.id);
            const services = servicesOf(p.id).length;
            return (
              <Card key={p.id} className="flex gap-4 p-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100">
                  {p.photo_url ? <img src={p.photo_url} alt="" className="h-full w-full object-cover" /> : <UserRound className="h-6 w-6 text-slate-400" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate font-semibold text-slate-900">{p.name}</p>
                    <Badge tone={p.is_active ? 'green' : 'gray'}>{p.is_active ? 'Ativo' : 'Inativo'}</Badge>
                  </div>
                  <p className="text-sm text-slate-600">{[p.specialty, formatPhone(p.phone)].filter(Boolean).join(' · ') || 'Sem especialidade informada'}</p>
                  <p className={`mt-1 text-xs ${days === 0 || services === 0 ? 'text-amber-700' : 'text-slate-500'}`}>
                    {days === 0 ? 'Sem horários definidos' : `Atende ${days} dia(s) por semana`} · {services === 0 ? 'nenhum serviço vinculado' : `${services} serviço(s)`}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" icon={<Clock className="h-4 w-4" />} onClick={() => openSchedule(p)}>
                      Horários
                    </Button>
                    <Button variant="secondary" size="sm" icon={<Pencil className="h-4 w-4" />} onClick={() => openEdit(p)}>
                      Editar
                    </Button>
                    <Button variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" />} onClick={() => setToDelete(p)}>
                      Excluir
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={form !== null} title={form?.id ? 'Editar profissional' : 'Novo profissional'} onClose={() => setForm(null)} wide>
        {form && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome">
                <input className="input" required minLength={2} maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="Especialidade">
                <input className="input" value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} />
              </Field>
              <Field label="Telefone">
                <input className="input" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </Field>
              <Field label="E-mail">
                <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Field>
            </div>
            <Field label="Descrição profissional" hint="Aparece na página pública.">
              <textarea className="input" rows={2} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
            </Field>
            <ImageUpload establishmentId={establishment.id} prefix="profissional" label="Foto" value={form.photoUrl} onChange={(photoUrl) => setForm({ ...form, photoUrl })} />
            <div>
              <span className="mb-2 block text-sm font-medium text-slate-700">Serviços realizados</span>
              {(data?.services ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">Cadastre serviços para vinculá-los a este profissional.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {data?.services.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300"
                        checked={form.serviceIds.includes(s.id)}
                        onChange={(e) =>
                          setForm({ ...form, serviceIds: e.target.checked ? [...form.serviceIds, s.id] : form.serviceIds.filter((id) => id !== s.id) })
                        }
                      />
                      {s.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <Toggle checked={form.isActive} onChange={(isActive) => setForm({ ...form, isActive })} label="Profissional ativo" />
            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => setForm(null)} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" loading={saving}>
                Salvar
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={schedule !== null}
        wide
        title={`Horários de ${schedule?.professional.name ?? ''}`}
        onClose={() => setSchedule(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSchedule(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={() => void handleSaveSchedule()} loading={saving}>
              Salvar horários
            </Button>
          </>
        }
      >
        {schedule && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">Os horários também precisam estar dentro do funcionamento do estabelecimento. Dias desmarcados contam como folga.</p>
            {schedule.days.map((day) => (
              <div key={day.weekday} className="rounded-lg border border-slate-200 p-3">
                <Toggle checked={day.isWorking} onChange={(isWorking) => updateDay(day.weekday, { isWorking })} label={WEEKDAYS[day.weekday]} />
                {day.isWorking && (
                  <div className="mt-3 space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <input type="time" className="input w-auto" value={day.start} onChange={(e) => updateDay(day.weekday, { start: e.target.value })} aria-label="Início" />
                      <span className="text-slate-500">até</span>
                      <input type="time" className="input w-auto" value={day.end} onChange={(e) => updateDay(day.weekday, { end: e.target.value })} aria-label="Fim" />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={day.hasBreak} onChange={(e) => updateDay(day.weekday, { hasBreak: e.target.checked })} />
                      Intervalo
                    </label>
                    {day.hasBreak && (
                      <div className="flex items-center gap-2 text-sm">
                        <input type="time" className="input w-auto" value={day.breakStart} onChange={(e) => updateDay(day.weekday, { breakStart: e.target.value })} aria-label="Início do intervalo" />
                        <span className="text-slate-500">até</span>
                        <input type="time" className="input w-auto" value={day.breakEnd} onChange={(e) => updateDay(day.weekday, { breakEnd: e.target.value })} aria-label="Fim do intervalo" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={toDelete !== null}
        title="Excluir profissional"
        message={`Excluir “${toDelete?.name ?? ''}”? Profissionais que já têm agendamentos não podem ser excluídos — nesse caso, desative-o.`}
        confirmLabel="Excluir"
        danger
        loading={saving}
        onConfirm={() => void handleDelete()}
        onClose={() => setToDelete(null)}
      />
    </>
  );
}
