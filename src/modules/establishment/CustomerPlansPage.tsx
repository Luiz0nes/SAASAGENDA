import { useEffect, useState, type FormEvent } from 'react';
import { Info, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Badge, Button, Card, ConfirmModal, EmptyState, ErrorBox, Field, Modal, PageHeader, Spinner, Toggle } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { centsToInput, formatMoney, parseMoney } from '../../lib/format';
import { errorMessage, supabase, unwrap } from '../../lib/supabase';
import { useLoad } from '../../lib/useLoad';
import type { CustomerPlan } from '../../types/database';
import { useEstablishment } from './EstablishmentContext';

interface OptionForm {
  label: string;
  price: string;
  note: string;
}

interface PlanForm {
  id: string | null;
  name: string;
  tagline: string;
  options: OptionForm[];
  benefits: string;
  highlight: boolean;
  isActive: boolean;
  sortOrder: string;
}

const EMPTY_OPTION: OptionForm = { label: '', price: '', note: '' };
const MAX_OPTIONS = 4;

/** /painel/planos — vitrine de planos mensais para os clientes. */
export function CustomerPlansPage() {
  const { establishment, can, refresh } = useEstablishment();
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(
    async () =>
      unwrap<CustomerPlan[]>(
        await supabase.from('customer_plans').select('*').eq('establishment_id', establishment.id).order('sort_order').order('name'),
      ),
    [establishment.id],
  );

  const [form, setForm] = useState<PlanForm | null>(null);
  const [toDelete, setToDelete] = useState<CustomerPlan | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState(establishment.plans_note ?? '');
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => setNote(establishment.plans_note ?? ''), [establishment.plans_note]);

  function openNew() {
    const nextOrder = (data ?? []).reduce((max, p) => Math.max(max, p.sort_order), 0) + 1;
    setForm({ id: null, name: '', tagline: '', options: [{ ...EMPTY_OPTION }], benefits: '', highlight: false, isActive: true, sortOrder: String(nextOrder) });
  }

  function openEdit(plan: CustomerPlan) {
    setForm({
      id: plan.id,
      name: plan.name,
      tagline: plan.tagline ?? '',
      options: plan.options.map((o) => ({ label: o.label, price: centsToInput(o.price_cents), note: o.note ?? '' })),
      benefits: plan.benefits ?? '',
      highlight: plan.highlight,
      isActive: plan.is_active,
      sortOrder: String(plan.sort_order),
    });
  }

  function setOption(index: number, patch: Partial<OptionForm>) {
    if (!form) return;
    setForm({ ...form, options: form.options.map((o, i) => (i === index ? { ...o, ...patch } : o)) });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    const options = [];
    for (const [i, o] of form.options.entries()) {
      const price = parseMoney(o.price);
      if (!o.label.trim()) return toast.error(`Preencha o nome da opção ${i + 1} (ex.: Corte mensal).`);
      if (price === null || price <= 0) return toast.error(`Informe o preço mensal da opção ${i + 1}.`);
      options.push({ label: o.label.trim(), price_cents: price, note: o.note.trim() || null });
    }
    const sortOrder = Number(form.sortOrder);
    const payload = {
      establishment_id: establishment.id,
      name: form.name.trim(),
      tagline: form.tagline.trim() || null,
      options,
      benefits: form.benefits.trim() || null,
      highlight: form.highlight,
      is_active: form.isActive,
      sort_order: Number.isInteger(sortOrder) ? sortOrder : 0,
    };
    setSaving(true);
    try {
      if (form.id) unwrap(await supabase.from('customer_plans').update(payload).eq('id', form.id));
      else unwrap(await supabase.from('customer_plans').insert(payload));
      toast.success('Plano salvo. Já aparece na sua página.');
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
      unwrap(await supabase.from('customer_plans').delete().eq('id', toDelete.id));
      toast.success('Plano excluído.');
      setToDelete(null);
      await reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function saveNote() {
    setSavingNote(true);
    try {
      unwrap(await supabase.from('establishments').update({ plans_note: note.trim() || null }).eq('id', establishment.id));
      await refresh();
      toast.success('Texto salvo.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSavingNote(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Planos mensais"
        description="Mostre seus planos de assinatura na página de agendamento. O botão “Quero assinar” abre uma conversa no seu WhatsApp."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={openNew}>
            Novo plano
          </Button>
        }
      />

      <p className="mb-4 flex items-start gap-2 rounded-lg bg-slate-100 px-3 py-2.5 text-sm text-slate-600">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Aqui é só a vitrine: a plataforma não cobra nem controla as sessões dos assinantes.
          {!establishment.whatsapp && ' Cadastre o WhatsApp em Configurações para o botão “Quero assinar” aparecer.'}
        </span>
      </p>

      {loading && <Spinner />}
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {!loading && !error && data && data.length === 0 && (
        <EmptyState title="Nenhum plano cadastrado" description="Crie planos como “Corte mensal” ou “Corte + barba” para oferecer aos seus clientes." />
      )}
      {!loading && !error && data && data.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.map((plan) => (
            <Card key={plan.id} className="flex flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold text-slate-900">{plan.name}</p>
                  {plan.tagline && <p className="truncate text-xs uppercase tracking-wide text-slate-500">{plan.tagline}</p>}
                </div>
                <span className="flex shrink-0 gap-1">
                  {plan.highlight && <Badge tone="blue">Destaque</Badge>}
                  <Badge tone={plan.is_active ? 'green' : 'gray'}>{plan.is_active ? 'Visível' : 'Oculto'}</Badge>
                </span>
              </div>
              <ul className="mt-3 space-y-1 text-sm">
                {plan.options.map((o) => (
                  <li key={o.label} className="flex justify-between gap-3">
                    <span className="text-slate-600">{o.label}</span>
                    <span className="font-semibold text-slate-900">{formatMoney(o.price_cents)}/mês</span>
                  </li>
                ))}
              </ul>
              {plan.benefits && <p className="mt-2 text-xs text-slate-500">{plan.benefits}</p>}
              <div className="mt-auto flex gap-2 pt-4">
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

      <Card className="mt-6 p-4">
        <h2 className="text-sm font-semibold text-slate-900">Como funciona</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Texto exibido abaixo dos planos. Uma informação por linha; o que vier antes de “:” vira título. Ex.: “Frequência: semanal ou quinzenal”.
        </p>
        <textarea
          className="input mt-3"
          rows={4}
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={!can('manage_settings')}
          aria-label="Como funciona"
        />
        {can('manage_settings') ? (
          <div className="mt-3 flex justify-end">
            <Button size="sm" loading={savingNote} disabled={note === (establishment.plans_note ?? '')} onClick={() => void saveNote()}>
              Salvar texto
            </Button>
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate-500">Só quem gerencia as configurações pode alterar este texto.</p>
        )}
      </Card>

      <Modal open={form !== null} title={form?.id ? 'Editar plano' : 'Novo plano'} onClose={() => setForm(null)} wide>
        {form && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_1fr_100px]">
              <Field label="Nome do plano">
                <input className="input" required minLength={2} maxLength={60} placeholder="Ex.: Normal" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="Frase curta (opcional)">
                <input className="input" maxLength={80} placeholder="Ex.: Foco no essencial" value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} />
              </Field>
              <Field label="Ordem">
                <input className="input" inputMode="numeric" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />
              </Field>
            </div>

            <div>
              <span className="mb-2 block text-sm font-medium text-slate-700">Preços mensais</span>
              <div className="space-y-2">
                {form.options.map((option, index) => (
                  <div key={index} className="rounded-lg border border-slate-200 p-3">
                    <div className="grid gap-2 sm:grid-cols-[1fr_130px_auto]">
                      <input
                        className="input"
                        placeholder="O que inclui (ex.: Corte mensal)"
                        maxLength={60}
                        value={option.label}
                        onChange={(e) => setOption(index, { label: e.target.value })}
                        aria-label={`Opção ${index + 1}`}
                      />
                      <input
                        className="input"
                        inputMode="decimal"
                        placeholder="R$ por mês"
                        value={option.price}
                        onChange={(e) => setOption(index, { price: e.target.value })}
                        aria-label={`Preço da opção ${index + 1}`}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<X className="h-4 w-4" />}
                        disabled={form.options.length === 1}
                        onClick={() => setForm({ ...form, options: form.options.filter((_, i) => i !== index) })}
                        aria-label={`Remover opção ${index + 1}`}
                      />
                    </div>
                    <input
                      className="input mt-2"
                      placeholder="Observação (opcional). Ex.: Inclui sobrancelha de cortesia."
                      maxLength={120}
                      value={option.note}
                      onChange={(e) => setOption(index, { note: e.target.value })}
                      aria-label={`Observação da opção ${index + 1}`}
                    />
                  </div>
                ))}
              </div>
              {form.options.length < MAX_OPTIONS && (
                <button
                  type="button"
                  className="mt-2 text-sm font-medium text-slate-700 underline"
                  onClick={() => setForm({ ...form, options: [...form.options, { ...EMPTY_OPTION }] })}
                >
                  + Adicionar outro preço neste plano
                </button>
              )}
            </div>

            <Field label="Benefícios e regras (opcional)">
              <textarea
                className="input"
                rows={2}
                maxLength={500}
                placeholder="Ex.: Escolha 1 cortesia: sobrancelha de brinde em todos os cortes OU 2 barboterapias."
                value={form.benefits}
                onChange={(e) => setForm({ ...form, benefits: e.target.value })}
              />
            </Field>

            <div className="space-y-3">
              <Toggle checked={form.highlight} onChange={(highlight) => setForm({ ...form, highlight })} label="Destacar como “Mais escolhido”" />
              <Toggle checked={form.isActive} onChange={(isActive) => setForm({ ...form, isActive })} label="Mostrar na página de agendamento" />
            </div>

            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => setForm(null)} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" loading={saving}>
                Salvar plano
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmModal
        open={toDelete !== null}
        title="Excluir plano"
        message={`Excluir o plano “${toDelete?.name ?? ''}”? Ele sai da sua página. Para só esconder, edite e desligue “Mostrar na página”.`}
        confirmLabel="Excluir"
        danger
        loading={saving}
        onConfirm={() => void handleDelete()}
        onClose={() => setToDelete(null)}
      />
    </>
  );
}
