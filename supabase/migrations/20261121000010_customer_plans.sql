-- =====================================================================
-- 0010 · PLANOS DE ASSINATURA DO ESTABELECIMENTO (VITRINE)
-- Planos mensais que o estabelecimento oferece aos clientes, exibidos na
-- página pública com o botão "Quero assinar" (WhatsApp). Não há cobrança
-- nem controle de sessões: é só a apresentação.
-- (Não confundir com public.plans, os planos da plataforma SaaS.)
-- =====================================================================

create table public.customer_plans (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  tagline text check (tagline is null or char_length(tagline) <= 80),
  -- [{"label": "Corte mensal", "price_cents": 11000, "note": "Inclui sobrancelha de cortesia."}]
  options jsonb not null default '[]'::jsonb
    check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 1 and 4),
  benefits text check (benefits is null or char_length(benefits) <= 500),
  highlight boolean not null default false,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customer_plans_establishment_idx on public.customer_plans (establishment_id, sort_order);

-- texto "Como funciona" exibido abaixo dos planos
alter table public.establishments
  add column if not exists plans_note text
    check (plans_note is null or char_length(plans_note) <= 1000);

create trigger customer_plans_touch before update on public.customer_plans
  for each row execute function private.touch_updated_at();
create trigger customer_plans_audit after insert or update or delete on public.customer_plans
  for each row execute function private.audit_row_change();

alter table public.customer_plans enable row level security;
revoke all on public.customer_plans from anon;

create policy customer_plans_select on public.customer_plans
  for select to authenticated
  using (public.is_member(establishment_id));

create policy customer_plans_write on public.customer_plans
  for all to authenticated
  using (public.has_permission(establishment_id, 'manage_services'))
  with check (public.has_permission(establishment_id, 'manage_services'));

-- planos ativos e o texto "Como funciona" nos dados públicos
create or replace function public.get_public_establishment(p_slug text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'establishment', jsonb_build_object(
      'id', e.id, 'name', e.name, 'slug', e.slug, 'segment', e.segment,
      'description', e.description, 'address', e.address, 'city', e.city, 'state', e.state,
      'phone', e.phone, 'whatsapp', e.whatsapp, 'instagram', e.instagram, 'plans_note', e.plans_note, 'logo_url', e.logo_url, 'cover_url', e.cover_url,
      'timezone', e.timezone, 'max_advance_days', e.max_advance_days,
      'min_advance_minutes', e.min_advance_minutes,
      'cancellation_min_minutes', e.cancellation_min_minutes,
      'auto_confirm', e.auto_confirm
    ),
    'theme', (
      select to_jsonb(t) - 'establishment_id' - 'updated_at'
      from public.establishment_themes t where t.establishment_id = e.id
    ),
    'business_hours', coalesce((
      select jsonb_agg(jsonb_build_object(
        'weekday', bh.weekday, 'opens_at', bh.opens_at, 'closes_at', bh.closes_at, 'is_closed', bh.is_closed
      ) order by bh.weekday)
      from public.business_hours bh where bh.establishment_id = e.id
    ), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'description', s.description, 'image_url', s.image_url,
        'price_cents', s.price_cents, 'compare_price_cents', s.compare_price_cents,
        'duration_minutes', s.duration_minutes
      ) order by s.sort_order, s.name)
      from public.services s
      where s.establishment_id = e.id and s.is_active
        and exists (
          select 1 from public.professional_services x
          join public.professionals p on p.id = x.professional_id and p.is_active
          where x.service_id = s.id
        )
    ), '[]'::jsonb),
    'customer_plans', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', cp.id, 'name', cp.name, 'tagline', cp.tagline, 'options', cp.options,
        'benefits', cp.benefits, 'highlight', cp.highlight
      ) order by cp.sort_order, cp.name)
      from public.customer_plans cp
      where cp.establishment_id = e.id and cp.is_active
    ), '[]'::jsonb),
    'professionals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'photo_url', p.photo_url, 'bio', p.bio, 'specialty', p.specialty,
        'service_ids', coalesce((
          select jsonb_agg(x.service_id) from public.professional_services x where x.professional_id = p.id
        ), '[]'::jsonb)
      ) order by p.name)
      from public.professionals p
      where p.establishment_id = e.id and p.is_active
    ), '[]'::jsonb)
  )
  from public.establishments e
  where e.slug = lower(p_slug) and e.status = 'active';
$$;

