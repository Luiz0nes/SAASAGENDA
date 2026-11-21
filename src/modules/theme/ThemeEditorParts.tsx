// Peças do editor de Personalização (uma por aba).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Info, Loader2, Monitor, Moon, Plus, Sun, Wand, X } from 'lucide-react';
import { ImageUpload } from '../../components/ImageUpload';
import { Field, Toggle } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { uploadAsset } from '../../lib/supabase';
import {
  contrastRatio, FONT_CATEGORY_LABEL, fontFamily, FONTS, headingWeight, isHexColor, loadFonts, mix, readableOn, suggestDarkPalette,
} from '../../lib/theme';
import type { ButtonStyle, CardStyle, ColorMode, HeroAnimation, Theme, ThemeLayout, ThemeRadius } from '../../types/database';
import { FONT_PAIRS, PRESETS, QUICK_COLORS, SEGMENTS, type Segment, type ThemeDesign, type ThemePreset } from './presets';

type Update = (patch: Partial<Theme>) => void;

// ---------------------------------------------------------------------
// Blocos comuns
// ---------------------------------------------------------------------
export function SectionTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
    </div>
  );
}

function OptionCard({ selected, onClick, title, description, children }: { selected: boolean; onClick: () => void; title: string; description?: string; children?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`relative rounded-xl border bg-white p-3 text-left transition ${selected ? 'border-slate-900 ring-2 ring-slate-900/10' : 'border-slate-200 hover:border-slate-400'}`}
    >
      {selected && (
        <span className="absolute right-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-white">
          <Check className="h-3 w-3" />
        </span>
      )}
      {children}
      <p className={`text-sm font-medium text-slate-900 ${children ? 'mt-2.5' : ''}`}>{title}</p>
      {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
    </button>
  );
}

