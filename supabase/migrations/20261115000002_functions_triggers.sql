-- =====================================================================
-- 0002 · FUNÇÕES DE APOIO E TRIGGERS
-- Regras de negócio que valem para QUALQUER caminho de escrita
-- (painel, página pública, Edge Function ou SQL direto).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Funções de autorização usadas pelas políticas RLS.
-- SECURITY DEFINER para poderem ler establishment_users sem recursão de RLS.
-- ---------------------------------------------------------------------
create or replace function public.is_super_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_super_admin
  );
$$;

create or replace function public.is_member(p_establishment_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_super_admin() or exists (
    select 1 from public.establishment_users eu
    where eu.establishment_id = p_establishment_id
      and eu.user_id = (select auth.uid())
      and eu.is_active
  );
$$;

create or replace function public.has_role(p_establishment_id uuid, p_roles public.member_role[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_super_admin() or exists (
    select 1 from public.establishment_users eu
    where eu.establishment_id = p_establishment_id
      and eu.user_id = (select auth.uid())
      and eu.is_active
      and eu.role = any (p_roles)
  );
$$;

-- owner e admin têm todas as permissões; os demais dependem do JSON permissions.
create or replace function public.has_permission(p_establishment_id uuid, p_permission text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_super_admin() or exists (
    select 1 from public.establishment_users eu
    where eu.establishment_id = p_establishment_id
      and eu.user_id = (select auth.uid())
      and eu.is_active
      and (
        eu.role in ('owner', 'admin')
        or eu.permissions -> p_permission = 'true'::jsonb
      )
  );
$$;

-- Profissional vinculado ao usuário logado naquele estabelecimento (ou null).
create or replace function public.current_professional_id(p_establishment_id uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select eu.professional_id from public.establishment_users eu
  where eu.establishment_id = p_establishment_id
    and eu.user_id = (select auth.uid())
    and eu.is_active
  limit 1;
$$;

-- O usuário logado gerencia usuários de algum estabelecimento em que p_user_id é membro?
create or replace function public.can_view_profile(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_user_id = (select auth.uid())
    or public.is_super_admin()
    or exists (
      select 1 from public.establishment_users target
      where target.user_id = p_user_id
        and public.has_permission(target.establishment_id, 'manage_users')
    );
$$;

-- Upload de arquivos: a primeira pasta do caminho é o establishment_id.
create or replace function public.can_manage_assets(p_folder text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  begin
    v_id := p_folder::uuid;
  exception when others then
    return false;
  end;
  return public.has_permission(v_id, 'manage_theme')
      or public.has_permission(v_id, 'manage_services')
      or public.has_permission(v_id, 'manage_professionals')
      or public.has_permission(v_id, 'manage_settings');
end;
$$;

-- ---------------------------------------------------------------------
-- Plano vigente do estabelecimento (null = sem plano = sem limites)
-- ---------------------------------------------------------------------
create or replace function private.current_plan(p_establishment_id uuid)
returns public.plans
language sql stable security definer set search_path = ''
as $$
  select p.* from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.establishment_id = p_establishment_id
    and s.status in ('trial', 'active')
    and (s.expires_at is null or s.expires_at > now())
  limit 1;
$$;

-- ---------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------
create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'plans', 'establishments', 'subscriptions', 'professionals',
    'establishment_users', 'services', 'customers', 'business_hours',
    'professional_schedules', 'establishment_themes', 'platform_settings'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function private.touch_updated_at()',
      t || '_touch', t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Perfil criado automaticamente a cada novo usuário do Supabase Auth
-- ---------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------
-- Travas de colunas sensíveis.
-- SECURITY INVOKER de propósito: current_user é o papel real da requisição
-- ('authenticated'/'anon' vindo da API; 'service_role'/'postgres' no backend).
-- ---------------------------------------------------------------------
create or replace function private.guard_profile()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.is_super_admin is distinct from old.is_super_admin
     and current_user in ('authenticated', 'anon')
     and not public.is_super_admin() then
    raise exception 'Apenas o SuperAdmin pode alterar este campo.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_guard before update on public.profiles
  for each row execute function private.guard_profile();

create or replace function private.guard_establishment()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if (new.status is distinct from old.status or new.slug is distinct from old.slug)
     and current_user in ('authenticated', 'anon')
     and not public.is_super_admin() then
    raise exception 'Apenas o SuperAdmin pode alterar o status ou o endereço (slug) do estabelecimento.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger establishments_guard before update on public.establishments
  for each row execute function private.guard_establishment();

-- ---------------------------------------------------------------------
-- establishment_users: permissões padrão por papel + limite de usuários
-- ---------------------------------------------------------------------
create or replace function private.establishment_users_before_write()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_plan public.plans;
  v_count integer;
begin
  if tg_op = 'INSERT' and new.permissions = '{}'::jsonb then
    new.permissions := case new.role
      when 'receptionist' then '{"manage_appointments": true, "manage_customers": true}'::jsonb
      else '{}'::jsonb
    end;
  end if;

  if new.is_active and (tg_op = 'INSERT' or not old.is_active) then
    v_plan := private.current_plan(new.establishment_id);
    if v_plan.max_users is not null then
      select count(*) into v_count from public.establishment_users
      where establishment_id = new.establishment_id and is_active and id <> new.id;
      if v_count >= v_plan.max_users then
        raise exception 'Limite de usuários do plano atingido (%).', v_plan.max_users using errcode = 'P0001';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger establishment_users_before_write
  before insert or update on public.establishment_users
  for each row execute function private.establishment_users_before_write();

-- ---------------------------------------------------------------------
-- professionals: limite de profissionais ativos do plano
-- ---------------------------------------------------------------------
create or replace function private.professionals_before_write()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_plan public.plans;
  v_count integer;
begin
  if new.is_active and (tg_op = 'INSERT' or not old.is_active) then
    v_plan := private.current_plan(new.establishment_id);
    if v_plan.max_professionals is not null then
      select count(*) into v_count from public.professionals
      where establishment_id = new.establishment_id and is_active and id <> new.id;
      if v_count >= v_plan.max_professionals then
        raise exception 'Limite de profissionais do plano atingido (%).', v_plan.max_professionals
          using errcode = 'P0001';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger professionals_before_write
  before insert or update on public.professionals
  for each row execute function private.professionals_before_write();

-- ---------------------------------------------------------------------
-- establishment_themes: personalização depende do recurso do plano
-- ---------------------------------------------------------------------
create or replace function private.themes_before_update()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_plan public.plans;
begin
  v_plan := private.current_plan(new.establishment_id);
  if v_plan.id is not null
     and v_plan.features -> 'custom_theme' = 'false'::jsonb
     and not public.is_super_admin() then
    raise exception 'A personalização visual não está disponível no plano atual.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger establishment_themes_plan_check
  before update on public.establishment_themes
  for each row execute function private.themes_before_update();

-- =====================================================================
-- DISPONIBILIDADE
-- =====================================================================

-- ---------------------------------------------------------------------
-- Fonte única da verdade: devolve o MOTIVO pelo qual um horário não pode
-- ser usado, ou null quando está livre. Usada tanto pela listagem de
-- horários quanto pela trigger que valida cada agendamento gravado.
-- ---------------------------------------------------------------------
create or replace function private.appointment_conflict_reason(
  p_establishment_id uuid,
  p_professional_id uuid,
  p_start timestamptz,
  p_end timestamptz,            -- fim do atendimento
  p_occupied_until timestamptz, -- fim + intervalo
  p_ignore_appointment_id uuid default null
)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_tz text;
  v_local_start timestamp;
  v_local_end timestamp;
  v_weekday integer;
  v_bh public.business_hours;
  v_ps public.professional_schedules;
begin
  select e.timezone into v_tz from public.establishments e where e.id = p_establishment_id;
  if v_tz is null then
    return 'Estabelecimento não encontrado.';
  end if;

  v_local_start := p_start at time zone v_tz;
  v_local_end := p_end at time zone v_tz;
  if v_local_start::date <> v_local_end::date then
    return 'O atendimento precisa começar e terminar no mesmo dia.';
  end if;
  v_weekday := extract(dow from v_local_start)::integer;

  -- funcionamento do estabelecimento
  select * into v_bh from public.business_hours bh
  where bh.establishment_id = p_establishment_id and bh.weekday = v_weekday;
  if not found or v_bh.is_closed then
    return 'O estabelecimento não funciona neste dia.';
  end if;
  if v_local_start::time < v_bh.opens_at or v_local_end::time > v_bh.closes_at then
    return 'Horário fora do funcionamento do estabelecimento.';
  end if;

  -- agenda do profissional (dia de folga, expediente e intervalo)
  select * into v_ps from public.professional_schedules ps
  where ps.professional_id = p_professional_id and ps.weekday = v_weekday;
  if not found or not v_ps.is_working then
    return 'O profissional não atende neste dia.';
  end if;
  if v_local_start::time < v_ps.starts_at or v_local_end::time > v_ps.ends_at then
    return 'Horário fora do expediente do profissional.';
  end if;
  if v_ps.break_start is not null
     and v_local_start::time < v_ps.break_end
     and v_local_end::time > v_ps.break_start then
    return 'Horário dentro do intervalo do profissional.';
  end if;

  -- bloqueios e folgas (do estabelecimento ou do profissional)
  if exists (
    select 1 from public.blocked_times b
    where b.establishment_id = p_establishment_id
      and (b.professional_id is null or b.professional_id = p_professional_id)
      and b.starts_at < p_end
      and b.ends_at > p_start
  ) then
    return 'Horário bloqueado.';
  end if;

  -- outros agendamentos do mesmo profissional
  if exists (
    select 1 from public.appointments a
    where a.professional_id = p_professional_id
      and a.status in ('pending', 'confirmed', 'completed')
      and (p_ignore_appointment_id is null or a.id <> p_ignore_appointment_id)
      and a.starts_at < p_occupied_until
      and a.occupied_until > p_start
  ) then
    return 'Este horário já está reservado.';
  end if;

  return null;
end;
$$;

-- ---------------------------------------------------------------------
-- Horários livres de um serviço em uma data.
-- p_public = true aplica as regras da página pública
-- (estabelecimento ativo, antecedência mínima e máxima).
-- ---------------------------------------------------------------------
create or replace function private.available_slots(
  p_establishment_id uuid,
  p_service_id uuid,
  p_professional_id uuid,
  p_date date,
  p_ignore_appointment_id uuid,
  p_public boolean
)
returns table (professional_id uuid, slot_start timestamptz, slot_end timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_est public.establishments;
  v_svc public.services;
  v_now timestamptz := now();
  v_duration interval;
  v_buffer interval;
begin
  select * into v_est from public.establishments e where e.id = p_establishment_id;
  if not found then return; end if;
  if p_public and v_est.status <> 'active' then return; end if;

  select * into v_svc from public.services s
  where s.id = p_service_id and s.establishment_id = p_establishment_id and s.is_active;
  if not found then return; end if;

  if p_public and p_date > (v_now at time zone v_est.timezone)::date + v_est.max_advance_days then
    return;
  end if;

  v_duration := make_interval(mins => v_svc.duration_minutes);
  v_buffer := make_interval(mins => v_svc.buffer_minutes);

  return query
  select c.professional_id, c.slot_start, c.slot_start + v_duration
  from (
    select
      p.id as professional_id,
      ((p_date + ps.starts_at) + make_interval(mins => g.n * v_est.slot_interval_minutes))
        at time zone v_est.timezone as slot_start
    from public.professionals p
    join public.professional_services x
      on x.professional_id = p.id and x.service_id = v_svc.id
    join public.professional_schedules ps
      on ps.professional_id = p.id
     and ps.weekday = extract(dow from p_date)::integer
     and ps.is_working
    cross join lateral generate_series(
      0,
      (extract(epoch from (ps.ends_at - ps.starts_at))::integer / 60) / v_est.slot_interval_minutes
    ) as g (n)
    where p.establishment_id = p_establishment_id
      and p.is_active
      and (p_professional_id is null or p.id = p_professional_id)
  ) c
  where (not p_public or c.slot_start >= v_now + make_interval(mins => v_est.min_advance_minutes))
    and private.appointment_conflict_reason(
          p_establishment_id,
          c.professional_id,
          c.slot_start,
          c.slot_start + v_duration,
          c.slot_start + v_duration + v_buffer,
          p_ignore_appointment_id
        ) is null
  order by c.slot_start, c.professional_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Trigger de agendamentos: calcula fim/ocupação, aplica limites do plano
-- e valida a disponibilidade em TODA gravação que ocupe a agenda.
-- ---------------------------------------------------------------------
create or replace function private.appointments_before_write()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_est public.establishments;
  v_svc public.services;
  v_plan public.plans;
  v_count integer;
  v_reason text;
  v_must_check boolean := false;
begin
  if tg_op = 'INSERT' then
    select * into v_est from public.establishments e where e.id = new.establishment_id;
    if v_est.status <> 'active' then
      raise exception 'Este estabelecimento não está recebendo novos agendamentos.' using errcode = 'P0001';
    end if;

    v_plan := private.current_plan(new.establishment_id);
    if v_plan.max_appointments_per_month is not null then
      select count(*) into v_count from public.appointments a
      where a.establishment_id = new.establishment_id
        and a.status <> 'cancelled'
        and a.created_at >= date_trunc('month', now());
      if v_count >= v_plan.max_appointments_per_month then
        raise exception 'Limite mensal de agendamentos do plano atingido (%).', v_plan.max_appointments_per_month
          using errcode = 'P0001';
      end if;
    end if;

    if new.created_by is null then
      new.created_by := (select auth.uid());
    end if;
  else
    -- campos imutáveis
    new.establishment_id := old.establishment_id;
    new.public_token := old.public_token;
    new.source := old.source;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;

  if tg_op = 'INSERT'
     or new.service_id is distinct from old.service_id
     or new.starts_at is distinct from old.starts_at then
    select * into v_svc from public.services s
    where s.id = new.service_id and s.establishment_id = new.establishment_id;
    if not found then
      raise exception 'Serviço não encontrado.' using errcode = 'P0001';
    end if;
    if tg_op = 'INSERT' and not v_svc.is_active then
      raise exception 'Este serviço está inativo.' using errcode = 'P0001';
    end if;
    new.ends_at := new.starts_at + make_interval(mins => v_svc.duration_minutes);
    new.buffer_minutes := v_svc.buffer_minutes;
    if tg_op = 'INSERT' or new.service_id is distinct from old.service_id then
      new.price_cents := v_svc.price_cents;
    end if;
    v_must_check := true;
  end if;

  new.occupied_until := new.ends_at + make_interval(mins => new.buffer_minutes);

  if tg_op = 'UPDATE' and (
       new.professional_id is distinct from old.professional_id
       or (old.status not in ('pending', 'confirmed', 'completed')
           and new.status in ('pending', 'confirmed', 'completed'))
     ) then
    v_must_check := true;
  end if;

  if v_must_check and new.status in ('pending', 'confirmed') then
    if not exists (
      select 1 from public.professionals p
      where p.id = new.professional_id and p.establishment_id = new.establishment_id and p.is_active
    ) then
      raise exception 'Profissional indisponível.' using errcode = 'P0001';
    end if;
    if not exists (
      select 1 from public.professional_services x
      where x.professional_id = new.professional_id and x.service_id = new.service_id
    ) then
      raise exception 'Este profissional não realiza o serviço escolhido.' using errcode = 'P0001';
    end if;

    v_reason := private.appointment_conflict_reason(
      new.establishment_id, new.professional_id,
      new.starts_at, new.ends_at, new.occupied_until,
      case when tg_op = 'UPDATE' then old.id end
    );
    if v_reason is not null then
      raise exception '%', v_reason using errcode = 'P0001';
    end if;
  end if;

  if new.status = 'cancelled' and (tg_op = 'INSERT' or old.status <> 'cancelled') then
    new.cancelled_at := now();
  elsif new.status <> 'cancelled' then
    new.cancelled_at := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger appointments_before_write
  before insert or update on public.appointments
  for each row execute function private.appointments_before_write();

-- =====================================================================
-- AUDITORIA
-- =====================================================================
create or replace function private.audit_row_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_establishment uuid;
  v_actor uuid;
begin
  if tg_op <> 'INSERT' then v_old := to_jsonb(old) - 'public_token' - 'updated_at'; end if;
  if tg_op <> 'DELETE' then v_new := to_jsonb(new) - 'public_token' - 'updated_at'; end if;

  if tg_op = 'UPDATE' and v_old = v_new then
    return new;
  end if;

  if tg_table_name = 'establishments' then
    v_establishment := coalesce(v_new ->> 'id', v_old ->> 'id')::uuid;
  else
    v_establishment := coalesce(v_new ->> 'establishment_id', v_old ->> 'establishment_id')::uuid;
  end if;

  -- Edge Functions (service role) informam o autor via set_config('app.actor_id', ...)
  v_actor := coalesce(
    (select auth.uid()),
    nullif(current_setting('app.actor_id', true), '')::uuid
  );

  insert into public.audit_logs (establishment_id, actor_id, action, entity, entity_id, old_data, new_data)
  values (
    v_establishment,
    v_actor,
    lower(tg_op),
    tg_table_name,
    coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'establishment_id', v_old ->> 'establishment_id'),
    v_old,
    v_new
  );
  return coalesce(new, old);
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'plans', 'establishments', 'subscriptions', 'establishment_users',
    'professionals', 'services', 'appointments', 'blocked_times', 'establishment_themes'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function private.audit_row_change()',
      t || '_audit', t
    );
  end loop;
end $$;
