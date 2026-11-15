-- =====================================================================
-- 0003 · ROW LEVEL SECURITY
-- Resumo (detalhes em docs/RLS.md):
--   · anon (visitante) NÃO lê nem grava nenhuma tabela. A página pública
--     usa apenas as funções RPC do arquivo 0004.
--   · authenticated só enxerga linhas do(s) estabelecimento(s) em que é
--     membro ativo, conforme papel e permissões.
--   · SuperAdmin tem acesso global (is_super_admin() dentro das funções).
--   · service_role (Edge Functions) ignora RLS por definição do Supabase.
-- =====================================================================

alter table public.profiles               enable row level security;
alter table public.plans                  enable row level security;
alter table public.establishments         enable row level security;
alter table public.subscriptions          enable row level security;
alter table public.establishment_users    enable row level security;
alter table public.professionals          enable row level security;
alter table public.services               enable row level security;
alter table public.professional_services  enable row level security;
alter table public.customers              enable row level security;
alter table public.appointments           enable row level security;
alter table public.business_hours         enable row level security;
alter table public.professional_schedules enable row level security;
alter table public.blocked_times          enable row level security;
alter table public.establishment_themes   enable row level security;
alter table public.notifications          enable row level security;
alter table public.audit_logs             enable row level security;
alter table public.platform_settings      enable row level security;

-- Defesa em profundidade: visitante não tem privilégio algum nas tabelas.
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
create policy profiles_select on public.profiles
  for select to authenticated
  using ((select public.can_view_profile(id)));

create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or (select public.is_super_admin()))
  with check (id = (select auth.uid()) or (select public.is_super_admin()));

-- ---------------------------------------------------------------------
-- plans · todos os usuários logados leem; só SuperAdmin altera
-- ---------------------------------------------------------------------
create policy plans_select on public.plans
  for select to authenticated using (true);

create policy plans_write on public.plans
  for all to authenticated
  using ((select public.is_super_admin()))
  with check ((select public.is_super_admin()));

-- ---------------------------------------------------------------------
-- establishments
-- ---------------------------------------------------------------------
create policy establishments_select on public.establishments
  for select to authenticated
  using (public.is_member(id));

create policy establishments_insert on public.establishments
  for insert to authenticated
  with check ((select public.is_super_admin()));

-- status e slug são protegidos pela trigger guard_establishment
create policy establishments_update on public.establishments
  for update to authenticated
  using (public.has_permission(id, 'manage_settings'))
  with check (public.has_permission(id, 'manage_settings'));

create policy establishments_delete on public.establishments
  for delete to authenticated
  using ((select public.is_super_admin()));

-- ---------------------------------------------------------------------
-- subscriptions · membros leem o próprio plano; só SuperAdmin altera
-- ---------------------------------------------------------------------
create policy subscriptions_select on public.subscriptions
  for select to authenticated
  using (public.is_member(establishment_id));

create policy subscriptions_write on public.subscriptions
  for all to authenticated
  using ((select public.is_super_admin()))
  with check ((select public.is_super_admin()));

-- ---------------------------------------------------------------------
-- establishment_users
--   · cada um vê o próprio vínculo; quem tem manage_users vê a equipe
--   · ninguém além do SuperAdmin cria/edita/remove o proprietário
--   · só proprietário (ou SuperAdmin) concede o papel admin
-- ---------------------------------------------------------------------
create policy establishment_users_select on public.establishment_users
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.has_permission(establishment_id, 'manage_users')
  );

create policy establishment_users_insert on public.establishment_users
  for insert to authenticated
  with check (
    (select public.is_super_admin())
    or (
      public.has_permission(establishment_id, 'manage_users')
      and role <> 'owner'
      and (role <> 'admin' or public.has_role(establishment_id, array['owner']::public.member_role[]))
    )
  );

