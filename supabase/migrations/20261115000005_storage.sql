-- =====================================================================
-- 0005 · STORAGE
-- Bucket público (somente leitura) para logotipos, capas e fotos.
-- Caminho obrigatório: <establishment_id>/<arquivo>
-- Assim um estabelecimento nunca grava na pasta de outro.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'establishment-assets',
  'establishment-assets',
  true,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy establishment_assets_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'establishment-assets'
    and public.can_manage_assets((storage.foldername(name))[1])
  );

create policy establishment_assets_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'establishment-assets'
    and public.can_manage_assets((storage.foldername(name))[1])
  )
  with check (
    bucket_id = 'establishment-assets'
    and public.can_manage_assets((storage.foldername(name))[1])
  );

create policy establishment_assets_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'establishment-assets'
    and public.can_manage_assets((storage.foldername(name))[1])
  );

-- Necessário para o upload com "upsert" (o cliente consulta o objeto antes).
create policy establishment_assets_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'establishment-assets'
    and public.can_manage_assets((storage.foldername(name))[1])
  );
