import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ExternalLink, Image as ImageIcon, LayoutTemplate, Moon, Palette, RotateCcw, Sparkles, Type } from 'lucide-react';
import { Button, ConfirmModal, ErrorBox, Spinner } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { errorMessage, supabase, unwrap } from '../../lib/supabase';
import { normalizeTheme, systemPrefersDark, type ResolvedMode } from '../../lib/theme';
import { useLoad } from '../../lib/useLoad';
import type { ColorMode, Theme } from '../../types/database';
import { PreviewPanel, type PreviewDevice } from '../theme/PreviewPanel';
import { applyPreset, DEFAULT_PRESET_ID, PRESETS, segmentFromText, type Segment, type ThemePreset } from '../theme/presets';
import { isPreviewReady, type EditorMessage } from '../theme/previewProtocol';
import { ColorsTab, DarkModeTab, FontsTab, ImagesTab, StyleTab, ThemesTab } from '../theme/ThemeEditorParts';
import { useEstablishment } from './EstablishmentContext';

type TabId = 'themes' | 'colors' | 'fonts' | 'style' | 'dark' | 'images';

const TABS: { id: TabId; label: string; icon: ReactNode }[] = [
  { id: 'themes', label: 'Temas', icon: <Sparkles className="h-4 w-4" /> },
  { id: 'colors', label: 'Cores', icon: <Palette className="h-4 w-4" /> },
  { id: 'fonts', label: 'Fontes', icon: <Type className="h-4 w-4" /> },
  { id: 'style', label: 'Estilo', icon: <LayoutTemplate className="h-4 w-4" /> },
  { id: 'dark', label: 'Modo escuro', icon: <Moon className="h-4 w-4" /> },
  { id: 'images', label: 'Imagens', icon: <ImageIcon className="h-4 w-4" /> },
];

interface Draft {
  theme: Theme;
  logo_url: string | null;
  cover_url: string | null;
}

