import { Building2, CreditCard, LayoutDashboard } from 'lucide-react';
import { PanelLayout } from '../../components/PanelLayout';

export function SuperAdminLayout() {
  return (
    <PanelLayout
      title="Administração"
      subtitle="SuperAdmin da plataforma"
      items={[
        { to: '/admin', label: 'Visão geral', icon: <LayoutDashboard className="h-4 w-4" />, end: true },
        { to: '/admin/estabelecimentos', label: 'Estabelecimentos', icon: <Building2 className="h-4 w-4" /> },
        { to: '/admin/planos', label: 'Planos', icon: <CreditCard className="h-4 w-4" /> },
      ]}
    />
  );
}
