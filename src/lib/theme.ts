// Motor de temas da página pública: fontes, cores, modo escuro e as
// variáveis CSS que cada estabelecimento aplica na própria página.
import type { CSSProperties } from 'react';
import type { ButtonStyle, CardStyle, ColorMode, HeroAnimation, Theme, ThemeLayout, ThemeRadius } from '../types/database';

// ---------------------------------------------------------------------
// Fontes (Google Fonts). Só nomes desta lista são carregados.
// ---------------------------------------------------------------------
export type FontCategory = 'sans' | 'serif' | 'display';

export interface FontOption {
  name: string;
  category: FontCategory;
  /** pesos disponíveis no Google Fonts */
  weights: string;
}

export const FONTS: FontOption[] = [
  { name: 'Inter', category: 'sans', weights: '400;500;600;700' },
  { name: 'Poppins', category: 'sans', weights: '400;500;600;700' },
  { name: 'Montserrat', category: 'sans', weights: '400;500;600;700' },
  { name: 'Nunito', category: 'sans', weights: '400;500;600;700' },
  { name: 'DM Sans', category: 'sans', weights: '400;500;600;700' },
  { name: 'Manrope', category: 'sans', weights: '400;500;600;700' },
  { name: 'Raleway', category: 'sans', weights: '400;500;600;700' },
  { name: 'Quicksand', category: 'sans', weights: '400;500;600;700' },
  { name: 'Josefin Sans', category: 'sans', weights: '400;500;600;700' },
  { name: 'Space Grotesk', category: 'sans', weights: '400;500;600;700' },
  { name: 'Oswald', category: 'display', weights: '400;500;600;700' },
  { name: 'Bebas Neue', category: 'display', weights: '400' },
  { name: 'Playfair Display', category: 'serif', weights: '400;500;600;700' },
  { name: 'DM Serif Display', category: 'serif', weights: '400' },
  { name: 'Cormorant Garamond', category: 'serif', weights: '400;500;600;700' },
  { name: 'Lora', category: 'serif', weights: '400;500;600;700' },
  { name: 'Merriweather', category: 'serif', weights: '400;700' },
  { name: 'Libre Baskerville', category: 'serif', weights: '400;700' },
];

export const FONT_CATEGORY_LABEL: Record<FontCategory, string> = {
  sans: 'Moderna',
  serif: 'Clássica',
  display: 'Impacto',
};

function findFont(name: string): FontOption | undefined {
  return FONTS.find((f) => f.name === name);
}

export function fontFamily(name: string): string {
  const font = findFont(name);
  const fallback = font?.category === 'serif' ? 'Georgia, "Times New Roman", serif' : 'ui-sans-serif, system-ui, sans-serif';
  return font ? `"${font.name}", ${fallback}` : fallback;
}

/** Fontes de um peso só (ex.: Bebas Neue) não podem ser "negritadas". */
export function headingWeight(name: string): number {
  return findFont(name)?.weights === '400' ? 400 : 700;
}

