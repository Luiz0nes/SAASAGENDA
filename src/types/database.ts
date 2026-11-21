// Tipos das tabelas e respostas RPC (espelham supabase/migrations).

export type EstablishmentStatus = 'active' | 'suspended' | 'inactive';
export type MemberRole = 'owner' | 'admin' | 'receptionist' | 'professional';
export type AppointmentStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'cancelled';
export type ThemeLayout = 'classic' | 'modern' | 'compact' | 'centered';
export type ThemeRadius = 'square' | 'soft' | 'rounded' | 'pill';
export type ButtonStyle = 'solid' | 'outline' | 'soft';
export type CardStyle = 'border' | 'shadow' | 'flat';
export type ColorMode = 'light' | 'dark' | 'system';
export type HeroAnimation = 'none' | 'soft' | 'dynamic';

export type Permission =
  | 'manage_appointments'
  | 'manage_customers'
  | 'manage_services'
  | 'manage_professionals'
  | 'manage_schedules'
  | 'manage_theme'
  | 'manage_settings'
  | 'manage_users'
  | 'view_reports';

export interface Profile {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  is_super_admin: boolean;
}

export interface PlanFeatures {
  custom_theme?: boolean;
  reports?: boolean;
}

export interface Plan {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  max_professionals: number | null;
  max_users: number | null;
  max_appointments_per_month: number | null;
  features: PlanFeatures;
  is_active: boolean;
}

export interface Establishment {
  id: string;
  name: string;
  slug: string;
  segment: string | null;
  description: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  whatsapp: string | null;
  /** nome de usuário, sem @ */
  instagram: string | null;
  email: string | null;
  logo_url: string | null;
  cover_url: string | null;
  status: EstablishmentStatus;
  timezone: string;
  slot_interval_minutes: number;
  min_advance_minutes: number;
  max_advance_days: number;
  cancellation_min_minutes: number;
  max_active_per_customer: number;
  auto_confirm: boolean;
  created_at: string;
}

export interface Membership {
  id: string;
  role: MemberRole;
  permissions: Partial<Record<Permission, boolean>>;
  professional_id: string | null;
  establishment: Establishment;
}

export interface Professional {
  id: string;
  establishment_id: string;
  name: string;
  photo_url: string | null;
  bio: string | null;
  specialty: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
}

export interface Service {
  id: string;
  establishment_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  price_cents: number;
  duration_minutes: number;
  buffer_minutes: number;
  sort_order: number;
  is_active: boolean;
}

export interface Customer {
  id: string;
  establishment_id: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  created_at: string;
}

export interface Appointment {
  id: string;
  establishment_id: string;
  professional_id: string;
  service_id: string;
  customer_id: string;
  starts_at: string;
  ends_at: string;
  price_cents: number;
  status: AppointmentStatus;
  source: 'public' | 'admin';
  customer_notes: string | null;
  admin_notes: string | null;
  cancellation_reason: string | null;
}

export interface AppointmentWithRelations extends Appointment {
  customer: Pick<Customer, 'id' | 'name' | 'phone'> | null;
  service: Pick<Service, 'id' | 'name' | 'duration_minutes'> | null;
  professional: Pick<Professional, 'id' | 'name'> | null;
}

export interface BusinessHour {
  id: string;
  establishment_id: string;
  weekday: number;
  opens_at: string;
  closes_at: string;
  is_closed: boolean;
}

export interface ProfessionalSchedule {
  id?: string;
  establishment_id: string;
  professional_id: string;
  weekday: number;
  starts_at: string;
  ends_at: string;
  break_start: string | null;
  break_end: string | null;
  is_working: boolean;
}

export interface BlockedTime {
  id: string;
  establishment_id: string;
  professional_id: string | null;
  starts_at: string;
  ends_at: string;
  reason: string | null;
}

export interface Theme {
  /** id do tema pronto que originou o visual (apenas informativo) */
  preset: string | null;
  primary_color: string;
  secondary_color: string;
  background_color: string;
  surface_color: string;
  text_color: string;
  dark_background_color: string;
  dark_surface_color: string;
  dark_text_color: string;
  font_heading: string;
  font_body: string;
  radius: ThemeRadius;
  button_style: ButtonStyle;
  card_style: CardStyle;
  layout: ThemeLayout;
  /** animação do topo da página pública */
  hero_animation: HeroAnimation;
  /** mostra o botão para o cliente alternar entre claro e escuro */
  dark_mode_toggle: boolean;
  default_mode: ColorMode;
  headline: string | null;
  about_text: string | null;
  gallery: string[];
  show_prices: boolean;
  show_professionals: boolean;
}

// ---- respostas RPC ----

export interface Slot {
  professional_id: string;
  slot_start: string;
}

export interface PublicService {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  price_cents: number;
  duration_minutes: number;
}

export interface PublicProfessional {
  id: string;
  name: string;
  photo_url: string | null;
  bio: string | null;
  specialty: string | null;
  service_ids: string[];
}

export interface PublicEstablishmentData {
  establishment: Pick<
    Establishment,
    | 'id' | 'name' | 'slug' | 'segment' | 'description' | 'address' | 'city' | 'state' | 'phone'
    | 'whatsapp' | 'instagram' | 'logo_url' | 'cover_url' | 'timezone' | 'max_advance_days'
    | 'min_advance_minutes' | 'cancellation_min_minutes' | 'auto_confirm'
  >;
  theme: Theme | null;
  business_hours: Pick<BusinessHour, 'weekday' | 'opens_at' | 'closes_at' | 'is_closed'>[];
  services: PublicService[];
  professionals: PublicProfessional[];
}

export interface PublicAppointment {
  id: string;
  public_token: string;
  status: AppointmentStatus;
  starts_at: string;
  ends_at: string;
  price_cents: number;
  customer_name: string;
  service: { id: string; name: string; duration_minutes: number };
  professional: { id: string; name: string };
  establishment: {
    name: string;
    slug: string;
    whatsapp: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    timezone: string;
    max_advance_days: number;
  };
  can_change: boolean;
}

export interface DashboardData {
  today: number;
  upcoming: number;
  total: number;
  pending: number;
  confirmed: number;
  completed: number;
  cancelled: number;
  no_show: number;
  estimated_revenue_cents: number;
  total_customers: number;
  total_professionals: number;
  top_services: { id: string; name: string; total: number }[];
}

export interface PlatformEstablishmentRow {
  id: string;
  name: string;
  slug: string;
  segment: string | null;
  status: EstablishmentStatus;
  created_at: string;
  plan_id: string | null;
  plan_name: string | null;
  owner_name: string | null;
  owner_email: string | null;
  appointments: number;
  customers: number;
  professionals: number;
}

export interface PlatformOverview {
  establishments_total: number;
  establishments_active: number;
  establishments_suspended: number;
  appointments_total: number;
  appointments_month: number;
  customers_total: number;
  professionals_total: number;
  establishments: PlatformEstablishmentRow[];
}
