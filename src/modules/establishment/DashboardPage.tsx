import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck, CalendarClock, CalendarDays, CheckCircle2, CircleDollarSign, Copy, UserRound, Users, XCircle } from 'lucide-react';
import { Button, Card, ErrorBox, PageHeader, Spinner, StatCard } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { addDays, formatMoney, todayInZone } from '../../lib/format';
import { supabase, unwrap } from '../../lib/supabase';
import { useLoad } from '../../lib/useLoad';
import type { DashboardData } from '../../types/database';
import { useEstablishment } from './EstablishmentContext';

const PERIODS = [
  { label: 'Hoje', days: 0 },
  { label: '7 dias', days: 7 },
  { label: '30 dias', days: 30 },
];

export function DashboardPage() {
  const { establishment } = useEstablishment();
  const toast = useToast();
  const [period, setPeriod] = useState(30);
  const today = todayInZone(establishment.timezone);

  const { data, loading, error, reload } = useLoad(
    async () =>
      unwrap<DashboardData>(
        await supabase.rpc('get_establishment_dashboard', {
          p_establishment_id: establishment.id,
          p_from: addDays(today, -period),
          p_to: addDays(today, period),
        }),
      ),
    [establishment.id, period, today],
  );

  const publicUrl = `${window.location.origin}/agendar/${establishment.slug}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success('Link copiado.');
    } catch {
      toast.error('Não foi possível copiar. Selecione o link e copie manualmente.');
    }
  }

  return (
    <>
      <PageHeader
        title="Início"
        description="Resumo do seu estabelecimento."
        actions={
          <div className="flex rounded-lg border border-slate-300 bg-white p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.days}
                type="button"
                onClick={() => setPeriod(p.days)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${period === p.days ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        }
      />

      <Card className="mb-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Seu link de agendamento</p>
          <a href={publicUrl} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-slate-900 underline">
            {publicUrl}
          </a>
        </div>
        <Button variant="secondary" size="sm" icon={<Copy className="h-4 w-4" />} onClick={() => void copyLink()}>
          Copiar link
        </Button>
      </Card>

      {loading && <Spinner />}
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {!loading && !error && data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Agendamentos hoje" value={data.today} icon={<CalendarDays className="h-4 w-4" />} />
            <StatCard label="Próximos" value={data.upcoming} icon={<CalendarClock className="h-4 w-4" />} />
            <StatCard label="Confirmados" value={data.confirmed} icon={<CalendarCheck className="h-4 w-4" />} />
            <StatCard label="Concluídos" value={data.completed} icon={<CheckCircle2 className="h-4 w-4" />} />
            <StatCard label="Cancelados" value={data.cancelled} icon={<XCircle className="h-4 w-4" />} />
            <StatCard label="Faturamento estimado" value={formatMoney(data.estimated_revenue_cents)} icon={<CircleDollarSign className="h-4 w-4" />} />
            <StatCard label="Clientes" value={data.total_customers} icon={<Users className="h-4 w-4" />} />
            <StatCard label="Profissionais" value={data.total_professionals} icon={<UserRound className="h-4 w-4" />} />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Confirmados, concluídos, cancelados e faturamento consideram {period === 0 ? 'o dia de hoje' : `${period} dias para trás e para frente`}. O faturamento soma confirmados e concluídos.
          </p>

          <Card className="mt-6 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Serviços mais agendados</h2>
              <Link to="/painel/agenda" className="text-xs font-medium text-slate-600 underline">
                Ver agenda
              </Link>
            </div>
            {data.top_services.length === 0 ? (
              <p className="text-sm text-slate-500">Ainda não há agendamentos no período.</p>
            ) : (
              <ul className="space-y-2">
                {data.top_services.map((service) => {
                  const max = data.top_services[0].total || 1;
                  return (
                    <li key={service.id}>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-700">{service.name}</span>
                        <span className="tabular-nums text-slate-500">{service.total}</span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-slate-100">
                        <div className="h-2 rounded-full bg-slate-900" style={{ width: `${Math.max(4, (service.total / max) * 100)}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </>
      )}
    </>
  );
}