/** Injeta as folhas do Google Fonts necessárias (uma vez por fonte). */
export function loadFonts(names: string[]): void {
  if (typeof document === 'undefined') return;
  for (const name of new Set(names)) {
    const font = findFont(name);
    if (!font) continue;
    const id = `gf-${font.name.replace(/\s+/g, '-').toLowerCase()}`;
    if (document.getElementById(id)) continue;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${font.name.replace(/ /g, '+')}:wght@${font.weights}&display=swap`;
    document.head.appendChild(link);
  }
}

// ---------------------------------------------------------------------
// Cores
// ---------------------------------------------------------------------
export function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

function toRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function toHex([r, g, b]: number[]): string {
  return `#${[r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('')}`;
}

/** Mistura `a` com `b`; `amount` = quanto de `b` (0 a 1). */
export function mix(a: string, b: string, amount: number): string {
  const ca = toRgb(a);
  const cb = toRgb(b);
  return toHex(ca.map((c, i) => c + (cb[i] - c) * amount));
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = toRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Branco ou quase-preto, o que tiver mais contraste sobre `bg`. */
export function readableOn(bg: string): string {
  return contrastRatio(bg, '#ffffff') >= contrastRatio(bg, '#0f172a') ? '#ffffff' : '#0f172a';
}

// ---------------------------------------------------------------------
// Tema padrão e normalização
// ---------------------------------------------------------------------
export const DEFAULT_THEME: Theme = {
  preset: 'minimal',
  primary_color: '#0f172a',
  secondary_color: '#2563eb',
  background_color: '#f8fafc',
  surface_color: '#ffffff',
  text_color: '#0f172a',
  dark_background_color: '#0b1120',
  dark_surface_color: '#151c2c',
  dark_text_color: '#f1f5f9',
  font_heading: 'Inter',
  font_body: 'Inter',
  radius: 'soft',
  button_style: 'solid',
  card_style: 'border',
  layout: 'classic',
  hero_animation: 'soft',
  dark_mode_toggle: true,
  default_mode: 'light',
  headline: null,
  about_text: null,
  gallery: [],
  show_prices: true,
  show_professionals: true,
};

const COLOR_KEYS = [
  'primary_color', 'secondary_color', 'background_color', 'surface_color', 'text_color',
  'dark_background_color', 'dark_surface_color', 'dark_text_color',
] as const;

const LAYOUTS: ThemeLayout[] = ['classic', 'modern', 'compact', 'centered'];
const RADII: ThemeRadius[] = ['square', 'soft', 'rounded', 'pill'];
const BUTTONS: ButtonStyle[] = ['solid', 'outline', 'soft'];
const CARDS: CardStyle[] = ['border', 'shadow', 'flat'];
const MODES: ColorMode[] = ['light', 'dark', 'system'];
const HERO_ANIMATIONS: HeroAnimation[] = ['none', 'soft', 'dynamic'];

function pick<T>(value: unknown, options: T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

/** Completa e valida um tema vindo do banco (ou de uma mensagem). */
export function normalizeTheme(raw: Partial<Theme> | null | undefined): Theme {
  const t = { ...DEFAULT_THEME, ...(raw ?? {}) } as Theme;
  const result: Theme = { ...t };
  for (const key of COLOR_KEYS) result[key] = isHexColor(String(t[key])) ? String(t[key]).toLowerCase() : DEFAULT_THEME[key];
  result.font_heading = findFont(t.font_heading) ? t.font_heading : DEFAULT_THEME.font_heading;
  result.font_body = findFont(t.font_body) ? t.font_body : DEFAULT_THEME.font_body;
  result.layout = pick(t.layout, LAYOUTS, DEFAULT_THEME.layout);
  result.radius = pick(t.radius, RADII, DEFAULT_THEME.radius);
  result.button_style = pick(t.button_style, BUTTONS, DEFAULT_THEME.button_style);
  result.card_style = pick(t.card_style, CARDS, DEFAULT_THEME.card_style);
  result.default_mode = pick(t.default_mode, MODES, DEFAULT_THEME.default_mode);
  result.hero_animation = pick(t.hero_animation, HERO_ANIMATIONS, DEFAULT_THEME.hero_animation);
  result.gallery = Array.isArray(t.gallery) ? t.gallery.filter((u): u is string => typeof u === 'string').slice(0, 12) : [];
  result.dark_mode_toggle = t.dark_mode_toggle !== false;
  result.show_prices = t.show_prices !== false;
  result.show_professionals = t.show_professionals !== false;
  return result;
}

// ---------------------------------------------------------------------
// Modo claro/escuro
// ---------------------------------------------------------------------
export type ResolvedMode = 'light' | 'dark';

function modeKey(slug: string): string {
  return `agenda.mode.${slug}`;
}

export function readStoredMode(slug: string): ResolvedMode | null {
  try {
    const value = window.localStorage.getItem(modeKey(slug));
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

export function storeMode(slug: string, mode: ResolvedMode): void {
  try {
    window.localStorage.setItem(modeKey(slug), mode);
  } catch {
    // sem armazenamento: a escolha vale até fechar a página
  }
}

export function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
}

/** Modo com que a página abre para o cliente. */
export function initialMode(theme: Theme, slug: string, allowStored: boolean): ResolvedMode {
  const stored = allowStored && theme.dark_mode_toggle ? readStoredMode(slug) : null;
  if (stored) return stored;
  if (theme.default_mode === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return theme.default_mode;
}

/** Paleta escura sugerida a partir das cores claras. */
export function suggestDarkPalette(theme: Theme): Pick<Theme, 'dark_background_color' | 'dark_surface_color' | 'dark_text_color'> {
  return {
    dark_background_color: mix(theme.primary_color, '#05070b', 0.9),
    dark_surface_color: mix(theme.primary_color, '#0b0f17', 0.8),
    dark_text_color: mix(theme.background_color, '#f8fafc', 0.6),
  };
}

// ---------------------------------------------------------------------
// Variáveis CSS
// ---------------------------------------------------------------------
const RADIUS_VARS: Record<ThemeRadius, { card: string; inner: string; btn: string; input: string }> = {
  square: { card: '4px', inner: '3px', btn: '3px', input: '3px' },
  soft: { card: '14px', inner: '10px', btn: '10px', input: '10px' },
  rounded: { card: '22px', inner: '16px', btn: '16px', input: '14px' },
  pill: { card: '26px', inner: '18px', btn: '999px', input: '18px' },
};

export interface ThemePalette {
  bg: string;
  surface: string;
  text: string;
  primary: string;
  onPrimary: string;
  primaryText: string;
  accent: string;
  muted: string;
  border: string;
  soft: string;
}

/** Cores efetivas do modo (corrige uma cor principal invisível no fundo). */
export function themePalette(theme: Theme, mode: ResolvedMode): ThemePalette {
  const dark = mode === 'dark';
  const bg = dark ? theme.dark_background_color : theme.background_color;
  const surface = dark ? theme.dark_surface_color : theme.surface_color;
  const text = dark ? theme.dark_text_color : theme.text_color;

  let primary = theme.primary_color;
  if (contrastRatio(primary, surface) < 1.6) {
    // ex.: botão preto no modo escuro — usa o destaque ou clareia
    primary = contrastRatio(theme.secondary_color, surface) >= 2.2 ? theme.secondary_color : mix(primary, dark ? '#ffffff' : '#000000', 0.55);
  }
  const primaryText = contrastRatio(primary, surface) >= 3 ? primary : mix(primary, text, 0.55);

  return {
    bg,
    surface,
    text,
    primary,
    onPrimary: readableOn(primary),
    primaryText,
    accent: theme.secondary_color,
    muted: mix(text, surface, dark ? 0.35 : 0.42),
    border: mix(text, surface, dark ? 0.8 : 0.87),
    soft: mix(primary, surface, dark ? 0.8 : 0.9),
  };
}

/** Variáveis CSS consumidas pelas classes .pub-* (src/index.css). */
export function themeVars(theme: Theme, mode: ResolvedMode): CSSProperties {
  const p = themePalette(theme, mode);
  const dark = mode === 'dark';
  const radius = RADIUS_VARS[theme.radius];

  const card = {
    border: { border: p.border, shadow: 'none' },
    shadow: {
      border: 'transparent',
      shadow: dark ? '0 14px 36px -18px rgba(0, 0, 0, 0.85)' : '0 14px 36px -20px rgba(15, 23, 42, 0.32)',
    },
    flat: { border: 'transparent', shadow: 'none' },
  }[theme.card_style];

  const button = {
    solid: { bg: p.primary, fg: p.onPrimary, border: p.primary },
    outline: { bg: 'transparent', fg: p.primaryText, border: p.primary },
    soft: { bg: p.soft, fg: p.primaryText, border: 'transparent' },
  }[theme.button_style];

  return {
    '--c-bg': p.bg,
    '--c-surface': p.surface,
    '--c-text': p.text,
    '--c-muted': p.muted,
    '--c-border': p.border,
    '--c-soft': p.soft,
    '--c-primary': p.primary,
    '--c-on-primary': p.onPrimary,
    '--c-primary-text': p.primaryText,
    '--c-accent': p.accent,
    '--c-on-accent': readableOn(p.accent),
    '--c-ring': rgba(p.primary, 0.28),
    // três paradas: o gradiente "respira" quando a animação do topo está ligada
    '--header-bg': `linear-gradient(135deg, ${p.primary} 0%, ${mix(p.primary, '#000000', 0.42)} 50%, ${mix(p.primary, p.accent, 0.45)} 100%)`,
    '--r-card': radius.card,
    '--r-inner': radius.inner,
    '--r-btn': radius.btn,
    '--r-input': radius.input,
    '--card-border': card.border,
    '--card-shadow': card.shadow,
    '--btn-bg': button.bg,
    '--btn-fg': button.fg,
    '--btn-border': button.border,
    '--font-heading': fontFamily(theme.font_heading),
    '--font-body': fontFamily(theme.font_body),
    '--heading-weight': String(headingWeight(theme.font_heading)),
    colorScheme: dark ? 'dark' : 'light',
  } as CSSProperties;
}
