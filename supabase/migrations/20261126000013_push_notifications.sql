-- =====================================================================
-- 0013 · NOTIFICAÇÕES NO CELULAR (WEB PUSH)
-- Fluxo: agendamento criado pela página pública -> gatilho chama a Edge
-- Function push-notify (pg_net, assíncrono, depois do commit) -> ela envia
-- a notificação para os aparelhos inscritos da equipe que pode ver aquele
-- agendamento (dono/admin/quem gerencia a agenda e o profissional dele).
--
-- Segredos ficam no Supabase Vault (nunca no código). Para uma instalação
-- nova, crie-os uma vez no SQL Editor (troque os valores):
--   select vault.create_secret('<chave pública VAPID>',  'vapid_public_key');
--   select vault.create_secret('<chave privada VAPID>',  'vapid_private_key');
--   select vault.create_secret('https://seu-site',        'vapid_subject');
--   select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'push_notify_secret');
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/push-notify', 'push_function_url');
-- E troque a chave pública em src/lib/push.ts.
-- =====================================================================

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------
-- Aparelhos inscritos (um por navegador/app instalado)
-- ---------------------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://'),
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index push_subscriptions_establishment_idx on public.push_subscriptions (establishment_id);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon;

-- cada usuário vê e remove só os próprios aparelhos
create policy push_subscriptions_select on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy push_subscriptions_delete on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));
-- inclusão/alteração só pela função register_push_subscription

-- ---------------------------------------------------------------------
-- Registrar / remover o aparelho atual
-- ---------------------------------------------------------------------
create or replace function public.register_push_subscription(
  p_establishment_id uuid,
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.is_member(p_establishment_id) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  -- o mesmo navegador pode ter sido usado por outra pessoa: o aparelho
  -- passa a ser de quem ativou agora
  delete from public.push_subscriptions where endpoint = p_endpoint;
  insert into public.push_subscriptions (user_id, establishment_id, endpoint, p256dh, auth, user_agent)
  values ((select auth.uid()), p_establishment_id, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300));
end;
$$;

create or replace function public.unregister_push_subscription(p_endpoint text)
returns void
language sql security definer set search_path = ''
as $$
  delete from public.push_subscriptions
  where endpoint = p_endpoint and user_id = (select auth.uid());
$$;

revoke execute on function public.register_push_subscription(uuid, text, text, text, text) from public, anon;
revoke execute on function public.unregister_push_subscription(text) from public, anon;
grant execute on function
  public.register_push_subscription(uuid, text, text, text, text),
  public.unregister_push_subscription(text)
to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Configuração lida pela Edge Function (somente service_role)
-- ---------------------------------------------------------------------
create or replace function public.push_config()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_object_agg(s.name, s.decrypted_secret), '{}'::jsonb)
  from vault.decrypted_secrets s
  where s.name in ('vapid_public_key', 'vapid_private_key', 'vapid_subject', 'push_notify_secret');
$$;

revoke execute on function public.push_config() from public, anon, authenticated;
grant execute on function public.push_config() to service_role;

-- ---------------------------------------------------------------------
-- Gatilho: agendamento novo pela página pública -> push-notify
-- ---------------------------------------------------------------------
create or replace function private.notify_new_appointment()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if new.source <> 'public' then
    return new;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'push_function_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_notify_secret';
  if v_url is null or v_secret is null then
    return new;
  end if;
  -- assíncrono: a requisição sai depois do commit e não atrasa o cliente
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('appointment_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret),
    timeout_milliseconds := 8000
  );
  return new;
exception when others then
  -- a notificação nunca pode impedir o agendamento
  return new;
end;
$$;

create trigger appointments_push_notify
  after insert on public.appointments
  for each row execute function private.notify_new_appointment();
