import { useState, type FormEvent } from 'react';
import { ExternalLink, Pencil, Plus } from 'lucide-react';
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Modal, PageHeader, Spinner } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { ESTABLISHMENT_STATUS_LABEL, slugify } from '../../lib/format';
import { errorMessage, invokeFunction, supabase, unwrap } from '../../lib/supabase';
import { useLoad } from '../../lib/useLoad';
import type { EstablishmentStatus, Plan, PlatformEstablishmentRow } from '../../types/database';
import { fetchOverview, STATUS_TONE } from './SuperAdminDashboard';

const SEGMENTS = ['Barbearia', 'Salão de beleza', 'Clínica', 'Odontologia', 'Estética', 'Profissional autônomo', 'Outro'];

interface CreateForm {
  name: string;
  slug: string;
  slugTouched: boolean;
  segment: string;
  phone: string;
  whatsapp: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
  planId: string;
}

const EMPTY_CREATE: CreateForm = {
  name: '', slug: '', slugTouched: false, segment: SEGMENTS[0], phone: '', whatsapp: '',
  ownerName: '', ownerEmail: '', ownerPassword: '', planId: '',
};

interface EditForm {
  id: string;
  name: string;
  slug: string;
  segment: string;
  status: EstablishmentStatus;
  planId: string;
  originalPlanId: string;
}

