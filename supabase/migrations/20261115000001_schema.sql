-- =====================================================================
-- 0001 · ESTRUTURA DO BANCO
-- Plataforma SaaS de agendamento multi-tenant.
-- Toda tabela de negócio carrega establishment_id (o "tenant").
-- =====================================================================

create extension if not exists btree_gist with schema extensions;

-- Schema interno: funções aqui NÃO ficam expostas pela API REST.
create schema if not exists private;

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type public.establishment_status as enum ('active', 'suspended', 'inactive');
create type public.member_role as enum ('owner', 'admin', 'receptionist', 'professional');
create type public.appointment_status as enum ('pending', 'confirmed', 'completed', 'cancelled', 'no_show');
create type public.appointment_source as enum ('public', 'admin');
create type public.subscription_status as enum ('trial', 'active', 'past_due', 'cancelled');
create type public.notification_channel as enum ('whatsapp_link', 'whatsapp_api', 'email');
create type public.notification_status as enum ('pending', 'sent', 'failed', 'skipped');

-- ---------------------------------------------------------------------
-- profiles · 1:1 com auth.users
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  email text,
  phone text,
  is_super_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- plans · planos comerciais (gerenciados pelo SuperAdmin)
-- Limites nulos = ilimitado.
-- ---------------------------------------------------------------------
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  price_cents integer not null default 0 check (price_cents >= 0),
  max_professionals integer check (max_professionals is null or max_professionals >= 0),
  max_users integer check (max_users is null or max_users >= 0),
  max_appointments_per_month integer check (max_appointments_per_month is null or max_appointments_per_month >= 0),
  -- recursos liga/desliga: {"custom_theme": true, "reports": true}
  features jsonb not null default '{"custom_theme": true, "reports": true}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- establishments · o tenant
-- ---------------------------------------------------------------------
create table public.establishments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 60),
  segment text,
  description text,
  address text,
  city text,
  state text,
  phone text,
  whatsapp text,
  email text,
  logo_url text,
  cover_url text,
  status public.establishment_status not null default 'active',
  timezone text not null default 'America/Sao_Paulo',
  -- regras de agendamento
  slot_interval_minutes integer not null default 30 check (slot_interval_minutes between 5 and 240),
  min_advance_minutes integer not null default 60 check (min_advance_minutes >= 0),
  max_advance_days integer not null default 60 check (max_advance_days between 1 and 365),
  cancellation_min_minutes integer not null default 120 check (cancellation_min_minutes >= 0),
  max_active_per_customer integer not null default 3 check (max_active_per_customer between 1 and 50),
  auto_confirm boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- subscriptions · plano atribuído a cada estabelecimento
-- ---------------------------------------------------------------------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null unique references public.establishments (id) on delete cascade,
  plan_id uuid not null references public.plans (id) on delete restrict,
  status public.subscription_status not null default 'active',
  started_at timestamptz not null default now(),
  expires_at timestamptz,
  -- reservado para futura integração com gateway de pagamento
  external_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscriptions_plan_idx on public.subscriptions (plan_id);

-- ---------------------------------------------------------------------
-- professionals
-- ---------------------------------------------------------------------
create table public.professionals (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  photo_url text,
  bio text,
  specialty text,
  phone text,
  email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, establishment_id)
);
create index professionals_establishment_idx on public.professionals (establishment_id);

-- ---------------------------------------------------------------------
-- establishment_users · vínculo usuário × estabelecimento × papel
-- ---------------------------------------------------------------------
create table public.establishment_users (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null,
  -- permissões finas (para recepcionista/profissional). Chaves:
  -- manage_appointments, manage_customers, manage_services, manage_professionals,
  -- manage_schedules, manage_theme, manage_settings, manage_users, view_reports
  permissions jsonb not null default '{}'::jsonb,
  -- quando o usuário é um profissional, aponta para a agenda dele
  professional_id uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (establishment_id, user_id),
  foreign key (professional_id, establishment_id)
    references public.professionals (id, establishment_id) on delete set null (professional_id)
);
create index establishment_users_user_idx on public.establishment_users (user_id);
-- só pode existir um proprietário por estabelecimento
create unique index establishment_users_single_owner
  on public.establishment_users (establishment_id) where role = 'owner';

-- ---------------------------------------------------------------------
-- services
-- ---------------------------------------------------------------------
create table public.services (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  description text,
  image_url text,
  price_cents integer not null default 0 check (price_cents >= 0),
  duration_minutes integer not null check (duration_minutes between 5 and 720),
  buffer_minutes integer not null default 0 check (buffer_minutes between 0 and 240),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, establishment_id)
);
create index services_establishment_idx on public.services (establishment_id);

-- ---------------------------------------------------------------------
-- professional_services · quais profissionais realizam quais serviços
-- As FKs compostas impedem ligar registros de estabelecimentos diferentes.
-- ---------------------------------------------------------------------
create table public.professional_services (
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  professional_id uuid not null,
  service_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (professional_id, service_id),
  foreign key (professional_id, establishment_id)
    references public.professionals (id, establishment_id) on delete cascade,
  foreign key (service_id, establishment_id)
    references public.services (id, establishment_id) on delete cascade
);
create index professional_services_service_idx on public.professional_services (service_id);
create index professional_services_establishment_idx on public.professional_services (establishment_id);