function Warning({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

// ---------------------------------------------------------------------
// Aba Temas
// ---------------------------------------------------------------------
const MOCK_RADIUS: Record<ThemeRadius, number> = { square: 2, soft: 6, rounded: 10, pill: 12 };

function PresetMockup({ design }: { design: ThemeDesign }) {
  const onPrimary = readableOn(design.primary_color);
  const r = MOCK_RADIUS[design.radius];
  const dark = design.default_mode === 'dark';
  const bg = dark ? design.dark_background_color : design.background_color;
  const surface = dark ? design.dark_surface_color : design.surface_color;
  const text = dark ? design.dark_text_color : design.text_color;
  const line = mix(text, surface, 0.35);
  return (
    <div className="overflow-hidden rounded-lg" style={{ backgroundColor: bg }}>
      <div className="flex items-center gap-1.5 px-3 py-3" style={{ backgroundColor: design.primary_color, color: onPrimary }}>
        <span className="h-4 w-4 shrink-0" style={{ backgroundColor: onPrimary, borderRadius: Math.min(r, 4) }} />
        <span
          className="truncate text-[12px] leading-none"
          style={{ fontFamily: fontFamily(design.font_heading), fontWeight: headingWeight(design.font_heading) }}
        >
          Sua marca
        </span>
      </div>
      <div className="space-y-2 p-2.5">
        <div className="flex gap-1">
          <span className="h-2 w-8 rounded-full" style={{ backgroundColor: design.primary_color }} />
          <span className="h-2 w-6 rounded-full" style={{ backgroundColor: mix(design.primary_color, bg, 0.75) }} />
        </div>
        <div
          className="space-y-1.5 p-2"
          style={{
            backgroundColor: surface,
            borderRadius: r,
            border: design.card_style === 'border' ? `1px solid ${mix(text, surface, 0.85)}` : '1px solid transparent',
            boxShadow: design.card_style === 'shadow' ? '0 4px 10px -6px rgba(0,0,0,.35)' : 'none',
          }}
        >
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="h-1.5 w-10 rounded-full" style={{ backgroundColor: line }} />
              <span className="h-px flex-1 border-t border-dotted" style={{ borderColor: line }} />
              <span className="h-2 w-4 rounded-full" style={{ backgroundColor: design.secondary_color }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ThemesTab({ theme, segment, onSegment, onApply }: { theme: Theme; segment: Segment | 'all'; onSegment: (s: Segment | 'all') => void; onApply: (p: ThemePreset) => void }) {
  useEffect(() => {
    loadFonts(PRESETS.map((p) => p.design.font_heading));
  }, []);
  const list = segment === 'all' ? PRESETS : PRESETS.filter((p) => p.segments.includes(segment));

  return (
    <div>
      <SectionTitle title="Temas prontos" description="Um clique aplica cores, fontes e estilo. Depois é só ajustar o que quiser nas outras abas." />
      <div className="no-scrollbar -mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
        {SEGMENTS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onSegment(s.id)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              segment === s.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
        {list.map((preset) => (
          <OptionCard key={preset.id} selected={theme.preset === preset.id} onClick={() => onApply(preset)} title={preset.name} description={preset.description}>
            <PresetMockup design={preset.design} />
          </OptionCard>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Aba Cores
// ---------------------------------------------------------------------
export function ColorField({ label, hint, value, onChange }: { label: string; hint?: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5">
      <label className="relative h-10 w-10 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-black/10 shadow-inner" style={{ backgroundColor: value }}>
        <input type="color" aria-label={label} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" value={value} onChange={(e) => onChange(e.target.value.toLowerCase())} />
      </label>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">{label}</p>
        {hint && <p className="truncate text-xs text-slate-500">{hint}</p>}
      </div>
      <input
        aria-label={`${label} (código)`}
        className="w-20 rounded-md border border-slate-200 px-2 py-1 font-mono text-xs uppercase text-slate-700 outline-none focus:border-slate-900"
        value={text}
        maxLength={7}
        onChange={(e) => {
          const next = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`;
          setText(next);
          if (isHexColor(next)) onChange(next.toLowerCase());
        }}
        onBlur={() => setText(value)}
      />
    </div>
  );
}

export function ColorsTab({ theme, update }: { theme: Theme; update: Update }) {
  const lowContrast = contrastRatio(theme.text_color, theme.surface_color) < 4.5 || contrastRatio(theme.text_color, theme.background_color) < 4.5;
  return (
    <div className="space-y-6">
      <div>
        <SectionTitle title="Cor principal" description="Usada nos botões, nas seleções e nos destaques da página." />
        <div className="mb-3 flex flex-wrap gap-2">
          {QUICK_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Usar ${color}`}
              onClick={() => update({ primary_color: color })}
              className={`h-8 w-8 rounded-full border-2 transition ${theme.primary_color === color ? 'border-slate-900 ring-2 ring-slate-900/20' : 'border-white shadow ring-1 ring-black/10'}`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
        <ColorField label="Cor principal" hint="Botões e seleções" value={theme.primary_color} onChange={(v) => update({ primary_color: v })} />
      </div>

      <div>
        <SectionTitle title="Demais cores (modo claro)" description="As cores do modo escuro ficam na aba Modo escuro." />
        <div className="grid gap-3 sm:grid-cols-2">
          <ColorField label="Cor de destaque" hint="Ícones e detalhes" value={theme.secondary_color} onChange={(v) => update({ secondary_color: v })} />
          <ColorField label="Fundo da página" value={theme.background_color} onChange={(v) => update({ background_color: v })} />
          <ColorField label="Fundo dos cartões" value={theme.surface_color} onChange={(v) => update({ surface_color: v })} />
          <ColorField label="Texto" value={theme.text_color} onChange={(v) => update({ text_color: v })} />
        </div>
        {lowContrast && <Warning>Pouco contraste entre o texto e o fundo. Alguns clientes podem ter dificuldade para ler.</Warning>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Aba Fontes
// ---------------------------------------------------------------------
function FontGrid({ value, onChange, sample }: { value: string; onChange: (name: string) => void; sample: string }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {FONTS.map((font) => {
        const selected = value === font.name;
        return (
          <button
            key={font.name}
            type="button"
            onClick={() => onChange(font.name)}
            aria-pressed={selected}
            className={`relative rounded-xl border p-3 text-left transition ${selected ? 'border-slate-900 ring-2 ring-slate-900/10' : 'border-slate-200 hover:border-slate-400'}`}
          >
            <span className="block truncate text-xl text-slate-900" style={{ fontFamily: fontFamily(font.name), fontWeight: headingWeight(font.name) }}>
              {sample}
            </span>
            <span className="mt-1 flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-slate-700">{font.name}</span>
              <span className="shrink-0 text-slate-400">{FONT_CATEGORY_LABEL[font.category]}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function FontsTab({ theme, update }: { theme: Theme; update: Update }) {
  useEffect(() => {
    loadFonts(FONTS.map((f) => f.name));
  }, []);
  return (
    <div className="space-y-6">
      <div>
        <SectionTitle title="Combinações prontas" description="Pares de fontes que ficam bem juntos." />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {FONT_PAIRS.map((pair) => {
            const selected = theme.font_heading === pair.heading && theme.font_body === pair.body;
            return (
              <button
                key={pair.label}
                type="button"
                onClick={() => update({ font_heading: pair.heading, font_body: pair.body })}
                className={`rounded-xl border p-3 text-left transition ${selected ? 'border-slate-900 ring-2 ring-slate-900/10' : 'border-slate-200 hover:border-slate-400'}`}
              >
                <span className="block truncate text-lg text-slate-900" style={{ fontFamily: fontFamily(pair.heading), fontWeight: headingWeight(pair.heading) }}>
                  {pair.label}
                </span>
                <span className="block truncate text-xs text-slate-500" style={{ fontFamily: fontFamily(pair.body) }}>
                  {pair.heading} + {pair.body}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <SectionTitle title="Fonte dos títulos" description="Nome do estabelecimento e títulos das seções." />
        <FontGrid value={theme.font_heading} onChange={(font_heading) => update({ font_heading })} sample="Aa Bb" />
      </div>
      <div>
        <SectionTitle title="Fonte dos textos" description="Serviços, formulários e informações." />
        <FontGrid value={theme.font_body} onChange={(font_body) => update({ font_body })} sample="Aa Bb" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Aba Estilo
// ---------------------------------------------------------------------
function LayoutSketch({ layout, color }: { layout: ThemeLayout; color: string }) {
  const bar = <span className="block h-1.5 rounded-full bg-slate-300" />;
  return (
    <div className="h-20 overflow-hidden rounded-lg bg-slate-50 ring-1 ring-slate-200">
      {layout === 'classic' && (
        <>
          <div className="h-7" style={{ backgroundColor: color }} />
          <div className="-mt-3 px-2">
            <span className="block h-6 w-6 rounded-md border-2 border-white bg-slate-400" />
            <div className="mt-1.5 w-2/3 space-y-1">{bar}{bar}</div>
          </div>
        </>
      )}
      {layout === 'modern' && (
        <div className="flex h-full flex-col justify-end gap-1 p-2" style={{ backgroundColor: color }}>
          <span className="block h-2.5 w-3/4 rounded-full bg-white/90" />
          <span className="block h-1.5 w-1/2 rounded-full bg-white/60" />
        </div>
      )}
      {layout === 'centered' && (
        <>
          <div className="h-7" style={{ backgroundColor: color }} />
          <div className="-mt-3 flex flex-col items-center">
            <span className="block h-6 w-6 rounded-full border-2 border-white bg-slate-400" />
            <span className="mt-1.5 block h-1.5 w-1/2 rounded-full bg-slate-300" />
            <span className="mt-1 block h-1.5 w-1/3 rounded-full bg-slate-300" />
          </div>
        </>
      )}
      {layout === 'compact' && (
        <div className="flex items-center gap-2 p-2 pt-4">
          <span className="block h-7 w-7 shrink-0 rounded-md bg-slate-400" />
          <div className="flex-1 space-y-1">{bar}<span className="block h-1.5 w-2/3 rounded-full bg-slate-300" /></div>
        </div>
      )}
    </div>
  );
}

const LAYOUT_OPTIONS: { value: ThemeLayout; label: string; description: string }[] = [
  { value: 'classic', label: 'Clássico', description: 'Capa e logotipo ao lado' },
  { value: 'modern', label: 'Moderno', description: 'Nome sobre a capa' },
  { value: 'centered', label: 'Centralizado', description: 'Logotipo no centro' },
  { value: 'compact', label: 'Compacto', description: 'Sem capa, direto ao ponto' },
];

const HERO_OPTIONS: { value: HeroAnimation; label: string; description: string }[] = [
  { value: 'none', label: 'Sem animação', description: 'Topo parado' },
  { value: 'soft', label: 'Suave', description: 'Entrada leve e capa com zoom lento' },
  { value: 'dynamic', label: 'Dinâmica', description: 'Entrada marcante, brilho, capa em movimento e faixa animada' },
];

/** Mini demonstração animada de cada opção (usa os keyframes do index.css). */
function HeroSketch({ value, theme }: { value: HeroAnimation; theme: Theme }) {
  const animated = value !== 'none';
  return (
    <div
      className="relative h-20 overflow-hidden rounded-lg"
      style={{
        backgroundImage: `linear-gradient(135deg, ${theme.primary_color}, ${mix(theme.primary_color, '#000000', 0.45)}, ${mix(theme.primary_color, theme.secondary_color, 0.5)})`,
        backgroundSize: animated ? '220% 220%' : undefined,
        animation: animated ? `hero-gradient ${value === 'dynamic' ? 4 : 7}s ease infinite` : undefined,
      }}
    >
      <div className="absolute bottom-4 left-3 space-y-1.5">
        <span className="block h-2.5 w-20 rounded-full bg-white/90" />
        <span className="block h-1.5 w-12 rounded-full" style={{ backgroundColor: theme.secondary_color }} />
      </div>
      {value === 'dynamic' && (
        <div
          className="absolute inset-x-0 bottom-0 h-1.5"
          style={{
            backgroundImage: `repeating-linear-gradient(-45deg, ${theme.secondary_color} 0 7px, #ffffff 7px 14px, ${theme.primary_color} 14px 21px, #ffffff 21px 28px)`,
            animation: 'hero-stripes 1.4s linear infinite',
          }}
        />
      )}
    </div>
  );
}

const RADIUS_OPTIONS: { value: ThemeRadius; label: string; px: string }[] = [
  { value: 'square', label: 'Retos', px: '3px' },
  { value: 'soft', label: 'Suaves', px: '10px' },
  { value: 'rounded', label: 'Arredondados', px: '18px' },
  { value: 'pill', label: 'Pílula', px: '999px' },
];

const BUTTON_OPTIONS: { value: ButtonStyle; label: string }[] = [
  { value: 'solid', label: 'Preenchido' },
  { value: 'outline', label: 'Contorno' },
  { value: 'soft', label: 'Suave' },
];

const CARD_OPTIONS: { value: CardStyle; label: string; description: string }[] = [
  { value: 'border', label: 'Com borda', description: 'Linhas finas' },
  { value: 'shadow', label: 'Com sombra', description: 'Cartões flutuando' },
  { value: 'flat', label: 'Lisos', description: 'Sem borda nem sombra' },
];

export function StyleTab({ theme, update }: { theme: Theme; update: Update }) {
  const primary = theme.primary_color;
  const onPrimary = readableOn(primary);
  const soft = mix(primary, '#ffffff', 0.88);
  return (
    <div className="space-y-7">
      <div>
        <SectionTitle title="Cabeçalho" description="Como o nome, o logotipo e a capa aparecem no topo da página." />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {LAYOUT_OPTIONS.map((o) => (
            <OptionCard key={o.value} selected={theme.layout === o.value} onClick={() => update({ layout: o.value })} title={o.label} description={o.description}>
              <LayoutSketch layout={o.value} color={primary} />
            </OptionCard>
          ))}
        </div>
      </div>

      <div>
        <SectionTitle title="Animação do topo" description="Como o nome, o logotipo e a capa aparecem quando o cliente abre a página." />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {HERO_OPTIONS.map((o) => (
            <OptionCard key={o.value} selected={theme.hero_animation === o.value} onClick={() => update({ hero_animation: o.value })} title={o.label} description={o.description}>
              <HeroSketch value={o.value} theme={theme} />
            </OptionCard>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Ao escolher, a animação toca de novo na pré-visualização. Quem ativou “reduzir movimento” no celular vê a página sem animação.
        </p>
      </div>

      <div>
        <SectionTitle title="Cantos" description="Arredondamento de cartões, botões e campos." />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {RADIUS_OPTIONS.map((o) => (
            <OptionCard key={o.value} selected={theme.radius === o.value} onClick={() => update({ radius: o.value })} title={o.label}>
              <div className="flex h-12 items-center justify-center rounded-lg bg-slate-50">
                <span className="h-7 w-20 border-2 border-slate-700" style={{ borderRadius: o.px }} />
              </div>
            </OptionCard>
          ))}
        </div>
      </div>

      <div>
        <SectionTitle title="Botões" />
        <div className="grid grid-cols-3 gap-3">
          {BUTTON_OPTIONS.map((o) => {
            const style =
              o.value === 'solid'
                ? { backgroundColor: primary, color: onPrimary, border: `1.5px solid ${primary}` }
                : o.value === 'outline'
                  ? { backgroundColor: 'transparent', color: primary, border: `1.5px solid ${primary}` }
                  : { backgroundColor: soft, color: primary, border: '1.5px solid transparent' };
            return (
              <OptionCard key={o.value} selected={theme.button_style === o.value} onClick={() => update({ button_style: o.value })} title={o.label}>
                <div className="flex h-12 items-center justify-center rounded-lg bg-slate-50">
                  <span className="px-3 py-1.5 text-xs font-semibold" style={{ ...style, borderRadius: RADIUS_OPTIONS.find((r) => r.value === theme.radius)?.px }}>
                    Agendar
                  </span>
                </div>
              </OptionCard>
            );
          })}
        </div>
      </div>

      <div>
        <SectionTitle title="Cartões" />
        <div className="grid grid-cols-3 gap-3">
          {CARD_OPTIONS.map((o) => (
            <OptionCard key={o.value} selected={theme.card_style === o.value} onClick={() => update({ card_style: o.value })} title={o.label} description={o.description}>
              <div className="flex h-12 items-center justify-center rounded-lg bg-slate-100">
                <span
                  className="h-7 w-20 rounded-md bg-white"
                  style={{
                    border: o.value === 'border' ? '1px solid #cbd5e1' : '1px solid transparent',
                    boxShadow: o.value === 'shadow' ? '0 6px 14px -6px rgba(15,23,42,.45)' : 'none',
                  }}
                />
              </div>
            </OptionCard>
          ))}
        </div>
      </div>

      <div>
        <SectionTitle title="O que mostrar" />
        <div className="space-y-3">
          <Toggle checked={theme.show_prices} onChange={(show_prices) => update({ show_prices })} label="Mostrar preços dos serviços" />
          <Toggle checked={theme.show_professionals} onChange={(show_professionals) => update({ show_professionals })} label="Mostrar a equipe e deixar o cliente escolher o profissional" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Aba Modo escuro
// ---------------------------------------------------------------------
const MODE_OPTIONS: { value: ColorMode; label: string; description: string; icon: ReactNode }[] = [
  { value: 'light', label: 'Claro', description: 'Sempre abre no claro', icon: <Sun className="h-5 w-5" /> },
  { value: 'dark', label: 'Escuro', description: 'Sempre abre no escuro', icon: <Moon className="h-5 w-5" /> },
  { value: 'system', label: 'Automático', description: 'Segue o celular do cliente', icon: <Monitor className="h-5 w-5" /> },
];

export function DarkModeTab({ theme, update, onModeChosen }: { theme: Theme; update: Update; onModeChosen: (mode: ColorMode) => void }) {
  const primary = theme.primary_color;
  return (
    <div className="space-y-7">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">Botão de modo escuro para os clientes</p>
            <p className="mt-0.5 text-sm text-slate-500">Aparece no canto superior da página. A escolha do cliente fica salva no celular dele.</p>
          </div>
          <span
            className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border px-3 py-1.5 text-xs font-semibold sm:self-center"
            style={{ borderColor: mix(primary, '#ffffff', 0.7), color: '#0f172a', backgroundColor: '#ffffff' }}
          >
            <Moon className="h-3.5 w-3.5" />
            Modo escuro
          </span>
        </div>
        <div className="mt-4">
          <Toggle checked={theme.dark_mode_toggle} onChange={(dark_mode_toggle) => update({ dark_mode_toggle })} label={theme.dark_mode_toggle ? 'Botão ativado' : 'Botão desativado'} />
        </div>
      </div>

      <div>
        <SectionTitle title="Como a página abre" description={theme.dark_mode_toggle ? 'O cliente ainda pode trocar pelo botão.' : 'Sem o botão, o cliente sempre vê o modo escolhido aqui.'} />
        <div className="grid grid-cols-3 gap-3">
          {MODE_OPTIONS.map((o) => (
            <OptionCard
              key={o.value}
              selected={theme.default_mode === o.value}
              onClick={() => {
                update({ default_mode: o.value });
                onModeChosen(o.value);
              }}
              title={o.label}
              description={o.description}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700">{o.icon}</span>
            </OptionCard>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Cores do modo escuro</h2>
            <p className="mt-0.5 text-sm text-slate-500">A cor principal e a de destaque são as mesmas do modo claro.</p>
          </div>
          <button
            type="button"
            onClick={() => update(suggestDarkPalette(theme))}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Wand className="h-3.5 w-3.5" />
            Gerar a partir das cores claras
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <ColorField label="Fundo da página" value={theme.dark_background_color} onChange={(v) => update({ dark_background_color: v })} />
          <ColorField label="Fundo dos cartões" value={theme.dark_surface_color} onChange={(v) => update({ dark_surface_color: v })} />
          <ColorField label="Texto" value={theme.dark_text_color} onChange={(v) => update({ dark_text_color: v })} />
        </div>
        {contrastRatio(theme.dark_text_color, theme.dark_surface_color) < 4.5 && (
          <Warning>Pouco contraste entre o texto e os cartões no modo escuro.</Warning>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Aba Logo, capa e textos
// ---------------------------------------------------------------------
const MAX_PHOTOS = 12;

function GalleryEditor({ establishmentId, value, onChange }: { establishmentId: string; value: string[]; onChange: (urls: string[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const toast = useToast();

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const room = MAX_PHOTOS - value.length;
    const selected = Array.from(files).slice(0, room);
    if (files.length > room) toast.error(`Limite de ${MAX_PHOTOS} fotos. Apenas ${room} foram adicionadas.`);
    setUploading(true);
    const added: string[] = [];
    for (const file of selected) {
      try {
        added.push(await uploadAsset(establishmentId, file, 'foto'));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Não foi possível enviar uma das fotos.');
      }
    }
    onChange([...value, ...added]);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {value.map((url, index) => (
          <div key={url} className="group relative aspect-[4/3] overflow-hidden rounded-lg bg-slate-100">
            <img src={url} alt={`Foto ${index + 1}`} className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(value.filter((u) => u !== url))}
              className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
              aria-label={`Remover foto ${index + 1}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {value.length < MAX_PHOTOS && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex aspect-[4/3] flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 text-xs font-medium text-slate-500 hover:border-slate-500 hover:text-slate-700 disabled:opacity-60"
          >
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
            {uploading ? 'Enviando…' : 'Adicionar'}
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => void handleFiles(e.target.files)} />
      <p className="mt-2 text-xs text-slate-500">
        {value.length} de {MAX_PHOTOS} fotos · JPG, PNG ou WebP de até 5 MB.
      </p>
    </div>
  );
}

export function ImagesTab({
  establishmentId,
  theme,
  update,
  logoUrl,
  coverUrl,
  onLogo,
  onCover,
}: {
  establishmentId: string;
  theme: Theme;
  update: Update;
  logoUrl: string | null;
  coverUrl: string | null;
  onLogo: (url: string | null) => void;
  onCover: (url: string | null) => void;
}) {
  return (
    <div className="space-y-7">
      <div>
        <SectionTitle title="Logotipo e capa" description="A capa aparece nos layouts Clássico, Moderno e Centralizado." />
        <div className="grid gap-6 sm:grid-cols-2">
          <ImageUpload establishmentId={establishmentId} prefix="logo" label="Logotipo" value={logoUrl} onChange={onLogo} />
          <ImageUpload establishmentId={establishmentId} prefix="capa" label="Imagem de capa" value={coverUrl} onChange={onCover} wide />
        </div>
      </div>

      <div>
        <SectionTitle title="Fotos" description="Mostre o espaço e os seus trabalhos. Aparecem em uma galeria abaixo do agendamento." />
        <GalleryEditor establishmentId={establishmentId} value={theme.gallery} onChange={(gallery) => update({ gallery })} />
      </div>

      <div>
        <SectionTitle title="Textos" />
        <div className="space-y-4">
          <Field label="Frase de destaque" hint="Uma linha abaixo do nome. Ex.: “Seu estilo, no seu horário.”">
            <input className="input" maxLength={120} value={theme.headline ?? ''} onChange={(e) => update({ headline: e.target.value })} />
          </Field>
          <Field label="Texto de apresentação" hint="Aparece no cartão “Sobre”. Em branco, usa a descrição das Configurações.">
            <textarea className="input" rows={4} maxLength={1000} value={theme.about_text ?? ''} onChange={(e) => update({ about_text: e.target.value })} />
          </Field>
        </div>
      </div>
    </div>
  );
}

