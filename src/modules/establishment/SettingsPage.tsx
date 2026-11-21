import { useState, type FormEvent } from 'react';
import { Button, Card, Field, PageHeader, Toggle } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { formatPhone, instagramHandle, isValidInstagram, onlyDigits } from '../../lib/format';
import { errorMessage, supabase, unwrap } from '../../lib/supabase';
import { useEstablishment } from './EstablishmentContext';

export function SettingsPage() {
  const { establishment, refresh } = useEstablishment();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: establishment.name,
    segment: establishment.segment ?? '',
    description: establishment.description ?? '',
    address: establishment.address ?? '',
    city: establishment.city ?? '',
    state: establishment.state ?? '',
    phone: formatPhone(establishment.phone),
    whatsapp: formatPhone(establishment.whatsapp),
    instagram: establishment.instagram ? `@${establishment.instagram}` : '',
    email: establishment.email ?? '',
    slotInterval: String(establishment.slot_interval_minutes),
    minAdvance: String(establishment.min_advance_minutes),
    maxAdvance: String(establishment.max_advance_days),
    cancellationMin: String(establishment.cancellation_min_minutes),
    maxActive: String(establishment.max_active_per_customer),
    autoConfirm: establishment.auto_confirm,
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const numbers = {
      slot_interval_minutes: Number(form.slotInterval),
      min_advance_minutes: Number(form.minAdvance),
      max_advance_days: Number(form.maxAdvance),
      cancellation_min_minutes: Number(form.cancellationMin),
      max_active_per_customer: Number(form.maxActive),
    };
    if (Object.values(numbers).some((n) => !Number.isInteger(n) || n < 0)) return toast.error('Preencha as regras com números inteiros.');
    if (numbers.slot_interval_minutes < 5 || numbers.slot_interval_minutes > 240) return toast.error('O intervalo entre horários deve ficar entre 5 e 240 minutos.');
    if (numbers.max_advance_days < 1 || numbers.max_advance_days > 365) return toast.error('A antecedência máxima deve ficar entre 1 e 365 dias.');
    if (numbers.max_active_per_customer < 1 || numbers.max_active_per_customer > 50) return toast.error('O limite por cliente deve ficar entre 1 e 50.');
    const instagram = instagramHandle(form.instagram);
    if (instagram && !isValidInstagram(instagram)) return toast.error('Instagram inválido. Use só o nome de usuário, por exemplo @minhabarbearia.');

    setSaving(true);
    try {
      unwrap(
        await supabase
          .from('establishments')
          .update({
            name: form.name.trim(),
            segment: form.segment.trim() || null,
            description: form.description.trim() || null,
            address: form.address.trim() || null,
            city: form.city.trim() || null,
            state: form.state.trim() || null,
            phone: onlyDigits(form.phone) || null,
            whatsapp: onlyDigits(form.whatsapp) || null,
            instagram: instagram || null,
            email: form.email.trim() || null,
            auto_confirm: form.autoConfirm,
            ...numbers,
          })
          .eq('id', establishment.id),
      );
      await refresh();
      toast.success('Configurações salvas.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <PageHeader title="Configurações" description="Dados do estabelecimento, contato e regras de agendamento." />

      <Card className="p-4">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Dados do estabelecimento</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome comercial">
            <input className="input" required minLength={2} maxLength={120} value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Segmento">
            <input className="input" value={form.segment} onChange={(e) => set('segment', e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Descrição" hint="Aparece na página pública.">
              <textarea className="input" rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Endereço">
              <input className="input" value={form.address} onChange={(e) => set('address', e.target.value)} />
            </Field>
          </div>
          <Field label="Cidade">
            <input className="input" value={form.city} onChange={(e) => set('city', e.target.value)} />
          </Field>
          <Field label="Estado (UF)">
            <input className="input" maxLength={2} value={form.state} onChange={(e) => set('state', e.target.value.toUpperCase())} />
          </Field>
        </div>
      </Card>

      <Card className="mt-4 p-4">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Contato e redes sociais</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Telefone">
            <input className="input" inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </Field>
          <Field label="WhatsApp (com DDD)" hint="Usado nos botões de contato e confirmação.">
            <input className="input" inputMode="tel" value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} />
          </Field>
          <Field label="Instagram" hint="Seu @ ou o link do perfil. Aparece como botão na página.">
            <input className="input" placeholder="@minhabarbearia" autoCapitalize="off" autoCorrect="off" value={form.instagram} onChange={(e) => set('instagram', e.target.value)} />
          </Field>
          <Field label="E-mail">
            <input className="input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </Field>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          O WhatsApp funciona por links de conversa: o cliente ou a equipe abre a conversa com a mensagem pronta. O envio automático de lembretes depende da
          integração com a WhatsApp Business Platform, ainda não configurada.
        </p>
      </Card>

      <Card className="mt-4 p-4">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Regras de agendamento</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Intervalo entre horários (min)" hint="De quanto em quanto tempo um horário é oferecido.">
            <input className="input" inputMode="numeric" required value={form.slotInterval} onChange={(e) => set('slotInterval', e.target.value)} />
          </Field>
          <Field label="Antecedência mínima (min)" hint="Tempo mínimo entre agora e o horário escolhido.">
            <input className="input" inputMode="numeric" required value={form.minAdvance} onChange={(e) => set('minAdvance', e.target.value)} />
          </Field>
          <Field label="Antecedência máxima (dias)" hint="Até quantos dias à frente o cliente pode agendar.">
            <input className="input" inputMode="numeric" required value={form.maxAdvance} onChange={(e) => set('maxAdvance', e.target.value)} />
          </Field>
          <Field label="Prazo para cancelar/reagendar (min)" hint="Antes do horário; depois disso, só pelo estabelecimento.">
            <input className="input" inputMode="numeric" required value={form.cancellationMin} onChange={(e) => set('cancellationMin', e.target.value)} />
          </Field>
          <Field label="Agendamentos em aberto por cliente" hint="Limite de reservas futuras pelo mesmo telefone.">
            <input className="input" inputMode="numeric" required value={form.maxActive} onChange={(e) => set('maxActive', e.target.value)} />
          </Field>
        </div>
        <div className="mt-4">
          <Toggle
            checked={form.autoConfirm}
            onChange={(v) => set('autoConfirm', v)}
            label="Confirmar automaticamente os agendamentos feitos pela página pública"
          />
          <p className="mt-1 text-xs text-slate-500">Desligado: o agendamento entra como “Pendente” até a equipe confirmar. O horário fica reservado nos dois casos.</p>
        </div>
      </Card>

      <div className="mt-6 flex justify-end">
        <Button type="submit" loading={saving}>
          Salvar configurações
        </Button>
      </div>
    </form>
  );
}