create policy establishment_users_update on public.establishment_users
  for update to authenticated
  using (
    (select public.is_super_admin())
    or (
      public.has_permission(establishment_id, 'manage_users')
      and role <> 'owner'
      and (role <> 'admin' or public.has_role(establishment_id, array['owner']::public.member_role[]))
    )
  )
  with check (
    (select public.is_super_admin())
    or (
      public.has_permission(establishment_id, 'manage_users')
      and role <> 'owner'
      and (role <> 'admin' or public.has_role(establishment_id, array['owner']::public.member_role[]))
    )
  );

create policy establishment_users_delete on public.establishment_users
  for delete to authenticated
  using (
    (select public.is_super_admin())
    or (
      public.has_permission(establishment_id, 'manage_users')
      and role <> 'owner'
      and (role <> 'admin' or public.has_role(establishment_id, array['owner']::public.member_role[]))
    )
  );

-- ---------------------------------------------------------------------
-- professionals
-- ---------------------------------------------------------------------
create policy professionals_select on public.professionals
  for select to authenticated
  using (public.is_member(establishment_id));

create policy professionals_write on public.professionals
  for all to authenticated
  using (public.has_permission(establishment_id, 'manage_professionals'))
  with check (public.has_permission(establishment_id, 'manage_professionals'));

-- ---------------------------------------------------------------------
-- services
-- ---------------------------------------------------------------------
create policy services_select on public.services
  for select to authenticated
  using (public.is_member(establishment_id));

create policy services_write on public.services
  for all to authenticated
  using (public.has_permission(establishment_id, 'manage_services'))
  with check (public.has_permission(establishment_id, 'manage_services'));

-- ---------------------------------------------------------------------
-- professional_services
-- ---------------------------------------------------------------------
create policy professional_services_select on public.professional_services
  for select to authenticated
  using (public.is_member(establishment_id));

create policy professional_services_write on public.professional_services
  for all to authenticated
  using (
    public.has_permission(establishment_id, 'manage_services')
    or public.has_permission(establishment_id, 'manage_professionals')
  )
  with check (
    public.has_permission(establishment_id, 'manage_services')
    or public.has_permission(establishment_id, 'manage_professionals')
  );

-- ---------------------------------------------------------------------
-- customers · dados pessoais: só quem atende ou gerencia
-- O profissional vê apenas clientes que têm agendamento com ele.
-- ---------------------------------------------------------------------
create policy customers_select on public.customers
  for select to authenticated
  using (
    public.has_permission(establishment_id, 'manage_customers')
    or public.has_permission(establishment_id, 'manage_appointments')
    or exists (
      select 1 from public.appointments a
      where a.customer_id = customers.id
        and a.professional_id = public.current_professional_id(customers.establishment_id)
    )
  );

create policy customers_insert on public.customers
  for insert to authenticated
  with check (
    public.has_permission(establishment_id, 'manage_customers')
    or public.has_permission(establishment_id, 'manage_appointments')
  );

create policy customers_update on public.customers
  for update to authenticated
  using (
    public.has_permission(establishment_id, 'manage_customers')
    or public.has_permission(establishment_id, 'manage_appointments')
  )
  with check (
    public.has_permission(establishment_id, 'manage_customers')
    or public.has_permission(establishment_id, 'manage_appointments')
  );

create policy customers_delete on public.customers
  for delete to authenticated
  using (public.has_permission(establishment_id, 'manage_customers'));

-- ---------------------------------------------------------------------
-- appointments
--   · manage_appointments: todos os agendamentos do estabelecimento
--   · profissional: somente a própria agenda
--   · sem DELETE: agendamento é cancelado, nunca apagado (histórico)
-- ---------------------------------------------------------------------
create policy appointments_select on public.appointments
  for select to authenticated
  using (
    public.has_permission(establishment_id, 'manage_appointments')
    or professional_id = public.current_professional_id(establishment_id)
  );

create policy appointments_insert on public.appointments
  for insert to authenticated
  with check (
    source = 'admin'
    and (
      public.has_permission(establishment_id, 'manage_appointments')
      or professional_id = public.current_professional_id(establishment_id)
    )
  );

create policy appointments_update on public.appointments
  for update to authenticated
  using (
    public.has_permission(establishment_id, 'manage_appointments')
    or professional_id = public.current_professional_id(establishment_id)
  )
  with check (
    public.has_permission(establishment_id, 'manage_appointments')
    or professional_id = public.current_professional_id(establishment_id)
  );