export function EstablishmentsPage() {
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(async () => {
    const [overview, plans] = await Promise.all([fetchOverview(), supabase.from('plans').select('*').order('name')]);
    return { rows: overview.establishments, plans: unwrap<Plan[]>(plans) };
  }, []);

  const [create, setCreate] = useState<CreateForm | null>(null);
  const [edit, setEdit] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!create) return;
    setSaving(true);
    try {
      const result = await invokeFunction<{ invited: boolean }>('admin-create-establishment', {
        establishment: {
          name: create.name,
          slug: create.slug,
          segment: create.segment,
          phone: create.phone,
          whatsapp: create.whatsapp,
        },
        owner: { full_name: create.ownerName, email: create.ownerEmail, password: create.ownerPassword || undefined },
        plan_id: create.planId || null,
        redirect_to: `${window.location.origin}/redefinir-senha`,
      });
      toast.success(result.invited ? 'Estabelecimento criado. O proprietário recebeu um convite por e-mail.' : 'Estabelecimento e proprietário criados.');
      setCreate(null);
      await reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(event: FormEvent) {
    event.preventDefault();
    if (!edit) return;
    setSaving(true);
    try {
      unwrap(
        await supabase
          .from('establishments')
          .update({ name: edit.name.trim(), slug: edit.slug.trim(), segment: edit.segment, status: edit.status })
          .eq('id', edit.id),
      );
      if (edit.planId !== edit.originalPlanId) {
        if (edit.planId) {
          unwrap(
            await supabase
              .from('subscriptions')
              .upsert({ establishment_id: edit.id, plan_id: edit.planId, status: 'active' }, { onConflict: 'establishment_id' }),
          );
        } else {
          unwrap(await supabase.from('subscriptions').delete().eq('establishment_id', edit.id));
        }
      }
      toast.success('Estabelecimento atualizado.');
      setEdit(null);
      await reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function openEdit(row: PlatformEstablishmentRow) {
    setEdit({
      id: row.id,
      name: row.name,
      slug: row.slug,
      segment: row.segment ?? SEGMENTS[0],
      status: row.status,
      planId: row.plan_id ?? '',
      originalPlanId: row.plan_id ?? '',
    });
  }

  return (
    <>
      <PageHeader
        title="Estabelecimentos"
        description="Cadastre estabelecimentos, crie o acesso do proprietário e controle status e plano."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreate(EMPTY_CREATE)}>
            Novo estabelecimento
          </Button>
        }
      />

      {loading && <Spinner />}
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {!loading && !error && data && data.rows.length === 0 && (
        <EmptyState title="Nenhum estabelecimento cadastrado" description="Clique em “Novo estabelecimento” para cadastrar o primeiro cliente da plataforma." />
      )}
      {!loading && !error && data && data.rows.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {data.rows.map((row) => (
            <Card key={row.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{row.name}</p>
                  <p className="truncate text-xs text-slate-500">/agendar/{row.slug}</p>
                </div>
                <Badge tone={STATUS_TONE[row.status]}>{ESTABLISHMENT_STATUS_LABEL[row.status]}</Badge>
              </div>
              <dl className="mt-3 space-y-1 text-sm text-slate-600">
                <div className="flex justify-between gap-3">
                  <dt>Proprietário</dt>
                  <dd className="truncate text-right text-slate-900">{row.owner_name || row.owner_email || '—'}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>E-mail</dt>
                  <dd className="truncate text-right">{row.owner_email ?? '—'}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Plano</dt>
                  <dd>{row.plan_name ?? 'Sem plano (sem limites)'}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Agendamentos · Clientes · Profissionais</dt>
                  <dd className="tabular-nums">
                    {row.appointments} · {row.customers} · {row.professionals}
                  </dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" icon={<Pencil className="h-4 w-4" />} onClick={() => openEdit(row)}>
                  Editar
                </Button>
                <a
                  href={`/agendar/${row.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  <ExternalLink className="h-4 w-4" />
                  Página pública
                </a>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={create !== null} title="Novo estabelecimento" onClose={() => setCreate(null)} wide>
        {create && (
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome do estabelecimento">
                <input
                  className="input"
                  required
                  minLength={2}
                  maxLength={120}
                  value={create.name}
                  onChange={(e) =>
                    setCreate({ ...create, name: e.target.value, slug: create.slugTouched ? create.slug : slugify(e.target.value) })
                  }
                />
              </Field>
              <Field label="Endereço da página (slug)" hint={`/agendar/${create.slug || 'nome-do-estabelecimento'}`}>
                <input
                  className="input"
                  required
                  minLength={3}
                  maxLength={60}
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  title="Apenas letras minúsculas, números e hífens"
                  value={create.slug}
                  onChange={(e) => setCreate({ ...create, slug: e.target.value.toLowerCase(), slugTouched: true })}
                />
              </Field>
              <Field label="Segmento">
                <select className="input" value={create.segment} onChange={(e) => setCreate({ ...create, segment: e.target.value })}>
                  {SEGMENTS.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <Field label="Plano">
                <select className="input" value={create.planId} onChange={(e) => setCreate({ ...create, planId: e.target.value })}>
                  <option value="">Sem plano (sem limites)</option>
                  {data?.plans.filter((p) => p.is_active).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Telefone">
                <input className="input" inputMode="tel" value={create.phone} onChange={(e) => setCreate({ ...create, phone: e.target.value })} />
              </Field>
              <Field label="WhatsApp">
                <input className="input" inputMode="tel" value={create.whatsapp} onChange={(e) => setCreate({ ...create, whatsapp: e.target.value })} />
              </Field>
            </div>

            <div className="border-t border-slate-200 pt-4">
              <p className="mb-3 text-sm font-semibold text-slate-900">Acesso do proprietário</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nome do proprietário">
                  <input className="input" required minLength={2} value={create.ownerName} onChange={(e) => setCreate({ ...create, ownerName: e.target.value })} />
                </Field>
                <Field label="E-mail de acesso">
                  <input className="input" type="email" required value={create.ownerEmail} onChange={(e) => setCreate({ ...create, ownerEmail: e.target.value })} />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Senha inicial (opcional)" hint="Em branco: o proprietário recebe um convite por e-mail para criar a própria senha.">
                    <input
                      className="input"
                      type="text"
                      autoComplete="off"
                      minLength={8}
                      maxLength={72}
                      value={create.ownerPassword}
                      onChange={(e) => setCreate({ ...create, ownerPassword: e.target.value })}
                    />
                  </Field>
                </div>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => setCreate(null)} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" loading={saving}>
                Criar estabelecimento
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={edit !== null} title="Editar estabelecimento" onClose={() => setEdit(null)}>
        {edit && (
          <form onSubmit={handleEdit} className="space-y-4">
            <Field label="Nome">
              <input className="input" required minLength={2} maxLength={120} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </Field>
            <Field label="Endereço da página (slug)" hint="Alterar o slug muda o link público do estabelecimento.">
              <input
                className="input"
                required
                minLength={3}
                maxLength={60}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                value={edit.slug}
                onChange={(e) => setEdit({ ...edit, slug: e.target.value.toLowerCase() })}
              />
            </Field>
            <Field label="Segmento">
              <select className="input" value={edit.segment} onChange={(e) => setEdit({ ...edit, segment: e.target.value })}>
                {(SEGMENTS.includes(edit.segment) ? SEGMENTS : [edit.segment, ...SEGMENTS]).map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Status" hint="Suspenso ou desativado: a página pública sai do ar e não entram novos agendamentos.">
              <select className="input" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value as EstablishmentStatus })}>
                <option value="active">Ativo</option>
                <option value="suspended">Suspenso</option>
                <option value="inactive">Desativado</option>
              </select>
            </Field>
            <Field label="Plano">
              <select className="input" value={edit.planId} onChange={(e) => setEdit({ ...edit, planId: e.target.value })}>
                <option value="">Sem plano (sem limites)</option>
                {data?.plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => setEdit(null)} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" loading={saving}>
                Salvar
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
