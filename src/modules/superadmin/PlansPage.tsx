import { useState, type FormEvent } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Card, ConfirmModal, EmptyState, ErrorBox, Field, Modal, PageHeader, Spinner, Toggle } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { centsToInput, formatMoney, parseMoney } from '../../lib/format';
import { errorMessage, supabase, unwrap } from '../../lib/supabase';
import { useLoad } from '../../lib/useLoad';
import type { Plan } from '../../types/database';

interface PlanForm {
  id: string | null;
  name: string;
  description: string;
  price: string;
  maxProfessionals: string;
  maxUsers: string;
  maxAppointments: string;
  customTheme: boolean;
  reports: boolean;
  isActive: boolean;
}

const EMPTY: PlanForm = {
  id: null, name: '', description: '', price: '0,00', maxProfessionals: '', maxUsers: '', maxAppointments: '',
  customTheme: true, reports: true, isActive: true,
};

function limitToInput(value: number | null): string {
  return value === null ? '' : String(value);
}

/** '' -> null (ilimitado); número inteiro >= 0; undefined se inválido */
function parseLimit(text: string): number | null | undefined {
  if (text.trim() === '') return null;
  const value = Number(text);
  return Number.isInteger(value) && value >= 0 ? value : undefined;
}

function limitLabel(value: number | null): string {
  return value === null ? 'Ilimitado' : String(value);
}

export function PlansPage() {
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(
    async () => unwrap<Plan[]>(await supabase.from('plans').select('*').order('price_cents').order('name')),
    [],
  );
  const [form, setForm] = useState<PlanForm | null>(null);
  const [toDelete, setToDelete] = useState<Plan | null>(null);
  const [saving, setSaving] = useState(false);

  function openEdit(plan: Plan) {
    setForm({
      id: plan.id,
      name: plan.name,
      description: plan.description ?? '',
      price: centsToInput(plan.price_cents),
      maxProfessionals: limitToInput(plan.max_professionals),
      maxUsers: limitToInput(plan.max_users),
      maxAppointments: limitToInput(plan.max_appointments_per_month),
      customTheme: plan.features.custom_theme !== false,
      reports: plan.features.reports !== false,
      isActive: plan.is_active,
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    const price = parseMoney(form.price);
    const maxProfessionals = parseLimit(form.maxProfessionals);
    const maxUsers = parseLimit(form.maxUsers);
    const maxAppointments = parseLimit(form.maxAppointments);
    if (price === null) return toast.error('Informe um preço válido.');
    if (maxProfessionals === undefined || maxUsers === undefined || maxAppointments === undefined) {
      return toast.error('Os limites devem ser números inteiros ou ficar em branco (ilimitado).');
    }
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      price_cents: price,
      max_professionals: maxProfessionals,
      max_users: maxUsers,
      max_appointments_per_month: maxAppointments,
      features: { custom_theme: form.customTheme, reports: form.reports },
      is_active: form.isActive,
    };
    setSaving(true);
    try {
      if (form.id) unwrap(await supabase.from('plans').update(payload).eq('id', form.id));
      else unwrap(await supabase.from('plans').insert(payload));
      toast.success('Plano salvo.');
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
      unwrap(await supabase.from('plans').delete().eq('id', toDelete.id));
      toast.success('Plano excluído.');
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
        title="Planos"
        description="Defina limites e recursos. O controle funciona mesmo sem gateway de pagamento: nenhuma cobrança é feita pela plataforma."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setForm(EMPTY)}>
            Novo plano
          </Button>
        }
      />

      {loading && <Spinner />}
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {!loading && !error && data && data.length === 0 && (
        <EmptyState title="Nenhum plano cadastrado" description="Estabelecimentos sem plano funcionam sem limites. Crie planos para controlar o uso." />
      )}
      {!loading && !error && data && data.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.map((plan) => (
            <Card key={plan.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900">{plan.name}</p>
                  <p className="text-sm text-slate-500">{formatMoney(plan.price_cents)} / mês</p>
                </div>
                <Badge tone={plan.is_active ? 'green' : 'gray'}>{plan.is_active ? 'Ativo' : 'Inativo'}</Badge>
              </div>
              {plan.description && <p className="mt-2 text-sm text-slate-600">{plan.description}</p>}
              <ul className="mt-3 space-y-1 text-sm text-slate-600">
                <li>Profissionais: {limitLabel(plan.max_professionals)}</li>
                <li>Usuários: {limitLabel(plan.max_users)}</li>
                <li>Agendamentos/mês: {limitLabel(plan.max_appointments_per_month)}</li>
                <li>Personalização visual: {plan.features.custom_theme !== false ? 'Sim' : 'Não'}</li>
                <li>Relatórios: {plan.features.reports !== false ? 'Sim' : 'Não'}</li>
              </ul>
              <div className="mt-4 flex gap-2">
                <Button variant="secondary" size="sm" icon={<Pencil className="h-4 w-4" />} onClick={() => openEdit(plan)}>
                  Editar
                </Button>
                <Button variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" />} onClick={() => setToDelete(plan)}>
                  Excluir
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={form !== null} title={form?.id ? 'Editar plano' : 'Novo plano'} onClose={() => setForm(null)}>
        {form && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Nome">
              <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Descrição">
              <textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Field label="Preço mensal (R$)" hint="Apenas informativo até a integração com gateway de pagamento.">
              <input className="input" inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Profissionais" hint="Em branco = ilimitado">
                <input className="input" inputMode="numeric" value={form.maxProfessionals} onChange={(e) => setForm({ ...form, maxProfessionals: e.target.value })} />
              </Field>
              <Field label="Usuários" hint="Em branco = ilimitado">
                <input className="input" inputMode="numeric" value={form.maxUsers} onChange={(e) => setForm({ ...form, maxUsers: e.target.value })} />
              </Field>
              <Field label="Agend./mês" hint="Em branco = ilimitado">
                <input className="input" inputMode="numeric" value={form.maxAppointments} onChange={(e) => setForm({ ...form, maxAppointments: e.target.value })} />
              </Field>
            </div>
            <div className="space-y-3">
              <Toggle checked={form.customTheme} onChange={(v) => setForm({ ...form, customTheme: v })} label="Personalização visual" />
              <Toggle checked={form.reports} onChange={(v) => setForm({ ...form, reports: v })} label="Relatórios" />
              <Toggle checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} label="Plano ativo (disponível para novos estabelecimentos)" />
            </div>
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
        title="Excluir plano"
        message={`Excluir o plano “${toDelete?.name ?? ''}”? Planos em uso por algum estabelecimento não podem ser excluídos.`}
        confirmLabel="Excluir"
        danger
        loading={saving}
        onConfirm={() => void handleDelete()}
        onClose={() => setToDelete(null)}
      />
    </>
  );
}