-- ---------------------------------------------------------------------
-- business_hours
-- ---------------------------------------------------------------------
create policy business_hours_select on public.business_hours
  for select to authenticated
  using (public.is_member(establishment_id));

create policy business_hours_write on public.business_hours
  for all to authenticated
  using (public.has_permission(establishment_id, 'manage_schedules'))
  with check (public.has_permission(establishment_id, 'manage_schedules'));

-- ---------------------------------------------------------------------
-- professional_schedules · o profissional pode ajustar a própria agenda
-- ---------------------------------------------------------------------
create policy professional_schedules_select on public.professional_schedules
  for select to authenticated
  using (public.is_member(establishment_id));

create policy professional_schedules_write on public.professional_schedules
  for all to authenticated
  using (
    public.has_permission(establishment_id, 'manage_schedules')
    or professional_id = public.current_professional_id(establishment_id)
  )
  with check (
    public.has_permission(establishment_id, 'manage_schedules')
    or professional_id = public.current_professional_id(establishment_id)
  );

-- ---------------------------------------------------------------------
-- blocked_times · o profissional pode bloquear a própria agenda
-- ---------------------------------------------------------------------
create policy blocked_times_select on public.blocked_times
  for select to authenticated
  using (public.is_member(establishment_id));

create policy blocked_times_write on public.blocked_times
  for all to authenticated
  using (
    public.has_permission(establishment_id, 'manage_schedules')
    or (professional_id is not null
        and professional_id = public.current_professional_id(establishment_id))
  )
  with check (
    public.has_permission(establishment_id, 'manage_schedules')
    or (professional_id is not null
        and professional_id = public.current_professional_id(establishment_id))
  );

-- ---------------------------------------------------------------------
-- establishment_themes
-- ---------------------------------------------------------------------
create policy establishment_themes_select on public.establishment_themes
  for select to authenticated
  using (public.is_member(establishment_id));

create policy establishment_themes_write on public.establishment_themes
  for all to authenticated
  using (public.has_permission(establishment_id, 'manage_theme'))
  with check (public.has_permission(establishment_id, 'manage_theme'));

-- ---------------------------------------------------------------------
-- notifications · leitura para quem gerencia agendamentos; escrita só backend
-- ---------------------------------------------------------------------
create policy notifications_select on public.notifications
  for select to authenticated
  using (public.has_permission(establishment_id, 'manage_appointments'));

-- ---------------------------------------------------------------------
-- audit_logs · somente leitura; gravados apenas pelas triggers
-- ---------------------------------------------------------------------
create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (
    (select public.is_super_admin())
    or (
      establishment_id is not null
      and public.has_role(establishment_id, array['owner', 'admin']::public.member_role[])
    )
  );

-- ---------------------------------------------------------------------
-- platform_settings · somente SuperAdmin
-- ---------------------------------------------------------------------
create policy platform_settings_all on public.platform_settings
  for all to authenticated
  using ((select public.is_super_admin()))
  with check ((select public.is_super_admin()));

-- ---------------------------------------------------------------------
-- Funções de autorização: só usuários logados precisam executá-las.
-- ---------------------------------------------------------------------
revoke execute on function public.is_super_admin() from public, anon;
revoke execute on function public.is_member(uuid) from public, anon;
revoke execute on function public.has_role(uuid, public.member_role[]) from public, anon;
revoke execute on function public.has_permission(uuid, text) from public, anon;
revoke execute on function public.current_professional_id(uuid) from public, anon;
revoke execute on function public.can_view_profile(uuid) from public, anon;
revoke execute on function public.can_manage_assets(text) from public, anon;
grant execute on function
  public.is_super_admin(),
  public.is_member(uuid),
  public.has_role(uuid, public.member_role[]),
  public.has_permission(uuid, text),
  public.current_professional_id(uuid),
  public.can_view_profile(uuid),
  public.can_manage_assets(text)
to authenticated, service_role;
