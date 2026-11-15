import { useState, type FormEvent } from 'react';
import { MessageCircle, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Button, Card, ConfirmModal, EmptyState, ErrorBox, Field, Modal, PageHeader, Spinner } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { formatPhone, onlyDigits, whatsappLink } from '../../lib/format';
import { errorMessage, supabase, unwrap } from '../../lib/supabase';
import { useLoad } from '../../lib/useLoad';
import type { Customer } from '../../types/database';
import { useEstablishment } from './EstablishmentContext';

interface CustomerForm {
  id: string | null;
  name: string;
  phone: string;
  email: string;
  notes: string;
}

const EMPTY: CustomerForm = { id: null, name: '', phone: '', email: '', notes: '' };
const PAGE_SIZE = 50;

export function CustomersPage() {
  const { establishment, can } = useEstablishment();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const term = search.trim();

  const { data, loading, error, reload } = useLoad(async () => {
    let query = supabase
      .from('customers')
      .select('*', { count: 'exact' })
      .eq('establishment_id', establishment.id)
      .order('name')
      .limit(limit);
    if (term.length >= 2) {
      const safe = term.replace(/[%,()]/g, ' ');
      const digits = onlyDigits(term);
      query = digits.length >= 3 ? query.or(`name.ilike.%${safe}%,phone.ilike.%${digits}%`) : query.ilike('name', `%${safe}%`);
    }
    const result = await query;
    return { rows: unwrap<Customer[]>(result), total: result.count ?? 0 };
  }, [establishment.id, term, limit]);

  const [form, setForm] = useState<CustomerForm | null>(null);
  const [toDelete, setToDelete] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    const phone = onlyDigits(form.phone);
    if (phone.length < 10 || phone.length > 13) return toast.error('Informe um telefone válido com DDD.');
    const payload = {
      establishment_id: establishment.id,
      name: form.name.trim(),
      phone,
      email: form.email.trim() || null,
      notes: form.notes.trim() || null,
    };
    setSaving(true);
    try {
      if (form.id) unwrap(await supabase.from('customers').update(payload).eq('id', form.id));
      else unwrap(await supabase.from('customers').insert(payload));
      toast.success('Cliente salvo.');
      setForm(null);
      await reload();
    } catch (err) {
      const e = err as { code?: string };
      toast.error(e.code === '23505' ? 'Já existe um cliente com este telefone.' : errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!toDelete) return;
    setSaving(true);
    try {
      unwrap(await supabase.from('customers').delete().eq('id', toDelete.id));
      toast.success('Cliente excluído.');
      setToDelete(null);
      await reload();
    } catch (err) {
      const e = err as { code?: string };
      toast.error(e.code === '23503' ? 'Este cliente possui agendamentos e não pode ser excluído.' : errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Clientes cadastrados pela equipe ou pela página pública de agendamento."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setForm(EMPTY)}>
            Novo cliente
          </Button>
        }
      />

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          className="input pl-9"
          placeholder="Buscar por nome ou telefone"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setLimit(PAGE_SIZE);
          }}
        />
      </div>

      {loading && !data && <Spinner />}
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {!error && data && data.rows.length === 0 && (
        <EmptyState
          title={term ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
          description={term ? 'Tente outro nome ou telefone.' : 'Os clientes aparecem aqui assim que fizerem o primeiro agendamento.'}
        />
      )}
      {!error && data && data.rows.length > 0 && (
        <>
          <Card className="divide-y divide-slate-100">
            {data.rows.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{c.name}</p>
                  <a href={whatsappLink(c.phone)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-emerald-700 hover:underline">
                    <MessageCircle className="h-4 w-4" />
                    {formatPhone(c.phone)}
                  </a>
                  {c.email && <p className="truncate text-xs text-slate-500">{c.email}</p>}
                  {c.notes && <p className="truncate text-xs text-slate-500">Obs.: {c.notes}</p>}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="sm" icon={<Pencil className="h-4 w-4" />} onClick={() => setForm({ id: c.id, name: c.name, phone: formatPhone(c.phone), email: c.email ?? '', notes: c.notes ?? '' })} aria-label="Editar" />
                  {can('manage_customers') && <Button variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" />} onClick={() => setToDelete(c)} aria-label="Excluir" />}
                </div>
              </div>
            ))}
          </Card>
          <p className="mt-3 text-center text-xs text-slate-500">
            Mostrando {data.rows.length} de {data.total}
          </p>
          {data.rows.length < data.total && (
            <div className="mt-2 flex justify-center">
              <Button variant="secondary" size="sm" loading={loading} onClick={() => setLimit(limit + PAGE_SIZE)}>
                Carregar mais
              </Button>
            </div>
          )}
        </>
      )}

      <Modal open={form !== null} title={form?.id ? 'Editar cliente' : 'Novo cliente'} onClose={() => setForm(null)}>
        {form && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Nome">
              <input className="input" required minLength={2} maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Telefone / WhatsApp (com DDD)">
              <input className="input" inputMode="tel" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="E-mail (opcional)">
              <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Observações (opcional)">
              <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
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
        title="Excluir cliente"
        message={`Excluir “${toDelete?.name ?? ''}”? Clientes com agendamentos no histórico não podem ser excluídos.`}
        confirmLabel="Excluir"
        danger
        loading={saving}
        onConfirm={() => void handleDelete()}
        onClose={() => setToDelete(null)}
      />
    </>
  );
}
