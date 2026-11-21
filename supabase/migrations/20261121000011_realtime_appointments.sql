-- =====================================================================
-- 0011 · AGENDA EM TEMPO REAL
-- Publica as mudanças de appointments no Supabase Realtime. Cada usuário
-- só recebe as linhas que a política RLS de SELECT permite ver (equipe do
-- próprio estabelecimento; profissional, só a própria agenda).
-- =====================================================================

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'appointments'
  ) then
    alter publication supabase_realtime add table public.appointments;
  end if;
end $$;
