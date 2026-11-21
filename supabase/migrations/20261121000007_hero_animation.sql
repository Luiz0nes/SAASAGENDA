-- =====================================================================
-- 0007 · ANIMAÇÃO DO TOPO (HERO) DA PÁGINA PÚBLICA
--   none    = sem animação
--   soft    = entrada suave e capa com zoom lento
--   dynamic = entrada marcante, capa com zoom e parallax, brilho e faixa animada
-- =====================================================================

alter table public.establishment_themes
  add column if not exists hero_animation text not null default 'soft'
    check (hero_animation in ('none', 'soft', 'dynamic'));

-- barbearias começam com a animação dinâmica
update public.establishment_themes t
set hero_animation = 'dynamic'
from public.establishments e
where e.id = t.establishment_id
  and lower(coalesce(e.segment, '')) like '%barb%';
