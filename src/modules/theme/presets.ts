// Temas prontos por segmento. Um clique aplica cores (claro e escuro),
// fontes, cantos, botões, cartões e o layout do cabeçalho.
import type { ColorMode, Theme } from '../../types/database';

export type Segment = 'barbearia' | 'salao' | 'clinica' | 'odonto' | 'estetica' | 'autonomo';

export type ThemeDesign = Pick<
  Theme,
  | 'primary_color' | 'secondary_color' | 'background_color' | 'surface_color' | 'text_color'
  | 'dark_background_color' | 'dark_surface_color' | 'dark_text_color'
  | 'font_heading' | 'font_body' | 'radius' | 'button_style' | 'card_style' | 'layout'
> & { default_mode?: ColorMode };

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  segments: Segment[];
  design: ThemeDesign;
}

export const SEGMENTS: { id: Segment | 'all'; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'barbearia', label: 'Barbearia' },
  { id: 'salao', label: 'Salão de beleza' },
  { id: 'clinica', label: 'Clínica' },
  { id: 'odonto', label: 'Odontologia' },
  { id: 'estetica', label: 'Estética' },
  { id: 'autonomo', label: 'Autônomo' },
];

export const PRESETS: ThemePreset[] = [
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Neutro e limpo, combina com tudo',
    segments: ['autonomo', 'clinica'],
    design: {
      primary_color: '#0f172a', secondary_color: '#2563eb', background_color: '#f8fafc', surface_color: '#ffffff', text_color: '#0f172a',
      dark_background_color: '#0b1120', dark_surface_color: '#151c2c', dark_text_color: '#f1f5f9',
      font_heading: 'Inter', font_body: 'Inter', radius: 'soft', button_style: 'solid', card_style: 'border', layout: 'classic',
    },
  },
  {
    id: 'barbearia-classica',
    name: 'Barbearia Clássica',
    description: 'Preto e dourado, tradicional',
    segments: ['barbearia'],
    design: {
      primary_color: '#1c1917', secondary_color: '#c8a24a', background_color: '#f5f1ea', surface_color: '#ffffff', text_color: '#1c1917',
      dark_background_color: '#0f0d0b', dark_surface_color: '#1c1917', dark_text_color: '#f5f1ea',
      font_heading: 'Oswald', font_body: 'Inter', radius: 'square', button_style: 'solid', card_style: 'border', layout: 'modern',
    },
  },
  {
    id: 'navalha',
    name: 'Navalha',
    description: 'Escuro e marcante, abre no modo escuro',
    segments: ['barbearia'],
    design: {
      primary_color: '#dc2626', secondary_color: '#f59e0b', background_color: '#f4f4f5', surface_color: '#ffffff', text_color: '#18181b',
      dark_background_color: '#0c0c0e', dark_surface_color: '#18181b', dark_text_color: '#fafafa',
      font_heading: 'Bebas Neue', font_body: 'Inter', radius: 'soft', button_style: 'solid', card_style: 'shadow', layout: 'modern',
      default_mode: 'dark',
    },
  },
  {
    id: 'vintage',
    name: 'Vintage',
    description: 'Creme e marrom, ar de barbearia antiga',
    segments: ['barbearia', 'autonomo'],
    design: {
      primary_color: '#7c4a2d', secondary_color: '#2f5d50', background_color: '#f3ead8', surface_color: '#fbf6ec', text_color: '#3b2a1e',
      dark_background_color: '#1a130d', dark_surface_color: '#261c14', dark_text_color: '#f3ead8',
      font_heading: 'Playfair Display', font_body: 'Lora', radius: 'soft', button_style: 'solid', card_style: 'border', layout: 'classic',
    },
  },
  {
    id: 'rose',
    name: 'Rosé',
    description: 'Rosa suave e elegante',
    segments: ['salao', 'estetica'],
    design: {
      primary_color: '#be185d', secondary_color: '#f9a8d4', background_color: '#fdf2f8', surface_color: '#ffffff', text_color: '#3f1d2e',
      dark_background_color: '#1a0f15', dark_surface_color: '#2a1520', dark_text_color: '#fce7f3',
      font_heading: 'Playfair Display', font_body: 'Poppins', radius: 'rounded', button_style: 'solid', card_style: 'shadow', layout: 'centered',
    },
  },
  {
    id: 'glamour',
    name: 'Glamour',
    description: 'Preto e nude, sofisticado',
    segments: ['salao', 'estetica'],
    design: {
      primary_color: '#111111', secondary_color: '#d4a373', background_color: '#faf7f2', surface_color: '#ffffff', text_color: '#111111',
      dark_background_color: '#0b0b0b', dark_surface_color: '#171717', dark_text_color: '#f5efe6',
      font_heading: 'DM Serif Display', font_body: 'Montserrat', radius: 'pill', button_style: 'solid', card_style: 'flat', layout: 'modern',
    },
  },
  {
    id: 'clinica',
    name: 'Clínica',
    description: 'Azul confiável e organizado',
    segments: ['clinica', 'odonto'],
    design: {
      primary_color: '#1d4ed8', secondary_color: '#0ea5e9', background_color: '#f1f5fb', surface_color: '#ffffff', text_color: '#0f172a',
      dark_background_color: '#0b1220', dark_surface_color: '#111a2e', dark_text_color: '#e2e8f0',
      font_heading: 'Inter', font_body: 'Inter', radius: 'soft', button_style: 'solid', card_style: 'border', layout: 'classic',
    },
  },
  {
    id: 'saude',
    name: 'Saúde',
    description: 'Verde-água, calmo e acolhedor',
    segments: ['clinica', 'estetica'],
    design: {
      primary_color: '#0f766e', secondary_color: '#14b8a6', background_color: '#f0fdfa', surface_color: '#ffffff', text_color: '#134e4a',
      dark_background_color: '#071a18', dark_surface_color: '#0d2623', dark_text_color: '#ccfbf1',
      font_heading: 'Manrope', font_body: 'Manrope', radius: 'rounded', button_style: 'solid', card_style: 'shadow', layout: 'compact',
    },
  },
  {
    id: 'sorriso',
    name: 'Sorriso',
    description: 'Azul claro e amigável',
    segments: ['odonto'],
    design: {
      primary_color: '#0284c7', secondary_color: '#22d3ee', background_color: '#f0f9ff', surface_color: '#ffffff', text_color: '#0c4a6e',
      dark_background_color: '#06131f', dark_surface_color: '#0c2233', dark_text_color: '#e0f2fe',
      font_heading: 'Nunito', font_body: 'Nunito', radius: 'pill', button_style: 'solid', card_style: 'shadow', layout: 'centered',
    },
  },
  {
    id: 'dental-clean',
    name: 'Dental Clean',
    description: 'Branco e menta, bem leve',
    segments: ['odonto', 'clinica'],
    design: {
      primary_color: '#059669', secondary_color: '#6ee7b7', background_color: '#ffffff', surface_color: '#f4f8f7', text_color: '#1e293b',
      dark_background_color: '#0a0f14', dark_surface_color: '#131b23', dark_text_color: '#e2e8f0',
      font_heading: 'DM Sans', font_body: 'DM Sans', radius: 'soft', button_style: 'soft', card_style: 'flat', layout: 'compact',
    },
  },
  {
    id: 'spa',
    name: 'Spa',
    description: 'Verde-sálvia e bege, relaxante',
    segments: ['estetica', 'salao'],
    design: {
      primary_color: '#5f7a61', secondary_color: '#c9ad8b', background_color: '#f4f1ea', surface_color: '#fbfaf6', text_color: '#2f3a2f',
      dark_background_color: '#121612', dark_surface_color: '#1c221c', dark_text_color: '#ecebe4',
      font_heading: 'Cormorant Garamond', font_body: 'Quicksand', radius: 'rounded', button_style: 'solid', card_style: 'flat', layout: 'centered',
    },
  },
  {
    id: 'lavanda',
    name: 'Lavanda',
    description: 'Lilás moderno e delicado',
    segments: ['estetica', 'salao'],
    design: {
      primary_color: '#7c3aed', secondary_color: '#c4b5fd', background_color: '#f7f5ff', surface_color: '#ffffff', text_color: '#2e1065',
      dark_background_color: '#120d1f', dark_surface_color: '#1d1630', dark_text_color: '#ede9fe',
      font_heading: 'Josefin Sans', font_body: 'Nunito', radius: 'pill', button_style: 'soft', card_style: 'shadow', layout: 'modern',
    },
  },
  {
    id: 'profissional',
    name: 'Profissional',
    description: 'Azul-marinho e laranja, sério',
    segments: ['autonomo', 'clinica'],
    design: {
      primary_color: '#1e3a5f', secondary_color: '#f97316', background_color: '#f6f7f9', surface_color: '#ffffff', text_color: '#1f2937',
      dark_background_color: '#0d1520', dark_surface_color: '#16212f', dark_text_color: '#e5e7eb',
      font_heading: 'Space Grotesk', font_body: 'Inter', radius: 'soft', button_style: 'solid', card_style: 'border', layout: 'compact',
    },
  },
  {
    id: 'vibrante',
    name: 'Vibrante',
    description: 'Laranja e amarelo, cheio de energia',
    segments: ['autonomo', 'salao', 'barbearia'],
    design: {
      primary_color: '#ea580c', secondary_color: '#facc15', background_color: '#fff7ed', surface_color: '#ffffff', text_color: '#431407',
      dark_background_color: '#1a0d05', dark_surface_color: '#2a160a', dark_text_color: '#ffedd5',
      font_heading: 'Poppins', font_body: 'Poppins', radius: 'pill', button_style: 'solid', card_style: 'shadow', layout: 'modern',
    },
  },
];

