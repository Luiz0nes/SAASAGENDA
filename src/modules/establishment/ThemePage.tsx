import { useEffect, useState, type FormEvent } from 'react';
import { ExternalLink } from 'lucide-react';
import { ImageUpload } from '../../components/ImageUpload';
import { Button, Card, ErrorBox, Field, PageHeader, Spinner, Toggle } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { contrastColor } from '../../lib/format';
import { errorMessage, supabase, unwrap } from '../../lib/supabase';
import { useLoad } from '../../lib/useLoad';
import type { Theme, ThemeLayout } from '../../types/database';
import { useEstablishment } from './EstablishmentContext';

const LAYOUTS: { value: ThemeLayout; label: string; description: string }[] = [
  { value: 'classic', label: 'Clássico', description: 'Capa no topo e logotipo sobreposto.' },
  { value: 'modern', label: 'Moderno', description: 'Capa grande com o nome sobre a imagem.' },
  { value: 'compact', label: 'Compacto', description: 'Sem capa, direto para os serviços.' },
];

const COLOR_FIELDS: { key: 'primary_color' | 'secondary_color' | 'background_color' | 'text_color'; label: string }[] = [
  { key: 'primary_color', label: 'Cor principal' },
  { key: 'secondary_color', label: 'Cor secundária' },
  { key: 'background_color', label: 'Fundo' },
  { key: 'text_color', label: 'Texto' },
];

export function ThemePage() {
  const { establishment, refresh } = useEstablishment();
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(
    async () => unwrap<Theme | null>(await supabase.from('establishment_themes').select('*').eq('establishment_id', establishment.id).maybeSingle()),
    [establishment.id],
  );

  const [theme, setTheme] = useState<Theme | null>(null);
  const [logoUrl, setLogoUrl] = useState(establishment.logo_url);
  const [coverUrl, setCoverUrl] = useState(establishment.cover_url);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) setTheme(data);
  }, [data]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!theme) return;
    setSaving(true);
    try {
      unwrap(
        await supabase
          .from('establishment_themes')
          .update({
            primary_color: theme.primary_color,
            secondary_color: theme.secondary_color,
            background_color: theme.background_color,
            text_color: theme.text_color,
            layout: theme.layout,
            headline: theme.headline?.trim() || null,
            about_text: theme.about_text?.trim() || null,
            show_prices: theme.show_prices,
            show_professionals: theme.show_professionals,
          })
          .eq('establishment_id', establishment.id),
      );
      unwrap(await supabase.from('establishments').update({ logo_url: logoUrl, cover_url: coverUrl }).eq('id', establishment.id));
      await refresh();
      toast.success('Personalização salva. A página pública já está atualizada.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading && !theme) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={() => void reload()} />;
  if (!theme) return <ErrorBox message="Tema não encontrado para este estabelecimento. Fale com o suporte da plataforma." />;

  return (
    <form onSubmit={handleSubmit}>
      <PageHeader
        title="Personalização"
        description="Identidade visual da sua página pública de agendamento."
        actions={
          <a
            href={`/agendar/${establishment.slug}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            <ExternalLink className="h-4 w-4" />
            Ver página pública
          </a>
        }
      />

      <Card className="p-4">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Imagens</h2>
        <div className="grid gap-6 sm:grid-cols-2">
          <ImageUpload establishmentId={establishment.id} prefix="logo" label="Logotipo" value={logoUrl} onChange={setLogoUrl} />
          <ImageUpload establishmentId={establishment.id} prefix="capa" label="Imagem de capa" value={coverUrl} onChange={setCoverUrl} wide />
        </div>
      </Card>

      <Card className="mt-4 p-4">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Cores</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {COLOR_FIELDS.map(({ key, label }) => (
            <label key={key} className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
              <span className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white p-1.5">
                <input
                  type="color"
                  className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
                  value={theme[key]}
                  onChange={(e) => setTheme({ ...theme, [key]: e.target.value })}
                />
                <span className="text-xs uppercase text-slate-600">{theme[key]}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="mt-4 rounded-xl border border-slate-200 p-4" style={{ backgroundColor: theme.background_color, color: theme.text_color }}>
          <p className="text-xs opacity-70">Prévia</p>
          <p className="text-lg font-semibold">{establishment.name}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-lg px-4 py-2 text-sm font-medium" style={{ backgroundColor: theme.primary_color, color: contrastColor(theme.primary_color) }}>
              Agendar horário
            </span>
            <span className="rounded-lg px-4 py-2 text-sm font-medium" style={{ backgroundColor: theme.secondary_color, color: contrastColor(theme.secondary_color) }}>
              Destaque
            </span>
          </div>
        </div>
      </Card>

      <Card className="mt-4 p-4">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Layout e textos</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {LAYOUTS.map((layout) => (
            <button
              key={layout.value}
              type="button"
              onClick={() => setTheme({ ...theme, layout: layout.value })}
              className={`rounded-lg border p-3 text-left transition ${
                theme.layout === layout.value ? 'border-slate-900 ring-2 ring-slate-900/10' : 'border-slate-200 hover:border-slate-400'
              }`}
            >
              <p className="text-sm font-semibold text-slate-900">{layout.label}</p>
              <p className="mt-1 text-xs text-slate-500">{layout.description}</p>
            </button>
          ))}
        </div>
        <div className="mt-4 space-y-4">
          <Field label="Frase de destaque" hint="Uma linha abaixo do nome. Ex.: “Seu estilo, no seu horário.”">
            <input className="input" maxLength={120} value={theme.headline ?? ''} onChange={(e) => setTheme({ ...theme, headline: e.target.value })} />
          </Field>
          <Field label="Texto de apresentação">
            <textarea className="input" rows={3} maxLength={1000} value={theme.about_text ?? ''} onChange={(e) => setTheme({ ...theme, about_text: e.target.value })} />
          </Field>
          <Toggle checked={theme.show_prices} onChange={(show_prices) => setTheme({ ...theme, show_prices })} label="Mostrar preços dos serviços" />
          <Toggle
            checked={theme.show_professionals}
            onChange={(show_professionals) => setTheme({ ...theme, show_professionals })}
            label="Permitir que o cliente escolha o profissional"
          />
        </div>
      </Card>

      <div className="mt-6 flex justify-end">
        <Button type="submit" loading={saving}>
          Salvar personalização
        </Button>
      </div>
    </form>
  );
}