-- ---------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  phone text not null check (phone ~ '^[0-9]{10,13}$'),
  email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, establishment_id),
  unique (establishment_id, phone)
);

-- ---------------------------------------------------------------------
-- appointments
-- ends_at         = fim do atendimento (início + duração do serviço)
-- occupied_until  = ends_at + intervalo; é até onde a agenda fica travada
-- Ambos são preenchidos por trigger (ver 0002), nunca pelo cliente.
-- ---------------------------------------------------------------------
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  professional_id uuid not null,
  service_id uuid not null,
  customer_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  buffer_minutes integer not null default 0,
  occupied_until timestamptz not null,
  price_cents integer not null default 0 check (price_cents >= 0),
  status public.appointment_status not null default 'pending',
  source public.appointment_source not null default 'admin',
  customer_notes text,
  admin_notes text,
  -- código secreto que permite ao cliente consultar/cancelar/reagendar
  public_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  cancelled_at timestamptz,
  cancellation_reason text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (occupied_until >= ends_at),
  foreign key (professional_id, establishment_id)
    references public.professionals (id, establishment_id) on delete restrict,
  foreign key (service_id, establishment_id)
    references public.services (id, establishment_id) on delete restrict,
  foreign key (customer_id, establishment_id)
    references public.customers (id, establishment_id) on delete restrict,
  -- GARANTIA FINAL CONTRA HORÁRIO DUPLICADO:
  -- o próprio PostgreSQL recusa dois agendamentos ativos do mesmo
  -- profissional com períodos sobrepostos, mesmo em requisições simultâneas.
  constraint appointments_no_overlap exclude using gist (
    professional_id with =,
    tstzrange(starts_at, occupied_until, '[)') with &&
  ) where (status in ('pending', 'confirmed', 'completed'))
);
create index appointments_establishment_start_idx on public.appointments (establishment_id, starts_at);
create index appointments_professional_start_idx on public.appointments (professional_id, starts_at);
create index appointments_customer_idx on public.appointments (customer_id);
create index appointments_service_idx on public.appointments (service_id);

-- ---------------------------------------------------------------------
-- business_hours · funcionamento do estabelecimento (0 = domingo … 6 = sábado)
-- ---------------------------------------------------------------------
create table public.business_hours (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  opens_at time not null default '09:00',
  closes_at time not null default '18:00',
  is_closed boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (establishment_id, weekday),
  check (closes_at > opens_at)
);

-- ---------------------------------------------------------------------
-- professional_schedules · agenda semanal de cada profissional
-- ---------------------------------------------------------------------
create table public.professional_schedules (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  professional_id uuid not null,
  weekday smallint not null check (weekday between 0 and 6),
  starts_at time not null default '09:00',
  ends_at time not null default '18:00',
  break_start time,
  break_end time,
  is_working boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (professional_id, weekday),
  check (ends_at > starts_at),
  check (
    (break_start is null and break_end is null)
    or (break_start is not null and break_end is not null and break_end > break_start)
  ),
  foreign key (professional_id, establishment_id)
    references public.professionals (id, establishment_id) on delete cascade
);
create index professional_schedules_establishment_idx on public.professional_schedules (establishment_id);

-- ---------------------------------------------------------------------
-- blocked_times · bloqueios e folgas
-- professional_id nulo = bloqueio do estabelecimento inteiro
-- ---------------------------------------------------------------------
create table public.blocked_times (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  professional_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_by uuid,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  foreign key (professional_id, establishment_id)
    references public.professionals (id, establishment_id) on delete cascade
);
create index blocked_times_lookup_idx on public.blocked_times (establishment_id, starts_at, ends_at);

-- ---------------------------------------------------------------------
-- establishment_themes · identidade visual da página pública
-- ---------------------------------------------------------------------
create table public.establishment_themes (
  establishment_id uuid primary key references public.establishments (id) on delete cascade,
  primary_color text not null default '#0f172a' check (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  secondary_color text not null default '#2563eb' check (secondary_color ~ '^#[0-9a-fA-F]{6}$'),
  background_color text not null default '#f8fafc' check (background_color ~ '^#[0-9a-fA-F]{6}$'),
  text_color text not null default '#0f172a' check (text_color ~ '^#[0-9a-fA-F]{6}$'),
  layout text not null default 'classic' check (layout in ('classic', 'modern', 'compact')),
  headline text,
  about_text text,
  gallery jsonb not null default '[]'::jsonb,
  show_prices boolean not null default true,
  show_professionals boolean not null default true,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- notifications · fila preparada para a futura WhatsApp Business API.
-- Nada é "enviado" de mentira: sem integração configurada, fica vazia.
-- ---------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  appointment_id uuid references public.appointments (id) on delete cascade,
  channel public.notification_channel not null,
  kind text not null,
  status public.notification_status not null default 'pending',
  payload jsonb not null default '{}'::jsonb,
  error text,
  scheduled_for timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_establishment_idx on public.notifications (establishment_id, created_at desc);

-- ---------------------------------------------------------------------
-- audit_logs · histórico de alterações importantes
-- Sem FKs de propósito: o log precisa sobreviver à exclusão do registro.
-- ---------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  establishment_id uuid,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_establishment_idx on public.audit_logs (establishment_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity, entity_id);

-- ---------------------------------------------------------------------
-- platform_settings · configurações globais (somente SuperAdmin)
-- ---------------------------------------------------------------------
create table public.platform_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
