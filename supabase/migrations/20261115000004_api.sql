-- =====================================================================
-- 0004 · API (funções RPC)
-- Página pública: o visitante só fala com o banco por estas funções.
-- Cada uma devolve apenas o que é público e valida tudo no backend.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Dados públicos de um estabelecimento ATIVO (ou null)
-- ---------------------------------------------------------------------
create or replace function public.get_public_establishment(p_slug text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'establishment', jsonb_build_object(
      'id', e.id, 'name', e.name, 'slug', e.slug, 'segment', e.segment,
      'description', e.description, 'address', e.address, 'city', e.city, 'state', e.state,
      'phone', e.phone, 'whatsapp', e.whatsapp, 'logo_url', e.logo_url, 'cover_url', e.cover_url,
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

-- ---------------------------------------------------------------------
-- Horários livres (página pública)
-- ---------------------------------------------------------------------
create or replace function public.get_available_slots(
  p_slug text,
  p_service_id uuid,
  p_date date,
  p_professional_id uuid default null
)
returns table (professional_id uuid, slot_start timestamptz)
language sql stable security definer set search_path = ''
as $$
  select s.professional_id, s.slot_start
  from public.establishments e
  cross join lateral private.available_slots(e.id, p_service_id, p_professional_id, p_date, null, true) s
  where e.slug = lower(p_slug) and e.status = 'active';
$$;

-- ---------------------------------------------------------------------
-- Cria um agendamento pela página pública.
-- Concorrência: trava transacional por estabelecimento + restrição de
-- exclusão da tabela. Dois clientes nunca ficam com o mesmo horário.
-- ---------------------------------------------------------------------
create or replace function public.create_public_appointment(
  p_slug text,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_customer_name text,
  p_customer_phone text,
  p_professional_id uuid default null,
  p_customer_email text default null,
  p_notes text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_est public.establishments;
  v_name text := btrim(coalesce(p_customer_name, ''));
  v_phone text := regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g');
  v_email text := nullif(btrim(coalesce(p_customer_email, '')), '');
  v_professional uuid;
  v_customer uuid;
  v_active integer;
  v_appt public.appointments;
begin
  select * into v_est from public.establishments e where e.slug = lower(p_slug);
  if not found or v_est.status <> 'active' then
    raise exception 'Este estabelecimento não está recebendo agendamentos.' using errcode = 'P0001';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'Informe seu nome completo.' using errcode = 'P0001';
  end if;
  if v_phone !~ '^[0-9]{10,13}$' then
    raise exception 'Informe um telefone válido com DDD.' using errcode = 'P0001';
  end if;
  if v_email is not null and (char_length(v_email) > 200 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'Informe um e-mail válido.' using errcode = 'P0001';
  end if;

  -- serializa as reservas deste estabelecimento durante a transação
  perform pg_advisory_xact_lock(hashtextextended(v_est.id::text, 0));

  select s.professional_id into v_professional
  from private.available_slots(
    v_est.id, p_service_id, p_professional_id,
    (p_starts_at at time zone v_est.timezone)::date, null, true
  ) s
  where s.slot_start = p_starts_at
  order by s.professional_id
  limit 1;

  if v_professional is null then
    raise exception 'Este horário não está mais disponível. Escolha outro horário.' using errcode = 'P0001';
  end if;

  select c.id into v_customer from public.customers c
  where c.establishment_id = v_est.id and c.phone = v_phone;

  if v_customer is null then
    insert into public.customers (establishment_id, name, phone, email)
    values (v_est.id, v_name, v_phone, v_email)
    returning id into v_customer;
  else
    select count(*) into v_active from public.appointments a
    where a.customer_id = v_customer
      and a.status in ('pending', 'confirmed')
      and a.starts_at > now();
    if v_active >= v_est.max_active_per_customer then
      raise exception 'Você já possui % agendamento(s) em aberto neste estabelecimento.', v_active
        using errcode = 'P0001';
    end if;
  end if;

  begin
    insert into public.appointments (
      establishment_id, professional_id, service_id, customer_id,
      starts_at, status, source, customer_notes
    ) values (
      v_est.id, v_professional, p_service_id, v_customer,
      p_starts_at,
      case when v_est.auto_confirm then 'confirmed' else 'pending' end::public.appointment_status,
      'public',
      nullif(left(btrim(coalesce(p_notes, '')), 500), '')
    )
    returning * into v_appt;
  exception when exclusion_violation then
    raise exception 'Este horário acabou de ser reservado. Escolha outro horário.' using errcode = 'P0001';
  end;

  return public.get_public_appointment(v_appt.public_token);
end;
$$;

-- ---------------------------------------------------------------------
-- Consulta de um agendamento pelo código secreto do cliente
-- ---------------------------------------------------------------------
create or replace function public.get_public_appointment(p_token text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', a.id,
    'public_token', a.public_token,
    'status', a.status,
    'starts_at', a.starts_at,
    'ends_at', a.ends_at,
    'price_cents', a.price_cents,
    'customer_name', c.name,
    'service', jsonb_build_object('id', s.id, 'name', s.name, 'duration_minutes', s.duration_minutes),
    'professional', jsonb_build_object('id', p.id, 'name', p.name),
    'establishment', jsonb_build_object(
      'name', e.name, 'slug', e.slug, 'whatsapp', e.whatsapp, 'phone', e.phone,
      'address', e.address, 'city', e.city, 'state', e.state, 'timezone', e.timezone,
      'max_advance_days', e.max_advance_days
    ),
    'can_change',
      a.status in ('pending', 'confirmed')
      and e.status = 'active'
      and now() <= a.starts_at - make_interval(mins => e.cancellation_min_minutes)
  )
  from public.appointments a
  join public.establishments e on e.id = a.establishment_id
  join public.services s on s.id = a.service_id
  join public.professionals p on p.id = a.professional_id
  join public.customers c on c.id = a.customer_id
  where a.public_token = p_token and char_length(p_token) >= 32;
$$;

-- ---------------------------------------------------------------------
-- Cancelamento pelo cliente (respeita a antecedência mínima configurada)
-- ---------------------------------------------------------------------
create or replace function public.cancel_public_appointment(p_token text, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_appt public.appointments;
  v_est public.establishments;
begin
  select * into v_appt from public.appointments a
  where a.public_token = p_token and char_length(p_token) >= 32
  for update;
  if not found then
    raise exception 'Agendamento não encontrado.' using errcode = 'P0001';
  end if;
  select * into v_est from public.establishments e where e.id = v_appt.establishment_id;

  if v_appt.status not in ('pending', 'confirmed') then
    raise exception 'Este agendamento não pode mais ser cancelado.' using errcode = 'P0001';
  end if;
  if now() > v_appt.starts_at - make_interval(mins => v_est.cancellation_min_minutes) then
    raise exception 'O prazo para cancelamento online terminou. Entre em contato com o estabelecimento.'
      using errcode = 'P0001';
  end if;

  update public.appointments
  set status = 'cancelled',
      cancellation_reason = coalesce(nullif(left(btrim(coalesce(p_reason, '')), 300), ''), 'Cancelado pelo cliente')
  where id = v_appt.id;

  return public.get_public_appointment(p_token);
end;
$$;

-- ---------------------------------------------------------------------
-- Reagendamento pelo cliente
-- ---------------------------------------------------------------------
create or replace function public.reschedule_public_appointment(
  p_token text,
  p_starts_at timestamptz,
  p_professional_id uuid default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_appt public.appointments;
  v_est public.establishments;
  v_professional uuid;
begin
  select * into v_appt from public.appointments a
  where a.public_token = p_token and char_length(p_token) >= 32
  for update;
  if not found then
    raise exception 'Agendamento não encontrado.' using errcode = 'P0001';
  end if;
  select * into v_est from public.establishments e where e.id = v_appt.establishment_id;

  if v_est.status <> 'active' then
    raise exception 'Este estabelecimento não está recebendo agendamentos.' using errcode = 'P0001';
  end if;
  if v_appt.status not in ('pending', 'confirmed') then
    raise exception 'Este agendamento não pode mais ser reagendado.' using errcode = 'P0001';
  end if;
  if now() > v_appt.starts_at - make_interval(mins => v_est.cancellation_min_minutes) then
    raise exception 'O prazo para reagendamento online terminou. Entre em contato com o estabelecimento.'
      using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_est.id::text, 0));

  select s.professional_id into v_professional
  from private.available_slots(
    v_est.id, v_appt.service_id, p_professional_id,
    (p_starts_at at time zone v_est.timezone)::date, v_appt.id, true
  ) s
  where s.slot_start = p_starts_at
  -- mantém o mesmo profissional sempre que ele estiver livre
  order by (s.professional_id = v_appt.professional_id) desc, s.professional_id
  limit 1;

  if v_professional is null then
    raise exception 'Este horário não está mais disponível. Escolha outro horário.' using errcode = 'P0001';
  end if;

  begin
    update public.appointments
    set starts_at = p_starts_at,
        professional_id = v_professional,
        status = case when v_est.auto_confirm then 'confirmed' else 'pending' end::public.appointment_status
    where id = v_appt.id;
  exception when exclusion_violation then
    raise exception 'Este horário acabou de ser reservado. Escolha outro horário.' using errcode = 'P0001';
  end;

  return public.get_public_appointment(p_token);
end;
$$;

-- =====================================================================
-- Painéis (usuário autenticado)
-- =====================================================================

-- Horários livres para o painel: sem regra de antecedência, permite
-- ignorar o próprio agendamento ao reagendar.
create or replace function public.get_available_slots_admin(
  p_establishment_id uuid,
  p_service_id uuid,
  p_date date,
  p_professional_id uuid default null,
  p_ignore_appointment_id uuid default null
)
returns table (professional_id uuid, slot_start timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_member(p_establishment_id) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  return query
  select s.professional_id, s.slot_start
  from private.available_slots(
    p_establishment_id, p_service_id, p_professional_id, p_date, p_ignore_appointment_id, false
  ) s;
end;
$$;

-- Indicadores do estabelecimento. SECURITY INVOKER: as políticas RLS
-- valem aqui dentro, então cada usuário só soma o que pode ver.
create or replace function public.get_establishment_dashboard(
  p_establishment_id uuid,
  p_from date,
  p_to date,
  p_professional_id uuid default null,
  p_service_id uuid default null
)
returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
declare
  v_tz text;
  v_today date;
  v_result jsonb;
begin
  select e.timezone into v_tz from public.establishments e where e.id = p_establishment_id;
  if v_tz is null then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  v_today := (now() at time zone v_tz)::date;

  with scoped as (
    select a.*, (a.starts_at at time zone v_tz)::date as local_date
    from public.appointments a
    where a.establishment_id = p_establishment_id
      and (p_professional_id is null or a.professional_id = p_professional_id)
      and (p_service_id is null or a.service_id = p_service_id)
  ),
  period as (
    select * from scoped where local_date between p_from and p_to
  )
  select jsonb_build_object(
    'today', (select count(*) from scoped where local_date = v_today and status <> 'cancelled'),
    'upcoming', (select count(*) from scoped where starts_at > now() and status in ('pending', 'confirmed')),
    'total', (select count(*) from period),
    'pending', (select count(*) from period where status = 'pending'),
    'confirmed', (select count(*) from period where status = 'confirmed'),
    'completed', (select count(*) from period where status = 'completed'),
    'cancelled', (select count(*) from period where status = 'cancelled'),
    'no_show', (select count(*) from period where status = 'no_show'),
    'estimated_revenue_cents',
      (select coalesce(sum(price_cents), 0) from period where status in ('confirmed', 'completed')),
    'total_customers',
      (select count(*) from public.customers c where c.establishment_id = p_establishment_id),
    'total_professionals',
      (select count(*) from public.professionals p where p.establishment_id = p_establishment_id and p.is_active),
    'top_services', coalesce((
      select jsonb_agg(row_to_json(t)) from (
        select s.id, s.name, count(*) as total
        from period a join public.services s on s.id = a.service_id
        where a.status <> 'cancelled'
        group by s.id, s.name
        order by count(*) desc, s.name
        limit 5
      ) t
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- Indicadores consolidados da plataforma (SuperAdmin)
create or replace function public.get_platform_overview()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'establishments_total', (select count(*) from public.establishments),
    'establishments_active', (select count(*) from public.establishments where status = 'active'),
    'establishments_suspended', (select count(*) from public.establishments where status = 'suspended'),
    'appointments_total', (select count(*) from public.appointments),
    'appointments_month',
      (select count(*) from public.appointments where created_at >= date_trunc('month', now())),
    'customers_total', (select count(*) from public.customers),
    'professionals_total', (select count(*) from public.professionals where is_active),
    'establishments', coalesce((
      select jsonb_agg(row_to_json(t) order by t.name) from (
        select
          e.id, e.name, e.slug, e.segment, e.status, e.created_at,
          pl.id as plan_id, pl.name as plan_name,
          (select pr.full_name from public.establishment_users eu
             join public.profiles pr on pr.id = eu.user_id
            where eu.establishment_id = e.id and eu.role = 'owner') as owner_name,
          (select pr.email from public.establishment_users eu
             join public.profiles pr on pr.id = eu.user_id
            where eu.establishment_id = e.id and eu.role = 'owner') as owner_email,
          (select count(*) from public.appointments a where a.establishment_id = e.id) as appointments,
          (select count(*) from public.customers c where c.establishment_id = e.id) as customers,
          (select count(*) from public.professionals p where p.establishment_id = e.id and p.is_active) as professionals
        from public.establishments e
        left join public.subscriptions sub on sub.establishment_id = e.id
        left join public.plans pl on pl.id = sub.plan_id
      ) t
    ), '[]'::jsonb)
  );
end;
$$;

-- =====================================================================
-- Funções exclusivas das Edge Functions (service_role)
-- =====================================================================

-- Cria o estabelecimento, o vínculo do proprietário, tema, horários padrão
-- e assinatura — tudo em uma única transação.
create or replace function public.admin_provision_establishment(
  p_actor_id uuid,
  p_owner_id uuid,
  p_establishment jsonb,
  p_plan_id uuid default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from public.profiles where id = p_actor_id and is_super_admin) then
    raise exception 'Apenas o SuperAdmin pode cadastrar estabelecimentos.' using errcode = '42501';
  end if;
  perform set_config('app.actor_id', p_actor_id::text, true);

  insert into public.establishments (
    name, slug, segment, description, address, city, state, phone, whatsapp, email, timezone
  ) values (
    btrim(p_establishment ->> 'name'),
    lower(btrim(p_establishment ->> 'slug')),
    nullif(btrim(coalesce(p_establishment ->> 'segment', '')), ''),
    nullif(btrim(coalesce(p_establishment ->> 'description', '')), ''),
    nullif(btrim(coalesce(p_establishment ->> 'address', '')), ''),
    nullif(btrim(coalesce(p_establishment ->> 'city', '')), ''),
    nullif(btrim(coalesce(p_establishment ->> 'state', '')), ''),
    nullif(regexp_replace(coalesce(p_establishment ->> 'phone', ''), '\D', '', 'g'), ''),
    nullif(regexp_replace(coalesce(p_establishment ->> 'whatsapp', ''), '\D', '', 'g'), ''),
    nullif(btrim(coalesce(p_establishment ->> 'email', '')), ''),
    coalesce(nullif(p_establishment ->> 'timezone', ''), 'America/Sao_Paulo')
  )
  returning id into v_id;

  insert into public.establishment_users (establishment_id, user_id, role)
  values (v_id, p_owner_id, 'owner');

  insert into public.establishment_themes (establishment_id) values (v_id);

  -- ponto de partida editável pelo proprietário: seg–sex 9h–18h, sáb 9h–13h, dom fechado
  insert into public.business_hours (establishment_id, weekday, opens_at, closes_at, is_closed)
  select v_id, d,
         '09:00'::time,
         case when d = 6 then '13:00'::time else '18:00'::time end,
         d = 0
  from generate_series(0, 6) d;

  if p_plan_id is not null then
    insert into public.subscriptions (establishment_id, plan_id) values (v_id, p_plan_id);
  end if;

  return v_id;
end;
$$;

-- Vincula um usuário recém-criado à equipe de um estabelecimento.
create or replace function public.admin_add_member(
  p_actor_id uuid,
  p_establishment_id uuid,
  p_user_id uuid,
  p_role public.member_role,
  p_permissions jsonb default '{}'::jsonb,
  p_professional_id uuid default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_role = 'owner' then
    raise exception 'O proprietário só pode ser definido no cadastro do estabelecimento.' using errcode = '42501';
  end if;
  perform set_config('app.actor_id', p_actor_id::text, true);

  insert into public.establishment_users (establishment_id, user_id, role, permissions, professional_id)
  values (p_establishment_id, p_user_id, p_role, coalesce(p_permissions, '{}'::jsonb), p_professional_id)
  returning id into v_id;
  return v_id;
end;
$$;

-- =====================================================================
-- Quem pode executar o quê
-- (o Supabase concede EXECUTE a todos por padrão; aqui fica explícito)
-- =====================================================================
revoke execute on all functions in schema private from public, anon, authenticated;

revoke execute on function public.get_public_establishment(text) from public;
revoke execute on function public.get_available_slots(text, uuid, date, uuid) from public;
revoke execute on function public.create_public_appointment(text, uuid, timestamptz, text, text, uuid, text, text) from public;
revoke execute on function public.get_public_appointment(text) from public;
revoke execute on function public.cancel_public_appointment(text, text) from public;
revoke execute on function public.reschedule_public_appointment(text, timestamptz, uuid) from public;
grant execute on function
  public.get_public_establishment(text),
  public.get_available_slots(text, uuid, date, uuid),
  public.create_public_appointment(text, uuid, timestamptz, text, text, uuid, text, text),
  public.get_public_appointment(text),
  public.cancel_public_appointment(text, text),
  public.reschedule_public_appointment(text, timestamptz, uuid)
to anon, authenticated, service_role;

revoke execute on function public.get_available_slots_admin(uuid, uuid, date, uuid, uuid) from public, anon;
revoke execute on function public.get_establishment_dashboard(uuid, date, date, uuid, uuid) from public, anon;
revoke execute on function public.get_platform_overview() from public, anon;
grant execute on function
  public.get_available_slots_admin(uuid, uuid, date, uuid, uuid),
  public.get_establishment_dashboard(uuid, date, date, uuid, uuid),
  public.get_platform_overview()
to authenticated, service_role;

revoke execute on function public.admin_provision_establishment(uuid, uuid, jsonb, uuid) from public, anon, authenticated;
revoke execute on function public.admin_add_member(uuid, uuid, uuid, public.member_role, jsonb, uuid) from public, anon, authenticated;
grant execute on function
  public.admin_provision_establishment(uuid, uuid, jsonb, uuid),
  public.admin_add_member(uuid, uuid, uuid, public.member_role, jsonb, uuid)
to service_role;
