import { useState, type FormEvent } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { ImageUpload } from '../../components/ImageUpload';
import { Badge, Button, Card, ConfirmModal, EmptyState, ErrorBox, Field, Modal, PageHeader, Spinner, Toggle } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { centsToInput, formatDuration, formatMoney, isPromotion, parseMoney } from '../../lib/format';
import { errorMessage, supabase, unwrap } from '../../lib/supabase';
import { useLoad } from '../../lib/useLoad';
import type { Professional, Service } from '../../types/database';
import { useEstablishment } from './EstablishmentContext';

interface ServiceForm {
  id: string | null;
  name: string;
  description: string;
  imageUrl: string | null;
  price: string;
  comparePrice: string;
  duration: string;
  buffer: string;
  isActive: boolean;
  professionalIds: string[];
}

const EMPTY: ServiceForm = {
  id: null, name: '', description: '', imageUrl: null, price: '0,00', comparePrice: '', duration: '30', buffer: '0', isActive: true, professionalIds: [],
};

export function ServicesPage() {
  const { establishment } = useEstablishment();
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(async () => {
    const [services, professionals, links] = await Promise.all([
      supabase.from('services').select('*').eq('establishment_id', establishment.id).order('sort_order').order('name'),
      supabase.from('professionals').select('*').eq('establishment_id', establishment.id).order('name'),
      supabase.from('professional_services').select('professional_id, service_id').eq('establishment_id', establishment.id),
    ]);
    return {
      services: unwrap<Service[]>(services),
      professionals: unwrap<Professional[]>(professionals),
      links: unwrap<{ professional_id: string; service_id: string }[]>(links),
    };
  }, [establishment.id]);

  const [form, setForm] = useState<ServiceForm | null>(null);
  const [toDelete, setToDelete] = useState<Service | null>(null);
  const [saving, setSaving] = useState(false);

  function linkedTo(serviceId: string): string[] {
    return (data?.links ?? []).filter((l) => l.service_id === serviceId).map((l) => l.professional_id);
  }

  function openEdit(service: Service) {
    setForm({
      id: service.id,
      name: service.name,
      description: service.description ?? '',
      imageUrl: service.image_url,
      price: centsToInput(service.price_cents),
      comparePrice: service.compare_price_cents != null ? centsToInput(service.compare_price_cents) : '',
      duration: String(service.duration_minutes),
      buffer: String(service.buffer_minutes),
      isActive: service.is_active,
      professionalIds: linkedTo(service.id),
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    const price = parseMoney(form.price);
    const duration = Number(form.duration);
    const buffer = Number(form.buffer);
    if (price === null) return toast.error('Informe um preço válido.');
    const comparePrice = form.comparePrice.trim() === '' ? null : parseMoney(form.comparePrice);
    if (comparePrice === null && form.comparePrice.trim() !== '') return toast.error('Informe um preço original válido.');
    if (comparePrice !== null && comparePrice <= price) return toast.error('Na promoção, o preço original (“de”) precisa ser maior que o preço atual.');
    if (!Number.isInteger(duration) || duration < 5 || duration > 720) return toast.error('A duração deve ficar entre 5 e 720 minutos.');
    if (!Number.isInteger(buffer) || buffer < 0 || buffer > 240) return toast.error('O intervalo deve ficar entre 0 e 240 minutos.');

    const payload = {
      establishment_id: establishment.id,
      name: form.name.trim(),
      description: form.description.trim() || null,
      image_url: form.imageUrl,
      price_cents: price,
      compare_price_cents: comparePrice,
      duration_minutes: duration,
      buffer_minutes: buffer,
      is_active: form.isActive,
    };
    setSaving(true);
    try {
      const saved = form.id
        ? unwrap<Service>(await supabase.from('services').update(payload).eq('id', form.id).select().single())
        : unwrap<Service>(await supabase.from('services').insert(payload).select().single());

      // sincroniza os profissionais habilitados
      const current = form.id ? linkedTo(form.id) : [];
      const toAdd = form.professionalIds.filter((id) => !current.includes(id));
      const toRemove = current.filter((id) => !form.professionalIds.includes(id));
      if (toAdd.length > 0) {
        unwrap(
          await supabase
            .from('professional_services')
            .insert(toAdd.map((professional_id) => ({ establishment_id: establishment.id, professional_id, service_id: saved.id }))),
        );
      }
      if (toRemove.length > 0) {
        unwrap(await supabase.from('professional_services').delete().eq('service_id', saved.id).in('professional_id', toRemove));
      }
      toast.success('Serviço salvo.');
      setForm(null);
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
      unwrap(await supabase.from('services').delete().eq('id', toDelete.id));
      toast.success('Serviço excluído.');
      setToDelete(null);
      await reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Serviços"
        description="Preço, duração e profissionais habilitados de cada serviço."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setForm(EMPTY)}>
            Novo serviço
          </Button>
        }
      />

      {loading && <Spinner />}
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {!loading && !error && data && data.services.length === 0 && (
        <EmptyState title="Nenhum serviço cadastrado" description="Cadastre os serviços que seus clientes poderão agendar." />
      )}
      {!loading && !error && data && data.services.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {data.services.map((service) => {
            const count = linkedTo(service.id).length;
            return (
              <Card key={service.id} className="flex gap-4 p-4">
                {service.image_url && <img src={service.image_url} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate font-semibold text-slate-900">{service.name}</p>
                    <span className="flex shrink-0 gap-1">
                      {isPromotion(service) && <Badge tone="yellow">Promoção</Badge>}
                      <Badge tone={service.is_active ? 'green' : 'gray'}>{service.is_active ? 'Ativo' : 'Inativo'}</Badge>
                    </span>
                  </div>
                  <p className="text-sm text-slate-600">
                    {isPromotion(service) && <span className="mr-1 text-slate-400 line-through">{formatMoney(service.compare_price_cents ?? 0)}</span>}
                    {formatMoney(service.price_cents)} · {formatDuration(service.duration_minutes)}
                    {service.buffer_minutes > 0 ? ` · +${service.buffer_minutes} min de intervalo` : ''}
                  </p>
                  <p className={`mt-1 text-xs ${count === 0 ? 'text-amber-700' : 'text-slate-500'}`}>
                    {count === 0 ? 'Sem profissional habilitado: não aparece na página pública.' : `${count} profissional(is) habilitado(s)`}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button variant="secondary" size="sm" icon={<Pencil className="h-4 w-4" />} onClick={() => openEdit(service)}>
                      Editar
                    </Button>
                    <Button variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" />} onClick={() => setToDelete(service)}>
                      Excluir
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={form !== null} title={form?.id ? 'Editar serviço' : 'Novo serviço'} onClose={() => setForm(null)} wide>
        {form && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Nome do serviço">
              <input className="input" required minLength={2} maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Descrição">
              <textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Preço (R$)">
                <input className="input" inputMode="decimal" required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </Field>
              <Field label="Preço original — promoção (R$)" hint="Opcional. Ex.: “De R$ 110” por R$ 85. Aparece riscado na página.">
                <input className="input" inputMode="decimal" placeholder="Sem promoção" value={form.comparePrice} onChange={(e) => setForm({ ...form, comparePrice: e.target.value })} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Duração (min)">
                <input className="input" inputMode="numeric" required value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} />
              </Field>
              <Field label="Intervalo após (min)" hint="Tempo livre depois do atendimento">
                <input className="input" inputMode="numeric" required value={form.buffer} onChange={(e) => setForm({ ...form, buffer: e.target.value })} />
              </Field>
            </div>
            <ImageUpload establishmentId={establishment.id} prefix="servico" label="Imagem" value={form.imageUrl} onChange={(imageUrl) => setForm({ ...form, imageUrl })} />
            <div>
              <span className="mb-2 block text-sm font-medium text-slate-700">Profissionais habilitados</span>
              {(data?.professionals ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">Cadastre profissionais para vinculá-los a este serviço.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {data?.professionals.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300"
                        checked={form.professionalIds.includes(p.id)}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            professionalIds: e.target.checked ? [...form.professionalIds, p.id] : form.professionalIds.filter((id) => id !== p.id),
                          })
                        }
                      />
                      {p.name}
                      {!p.is_active && <span className="text-xs text-slate-400">(inativo)</span>}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <Toggle checked={form.isActive} onChange={(isActive) => setForm({ ...form, isActive })} label="Serviço ativo" />
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

      <ConfirmModal
        open={toDelete !== null}
        title="Excluir serviço"
        message={`Excluir “${toDelete?.name ?? ''}”? Serviços que já têm agendamentos não podem ser excluídos — nesse caso, desative-o.`}
        confirmLabel="Excluir"
        danger
        loading={saving}
        onConfirm={() => void handleDelete()}
        onClose={() => setToDelete(null)}
      />
    </>
  );
}