export const DEFAULT_PRESET_ID = 'minimal';

/** Combinações de fontes que funcionam bem juntas. */
export const FONT_PAIRS: { heading: string; body: string; label: string }[] = [
  { heading: 'Inter', body: 'Inter', label: 'Neutra' },
  { heading: 'Oswald', body: 'Inter', label: 'Forte' },
  { heading: 'Playfair Display', body: 'Poppins', label: 'Elegante' },
  { heading: 'Cormorant Garamond', body: 'Quicksand', label: 'Delicada' },
  { heading: 'Bebas Neue', body: 'Montserrat', label: 'Impacto' },
  { heading: 'Space Grotesk', body: 'DM Sans', label: 'Atual' },
  { heading: 'Nunito', body: 'Nunito', label: 'Amigável' },
  { heading: 'DM Serif Display', body: 'Lora', label: 'Clássica' },
];

/** Cores rápidas para a cor principal. */
export const QUICK_COLORS = [
  '#0f172a', '#1c1917', '#dc2626', '#ea580c', '#d97706', '#16a34a', '#0f766e',
  '#0284c7', '#1d4ed8', '#7c3aed', '#be185d', '#7c4a2d',
];

export function applyPreset(theme: Theme, preset: ThemePreset): Theme {
  const { default_mode, ...design } = preset.design;
  return { ...theme, ...design, default_mode: default_mode ?? 'light', preset: preset.id };
}

/** Converte o segmento livre do estabelecimento em um filtro de temas. */
export function segmentFromText(text: string | null | undefined): Segment | 'all' {
  const t = (text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (t.includes('barb')) return 'barbearia';
  if (t.includes('salao') || t.includes('cabel') || t.includes('beleza')) return 'salao';
  if (t.includes('odonto') || t.includes('dent')) return 'odonto';
  if (t.includes('estet') || t.includes('spa')) return 'estetica';
  if (t.includes('clinic') || t.includes('consult')) return 'clinica';
  if (t.includes('autonom') || t.includes('profission')) return 'autonomo';
  return 'all';
}