function modeFor(mode: ColorMode): ResolvedMode {
  if (mode === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return mode;
}

/** Colunas gravadas em establishment_themes. */
function themeRow(t: Theme) {
  return {
    preset: t.preset,
    primary_color: t.primary_color,
    secondary_color: t.secondary_color,
    background_color: t.background_color,
    surface_color: t.surface_color,
    text_color: t.text_color,
    dark_background_color: t.dark_background_color,
    dark_surface_color: t.dark_surface_color,
    dark_text_color: t.dark_text_color,
    font_heading: t.font_heading,
    font_body: t.font_body,
    radius: t.radius,
    button_style: t.button_style,
    card_style: t.card_style,
    layout: t.layout,
    hero_animation: t.hero_animation,
    dark_mode_toggle: t.dark_mode_toggle,
    default_mode: t.default_mode,
    headline: t.headline?.trim() || null,
    about_text: t.about_text?.trim() || null,
    gallery: t.gallery,
    show_prices: t.show_prices,
    show_professionals: t.show_professionals,
  };
}

export function ThemePage() {
  const { establishment, refresh } = useEstablishment();
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(
    async () => unwrap<Theme | null>(await supabase.from('establishment_themes').select('*').eq('establishment_id', establishment.id).maybeSingle()),
    [establishment.id],
  );

  const [saved, setSaved] = useState<Draft | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [tab, setTab] = useState<TabId>('themes');
  const [segment, setSegment] = useState<Segment | 'all'>(() => segmentFromText(establishment.segment));
  const [device, setDevice] = useState<PreviewDevice>('mobile');
  const [previewMode, setPreviewMode] = useState<ResolvedMode>('light');
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // carrega o tema salvo como ponto de partida
  useEffect(() => {
    if (!data) return;
    const initial: Draft = { theme: normalizeTheme(data), logo_url: establishment.logo_url, cover_url: establishment.cover_url };
    setSaved(initial);
    setDraft(initial);
    setPreviewMode(modeFor(initial.theme.default_mode));
    // só ao carregar; depois de salvar, "saved" é atualizado em handleSave
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);

  // avisa antes de fechar a aba com alterações não salvas
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const update = useCallback((patch: Partial<Theme>) => {
    setDraft((current) => (current ? { ...current, theme: { ...current.theme, ...patch } } : current));
  }, []);

  // ---- pré-visualização ao vivo (iframe na mesma origem) ----
  const postToPreview = useCallback(() => {
    const target = iframeRef.current?.contentWindow;
    if (!target || !draft) return;
    const message: EditorMessage = {
      source: 'agenda-theme-editor',
      theme: draft.theme,
      logo_url: draft.logo_url,
      cover_url: draft.cover_url,
      mode: previewMode,
    };
    target.postMessage(message, window.location.origin);
  }, [draft, previewMode]);

  useEffect(() => {
    postToPreview();
  }, [postToPreview]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== iframeRef.current?.contentWindow) return;
      if (isPreviewReady(event.data)) postToPreview();
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [postToPreview]);

  function applyTheme(preset: ThemePreset) {
    if (!draft) return;
    const next = applyPreset(draft.theme, preset);
    update(next);
    setPreviewMode(modeFor(next.default_mode));
  }

  function resetToDefault() {
    const preset = PRESETS.find((p) => p.id === DEFAULT_PRESET_ID);
    if (preset && draft) {
      update({ ...applyPreset(draft.theme, preset), dark_mode_toggle: true, show_prices: true, show_professionals: true });
      setPreviewMode('light');
    }
    setConfirmReset(false);
    toast.success('Tema padrão aplicado. Salve para publicar.');
  }

  async function handleSave() {
    if (!draft || !saved) return;
    setSaving(true);
    try {
      unwrap(await supabase.from('establishment_themes').update(themeRow(draft.theme)).eq('establishment_id', establishment.id));
      if (draft.logo_url !== saved.logo_url || draft.cover_url !== saved.cover_url) {
        unwrap(await supabase.from('establishments').update({ logo_url: draft.logo_url, cover_url: draft.cover_url }).eq('id', establishment.id));
        await refresh();
      }
      const clean: Draft = { ...draft, theme: { ...draft.theme, headline: draft.theme.headline?.trim() || null, about_text: draft.theme.about_text?.trim() || null } };
      setSaved(clean);
      setDraft(clean);
      toast.success('Personalização publicada. A página dos clientes já está atualizada.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading && !draft) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={() => void reload()} />;
  if (!draft) return <ErrorBox message="Tema não encontrado para este estabelecimento. Fale com o suporte da plataforma." />;

  const publicUrl = `${window.location.origin}/agendar/${establishment.slug}`;
  const theme = draft.theme;

  return (
    <div className="pb-24">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Personalização</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            Escolha um tema e ajuste os detalhes. A pré-visualização mostra a página exatamente como o cliente vai ver.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setConfirmReset(true)}>
            Voltar ao padrão
          </Button>
          <a
            href={publicUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            <ExternalLink className="h-4 w-4" />
            Abrir página
          </a>
        </div>
      </div>

      {/* no modo computador a prévia ocupa a largura toda (só o CSS muda: o iframe não recarrega) */}
      <div className={`grid gap-8 ${device === 'mobile' ? 'xl:grid-cols-[minmax(0,1fr)_400px]' : ''}`}>
        <div className="min-w-0">
          <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible" role="tablist" aria-label="Seções da personalização">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  tab === t.id ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-900'
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" role="tabpanel">
            {tab === 'themes' && <ThemesTab theme={theme} segment={segment} onSegment={setSegment} onApply={applyTheme} />}
            {tab === 'colors' && <ColorsTab theme={theme} update={update} />}
            {tab === 'fonts' && <FontsTab theme={theme} update={update} />}
            {tab === 'style' && <StyleTab theme={theme} update={update} />}
            {tab === 'dark' && <DarkModeTab theme={theme} update={update} onModeChosen={(mode) => setPreviewMode(modeFor(mode))} />}
            {tab === 'images' && (
              <ImagesTab
                establishmentId={establishment.id}
                theme={theme}
                update={update}
                logoUrl={draft.logo_url}
                coverUrl={draft.cover_url}
                onLogo={(logo_url) => setDraft((d) => (d ? { ...d, logo_url } : d))}
                onCover={(cover_url) => setDraft((d) => (d ? { ...d, cover_url } : d))}
              />
            )}
          </div>
        </div>

        <div className={device === 'mobile' ? 'xl:sticky xl:top-6 xl:self-start' : 'order-first'}>
          <PreviewPanel
            src={`/preview/${establishment.id}`}
            iframeRef={iframeRef}
            device={device}
            onDevice={setDevice}
            mode={previewMode}
            onMode={setPreviewMode}
            onLoad={postToPreview}
            urlLabel={publicUrl.replace(/^https?:\/\//, '')}
          />
        </div>
      </div>

      {dirty && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 lg:pl-64">
          <div className="flex w-full max-w-xl items-center justify-between gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-white shadow-2xl">
            <p className="text-sm">Alterações não publicadas</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setDraft(saved);
                  if (saved) setPreviewMode(modeFor(saved.theme.default_mode));
                }}
                disabled={saving}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-300 hover:bg-white/10 hover:text-white"
              >
                Descartar
              </button>
              <Button onClick={() => void handleSave()} loading={saving} className="!bg-white !text-slate-900 hover:!bg-slate-100">
                Salvar e publicar
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirmReset}
        title="Voltar ao padrão"
        message="Aplica o tema Minimal (cores, fontes e estilo) e reativa o botão de modo escuro. Logotipo, capa, fotos e textos são mantidos. Nada é publicado até você salvar."
        confirmLabel="Aplicar padrão"
        onConfirm={resetToDefault}
        onClose={() => setConfirmReset(false)}
      />
    </div>
  );
}
