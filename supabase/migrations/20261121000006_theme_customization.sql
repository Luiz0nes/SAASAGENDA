-- =====================================================================
-- 0006 · PERSONALIZAÇÃO AVANÇADA DA PÁGINA PÚBLICA
-- Temas prontos, fontes, cantos, botões, cartões, galeria de fotos
-- e modo escuro (paleta própria + botão para o cliente alternar).
-- get_public_establishment já devolve todas as colunas do tema.
-- =====================================================================

alter table public.establishment_themes
  drop constraint if exists establishment_themes_layout_check;
alter table public.establishment_themes
  add constraint establishment_themes_layout_check
  check (layout in ('classic', 'modern', 'compact', 'centered'));

alter table public.establishment_themes
  add column if not exists preset text
    check (preset is null or char_length(preset) <= 40),
  add column if not exists surface_color text not null default '#ffffff'
    check (surface_color ~ '^#[0-9a-fA-F]{6}$'),
  add column if not exists font_heading text not null default 'Inter'
    check (char_length(font_heading) between 2 and 40),
  add column if not exists font_body text not null default 'Inter'
    check (char_length(font_body) between 2 and 40),
  add column if not exists radius text not null default 'soft'
    check (radius in ('square', 'soft', 'rounded', 'pill')),
  add column if not exists button_style text not null default 'solid'
    check (button_style in ('solid', 'outline', 'soft')),
  add column if not exists card_style text not null default 'border'
    check (card_style in ('border', 'shadow', 'flat')),
  -- modo escuro
  add column if not exists dark_mode_toggle boolean not null default true,
  add column if not exists default_mode text not null default 'light'
    check (default_mode in ('light', 'dark', 'system')),
  add column if not exists dark_background_color text not null default '#0b1120'
    check (dark_background_color ~ '^#[0-9a-fA-F]{6}$'),
  add column if not exists dark_surface_color text not null default '#151c2c'
    check (dark_surface_color ~ '^#[0-9a-fA-F]{6}$'),
  add column if not exists dark_text_color text not null default '#f1f5f9'
    check (dark_text_color ~ '^#[0-9a-fA-F]{6}$');

-- galeria: lista de URLs (até 12 fotos)
alter table public.establishment_themes
  drop constraint if exists establishment_themes_gallery_check;
alter table public.establishment_themes
  add constraint establishment_themes_gallery_check
  check (jsonb_typeof(gallery) = 'array' and jsonb_array_length(gallery) <= 12);

update public.establishment_themes set preset = 'minimal' where preset is null;
