import { Link } from 'react-router-dom';
import { Building2, CalendarDays, UserRound, Users } from 'lucide-react';
import { Badge, Card, EmptyState, ErrorBox, PageHeader, Spinner, StatCard } from '../../components/ui';
import { ESTABLISHMENT_STATUS_LABEL } from '../../lib/format';
import { supabase, unwrap } from '../../lib/supabase';
import { useLoad } from '../../lib/useLoad';
import type { EstablishmentStatus, PlatformOverview } from '../../types/database';

export const STATUS_TONE: Record<EstablishmentStatus, 'green' | 'yellow' | 'gray'> = {
  active: 'green',
  suspended: 'yellow',
  inactive: 'gray',
};

export async function fetchOverview(): Promise<PlatformOverview> {
  return unwrap<PlatformOverview>(await supabase.rpc('get_platform_overview'));
}

export function SuperAdminDashboard() {
  const { data, loading, error, reload } = useLoad(fetchOverview, []);

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox message={error ?? 'Erro ao carregar.'} onRetry={() => void reload()} />;

  return (
    <>
      <PageHeader title="Visão geral" description="Indicadores consolidados de toda a plataforma." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Estabelecimentos" value={data.establishments_total} icon={<Building2 className="h-4 w-4" />} />
        <StatCard label="Ativos" value={data.establishments_active} icon={<Building2 className="h-4 w-4" />} />
        <StatCard label="Agendamentos no mês" value={data.appointments_month} icon={<CalendarDays className="h-4 w-4" />} />
        <StatCard label="Agendamentos (total)" value={data.appointments_total} icon={<CalendarDays className="h-4 w-4" />} />
        <StatCard label="Clientes" value={data.customers_total} icon={<Users className="h-4 w-4" />} />
        <StatCard label="Profissionais" value={data.professionals_total} icon={<UserRound className="h-4 w-4" />} />
        <StatCard label="Suspensos" value={data.establishments_suspended} icon={<Building2 className="h-4 w-4" />} />
      </div>

      <h2 className="mb-3 mt-8 text-base font-semibold text-slate-900">Por estabelecimento</h2>
      {data.establishments.length === 0 ? (
        <EmptyState
          title="Nenhum estabelecimento cadastrado"
          description="Cadastre o primeiro estabelecimento para começar."
          action={
            <Link to="/admin/estabelecimentos" className="text-sm font-medium text-slate-900 underline">
              Ir para estabelecimentos
            </Link>
          }
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Estabelecimento</th>
                <th className="px-4 py-3">Plano</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Agendamentos</th>
                <th className="px-4 py-3 text-right">Clientes</th>
                <th className="px-4 py-3 text-right">Profissionais</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.establishments.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{row.name}</td>
                  <td className="px-4 py-3 text-slate-600">{row.plan_name ?? 'Sem plano'}</td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[row.status]}>{ESTABLISHMENT_STATUS_LABEL[row.status]}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.appointments}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.customers}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.professionals}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
