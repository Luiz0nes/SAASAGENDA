import { CalendarDays, Clock, Crown, LayoutDashboard, Palette, QrCode, Scissors, Settings, UserRound, Users } from 'lucide-react';
import { PanelLayout, type NavItem } from '../../components/PanelLayout';
import { ESTABLISHMENT_STATUS_LABEL, ROLE_LABEL } from '../../lib/format';
import { EstablishmentProvider, useEstablishment } from './EstablishmentContext';

function Layout() {
  const { establishment, membership, memberships, can, select } = useEstablishment();
  const icon = 'h-4 w-4';

  // Cada item só aparece para quem tem a permissão correspondente.
  const items: NavItem[] = [
    { to: '/painel', label: 'Início', icon: <LayoutDashboard className={icon} />, end: true },
    { to: '/painel/agenda', label: 'Agenda', icon: <CalendarDays className={icon} /> },
  ];
  if (can('manage_customers') || can('manage_appointments')) items.push({ to: '/painel/clientes', label: 'Clientes', icon: <Users className={icon} /> });
  if (can('manage_services')) items.push({ to: '/painel/servicos', label: 'Serviços', icon: <Scissors className={icon} /> });
  if (can('manage_services')) items.push({ to: '/painel/planos', label: 'Planos mensais', icon: <Crown className={icon} /> });
  if (can('manage_professionals')) items.push({ to: '/painel/profissionais', label: 'Profissionais', icon: <UserRound className={icon} /> });
  if (can('manage_schedules')) items.push({ to: '/painel/horarios', label: 'Horários e bloqueios', icon: <Clock className={icon} /> });
  if (can('manage_theme')) items.push({ to: '/painel/personalizacao', label: 'Personalização', icon: <Palette className={icon} /> });
  items.push({ to: '/painel/qrcode', label: 'QR Code', icon: <QrCode className={icon} /> });
  if (can('manage_settings')) items.push({ to: '/painel/configuracoes', label: 'Configurações', icon: <Settings className={icon} /> });

  return (
    <PanelLayout
      key={establishment.id}
      title={establishment.name}
      subtitle={ROLE_LABEL[membership.role]}
      items={items}
      extra={
        memberships.length > 1 ? (
          <select className="input" value={establishment.id} onChange={(e) => select(e.target.value)} aria-label="Trocar de estabelecimento">
            {memberships.map((m) => (
              <option key={m.establishment.id} value={m.establishment.id}>
                {m.establishment.name}
              </option>
            ))}
          </select>
        ) : undefined
      }
      banner={
        establishment.status !== 'active' ? (
          <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">
            Estabelecimento {ESTABLISHMENT_STATUS_LABEL[establishment.status].toLowerCase()}: a página pública está fora do ar e novos agendamentos estão bloqueados. Fale com o suporte da plataforma.
          </div>
        ) : undefined
      }
    />
  );
}

export function EstablishmentLayout() {
  return (
    <EstablishmentProvider>
      <Layout />
    </EstablishmentProvider>
  );
}
