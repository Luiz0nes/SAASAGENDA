import { Navigate, Route, Routes } from 'react-router-dom';
import { ForgotPasswordPage, LoginPage, NoAccessPage, ResetPasswordPage } from './modules/auth/AuthPages';
import { RequireAuth, RequireMembership, RequireSuperAdmin } from './modules/auth/guards';
import { AppointmentsPage } from './modules/establishment/AppointmentsPage';
import { CustomerPlansPage } from './modules/establishment/CustomerPlansPage';
import { CustomersPage } from './modules/establishment/CustomersPage';
import { DashboardPage } from './modules/establishment/DashboardPage';
import { EstablishmentLayout } from './modules/establishment/EstablishmentLayout';
import { HoursPage } from './modules/establishment/HoursPage';
import { ProfessionalsPage } from './modules/establishment/ProfessionalsPage';
import { QrCodePage } from './modules/establishment/QrCodePage';
import { ServicesPage } from './modules/establishment/ServicesPage';
import { SettingsPage } from './modules/establishment/SettingsPage';
import { ThemePage } from './modules/establishment/ThemePage';
import { AppointmentPage, MyAppointmentsPage } from './modules/public/AppointmentPage';
import { BookingPage } from './modules/public/BookingPage';
import { LandingPage } from './modules/public/LandingPage';
import { PreviewPage } from './modules/public/PreviewPage';
import { EstablishmentsPage } from './modules/superadmin/EstablishmentsPage';
import { PlansPage } from './modules/superadmin/PlansPage';
import { SuperAdminDashboard } from './modules/superadmin/SuperAdminDashboard';
import { SuperAdminLayout } from './modules/superadmin/SuperAdminLayout';

export default function App() {
  return (
    <Routes>
      {/* Páginas públicas */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/recuperar-senha" element={<ForgotPasswordPage />} />
      <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
      <Route path="/agendar/:slug" element={<BookingPage />} />
      <Route path="/agendamento/:token" element={<AppointmentPage />} />
      <Route path="/meus-agendamentos" element={<MyAppointmentsPage />} />
      <Route
        path="/preview/:establishmentId"
        element={
          <RequireAuth>
            <PreviewPage />
          </RequireAuth>
        }
      />
      <Route
        path="/sem-acesso"
        element={
          <RequireAuth>
            <NoAccessPage />
          </RequireAuth>
        }
      />

      {/* Painel do SuperAdmin */}
      <Route
        path="/admin"
        element={
          <RequireSuperAdmin>
            <SuperAdminLayout />
          </RequireSuperAdmin>
        }
      >
        <Route index element={<SuperAdminDashboard />} />
        <Route path="estabelecimentos" element={<EstablishmentsPage />} />
        <Route path="planos" element={<PlansPage />} />
      </Route>

      {/* Painel do estabelecimento (proprietário, equipe e profissionais) */}
      <Route
        path="/painel"
        element={
          <RequireMembership>
            <EstablishmentLayout />
          </RequireMembership>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="agenda" element={<AppointmentsPage />} />
        <Route path="clientes" element={<CustomersPage />} />
        <Route path="servicos" element={<ServicesPage />} />
        <Route path="planos" element={<CustomerPlansPage />} />
        <Route path="profissionais" element={<ProfessionalsPage />} />
        <Route path="horarios" element={<HoursPage />} />
        <Route path="personalizacao" element={<ThemePage />} />
        <Route path="qrcode" element={<QrCodePage />} />
        <Route path="configuracoes" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
