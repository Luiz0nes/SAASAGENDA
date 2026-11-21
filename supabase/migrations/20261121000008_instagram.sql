-- =====================================================================
-- 0008 · INSTAGRAM DO ESTABELECIMENTO
-- Guarda só o nome de usuário (sem @ e sem link). A página pública
-- mostra o botão "Seguir no Instagram" quando ele está preenchido.
-- =====================================================================

alter table public.establishments
  add column if not exists instagram text
    check (instagram is null or instagram ~ '^[A-Za-z0-9._]{1,30}$');

-- inclui o instagram nos dados públicos do estabelecimento
create or replace function public.get_public_establishment(p_slug text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'establishment', jsonb_build_object(
      'id', e.id, 'name', e.name, 'slug', e.slug, 'segment', e.segment,
      'description', e.description, 'address', e.address, 'city', e.city, 'state', e.state,
      'phone', e.phone, 'whatsapp', e.whatsapp, 'instagram', e.instagram, 'logo_url', e.logo_url, 'cover_url', e.cover_url,
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
        'price_cents', s.price_cents, 'duration_minutes', s.duration_minutes
      ) order by s.sort_order, s.name)
      from public.services s
      where s.establishment_id = e.id and s.is_active
        and exists (
          select 1 from public.professional_services x
          join public.professionals p on p.id = x.professional_id and p.is_active
          where x.service_id = s.id
        )
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

