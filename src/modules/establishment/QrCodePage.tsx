import { useEffect, useMemo, useState } from 'react';
import { Copy, Download, ExternalLink, FileImage, Printer } from 'lucide-react';
import { Button, Card, Field, PageHeader, Toggle } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { drawQr, encodeQr, qrPath, logoHole, QR_MARGIN, qrToSvg, roundRect, type QrCode } from '../../lib/qrcode';
import { supabase } from '../../lib/supabase';
import { fontFamily, headingWeight, isHexColor, loadFonts, normalizeTheme, readableOn } from '../../lib/theme';
import { useLoad } from '../../lib/useLoad';
import type { Theme } from '../../types/database';
import { useEstablishment } from './EstablishmentContext';

type ColorChoice = 'theme' | 'black' | 'custom';

function slugFile(text: string): string {
  return text.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Falha ao gerar a imagem.'))), 'image/png');
    } catch (err) {
      reject(err);
    }
  });
}

/** Quebra o texto em linhas que cabem na largura. */
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

/** Componente SVG do QR (com espaço central para o logotipo). */
function QrSvg({ qr, color, logoUrl }: { qr: QrCode; color: string; logoUrl: string | null }) {
  const total = qr.size + QR_MARGIN * 2;
  const hole = logoUrl ? logoHole(qr) : undefined;
  return (
    <svg viewBox={`0 0 ${total} ${total}`} shapeRendering="crispEdges" className="h-full w-full" role="img" aria-label="QR Code da página de agendamento">
      <rect width={total} height={total} fill="#ffffff" />
      <path d={qrPath(qr, hole)} fill={color} />
      {hole && logoUrl && (
        <>
          <rect
            x={hole.from + QR_MARGIN}
            y={hole.from + QR_MARGIN}
            width={hole.to - hole.from}
            height={hole.to - hole.from}
            rx={(hole.to - hole.from) * 0.18}
            fill="#ffffff"
          />
          <image
            href={logoUrl}
            x={hole.from + QR_MARGIN + 0.6}
            y={hole.from + QR_MARGIN + 0.6}
            width={hole.to - hole.from - 1.2}
            height={hole.to - hole.from - 1.2}
            preserveAspectRatio="xMidYMid meet"
          />
        </>
      )}
    </svg>
  );
}

export function QrCodePage() {
  const { establishment } = useEstablishment();
  const toast = useToast();
  const url = `${window.location.origin}/agendar/${establishment.slug}`;

  const { data: theme } = useLoad<Theme>(async () => {
    const { data } = await supabase.from('establishment_themes').select('*').eq('establishment_id', establishment.id).maybeSingle();
    return normalizeTheme(data as Theme | null);
  }, [establishment.id]);

  const [colorChoice, setColorChoice] = useState<ColorChoice>('theme');
  const [customColor, setCustomColor] = useState('#0f172a');
  const [withLogo, setWithLogo] = useState(Boolean(establishment.logo_url));
  const [title, setTitle] = useState('Agende seu horário');
  const [subtitle, setSubtitle] = useState('Aponte a câmera do celular para o código');
  const [busy, setBusy] = useState<string | null>(null);

  const primary = theme?.primary_color ?? '#0f172a';
  const headingFont = theme?.font_heading ?? 'Inter';
  useEffect(() => {
    loadFonts([headingFont]);
  }, [headingFont]);

  // cores muito claras deixam o QR ilegível: o tema só é usado se tiver contraste
  const themeColorUsable = readableOn(primary) === '#ffffff';
  const qrColor =
    colorChoice === 'custom' && isHexColor(customColor) ? customColor : colorChoice === 'theme' && themeColorUsable ? primary : '#111111';
  const logoUrl = withLogo ? establishment.logo_url : null;
  // logotipo no centro exige correção de erros alta (H)
  const qr = useMemo(() => encodeQr(url, logoUrl ? 'H' : 'M'), [url, logoUrl]);
  const fileBase = `qrcode-${slugFile(establishment.slug)}`;

  async function logoImage(): Promise<HTMLImageElement | null> {
    if (!logoUrl) return null;
    const img = await loadImage(logoUrl);
    if (!img) toast.error('Não foi possível incluir o logotipo na imagem. O QR Code foi gerado sem ele.');
    return img;
  }

  async function downloadPng() {
    setBusy('png');
    try {
      const logo = await logoImage();
      const code = logo ? qr : encodeQr(url, 'M');
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 1200;
      drawQr(canvas.getContext('2d')!, code, 0, 0, 1200, qrColor, logo);
      download(await canvasBlob(canvas), `${fileBase}.png`);
    } catch {
      toast.error('Não foi possível gerar a imagem.');
    } finally {
      setBusy(null);
    }
  }

  async function downloadSvg() {
    setBusy('svg');
    try {
      let href: string | null = null;
      if (logoUrl) {
        // embute o logotipo para o arquivo funcionar fora do navegador
        try {
          const blob = await (await fetch(logoUrl)).blob();
          href = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          });
        } catch {
          href = logoUrl;
        }
      }
      download(new Blob([qrToSvg(qr, { color: qrColor, logoHref: href })], { type: 'image/svg+xml' }), `${fileBase}.svg`);
    } finally {
      setBusy(null);
    }
  }

  /** Cartaz A4 (1240 × 1754, 150 dpi) pronto para imprimir. */
  async function renderPoster(): Promise<HTMLCanvasElement> {
    const logo = await logoImage();
    const code = logo || !logoUrl ? qr : encodeQr(url, 'M');
    await document.fonts.load(`${headingWeight(headingFont)} 64px "${headingFont}"`).catch(() => undefined);

    const W = 1240;
    const H = 1754;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    const onPrimary = readableOn(primary);
    const heading = (size: number) => `${headingWeight(headingFont)} ${size}px ${fontFamily(headingFont)}`;
    const body = (size: number, weight = 400) => `${weight} ${size}px Inter, system-ui, sans-serif`;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    // faixa superior com logotipo e nome
    ctx.fillStyle = primary;
    ctx.fillRect(0, 0, W, 420);
    let y = 90;
    if (logo) {
      const box = 150;
      const ratio = Math.min(box / logo.naturalWidth, box / logo.naturalHeight);
      const w = logo.naturalWidth * ratio;
      const h = logo.naturalHeight * ratio;
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, W / 2 - box / 2 - 14, y - 14, box + 28, box + 28, 32);
      ctx.fill();
      ctx.drawImage(logo, W / 2 - w / 2, y + (box - h) / 2, w, h);
      y += box + 70;
    } else {
      y += 120;
    }
    ctx.fillStyle = onPrimary;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = heading(logo ? 64 : 84);
    const nameLines = wrapLines(ctx, establishment.name, W - 160).slice(0, 2);
    nameLines.forEach((line, i) => ctx.fillText(line, W / 2, y + i * 76));

    // título
    ctx.fillStyle = '#0f172a';
    ctx.font = heading(80);
    const titleLines = wrapLines(ctx, title, W - 200).slice(0, 2);
    titleLines.forEach((line, i) => ctx.fillText(line, W / 2, 560 + i * 92));

    // QR com moldura
    const qrSize = 760;
    const qrTop = 560 + titleLines.length * 92 + 20;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 4;
    roundRect(ctx, W / 2 - qrSize / 2 - 24, qrTop - 24, qrSize + 48, qrSize + 48, 48);
    ctx.fill();
    ctx.stroke();
    drawQr(ctx, code, W / 2 - qrSize / 2, qrTop, qrSize, qrColor, logo);

    // instruções e link
    ctx.fillStyle = '#475569';
    ctx.font = body(40);
    wrapLines(ctx, subtitle, W - 240)
      .slice(0, 2)
      .forEach((line, i) => ctx.fillText(line, W / 2, qrTop + qrSize + 110 + i * 52));
    ctx.fillStyle = '#0f172a';
    ctx.font = body(34, 600);
    ctx.fillText(url.replace(/^https?:\/\//, ''), W / 2, H - 90);
    return canvas;
  }

  async function downloadPoster() {
    setBusy('poster');
    try {
      download(await canvasBlob(await renderPoster()), `cartaz-${fileBase}.png`);
    } catch {
      toast.error('Não foi possível gerar o cartaz.');
    } finally {
      setBusy(null);
    }
  }

  async function printPoster() {
    // abre a janela já no clique (navegadores bloqueiam pop-ups abertos depois)
    const win = window.open('', '_blank');
    if (!win) {
      toast.error('O navegador bloqueou a janela de impressão. Permita pop-ups ou use “Baixar cartaz”.');
      return;
    }
    win.document.write('<p style="font-family:sans-serif;padding:2rem">Preparando o cartaz…</p>');
    setBusy('print');
    try {
      const dataUrl = (await renderPoster()).toDataURL('image/png');
      win.document.open();
      win.document.write(
        `<!doctype html><html><head><title>Cartaz - ${establishment.name.replace(/</g, '')}</title>` +
          '<style>@page{size:A4;margin:0}html,body{margin:0}img{display:block;width:100%;height:auto}</style></head>' +
          `<body><img src="${dataUrl}" onload="setTimeout(function(){window.focus();window.print()},200)"></body></html>`,
      );
      win.document.close();
    } catch {
      win.close();
      toast.error('Não foi possível gerar o cartaz.');
    } finally {
      setBusy(null);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copiado.');
    } catch {
      toast.error('Não foi possível copiar. Selecione o link e copie manualmente.');
    }
  }

  const onPrimary = readableOn(primary);

  return (
    <>
      <PageHeader
        title="QR Code"
        description="Coloque no balcão, na vitrine ou nas redes: o cliente aponta a câmera e abre a sua página de agendamento."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900">Link de agendamento</h2>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input className="input font-mono text-xs" readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Link de agendamento" />
              <div className="flex gap-2">
                <Button variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={() => void copyLink()}>
                  Copiar
                </Button>
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
                >
                  <ExternalLink className="h-4 w-4" />
                  Abrir
                </a>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900">Aparência</h2>
            <div className="mt-4 space-y-5">
              <div>
                <span className="mb-2 block text-sm font-medium text-slate-700">Cor do código</span>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ['theme', 'Cor do tema'],
                      ['black', 'Preto'],
                      ['custom', 'Personalizada'],
                    ] as [ColorChoice, string][]
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setColorChoice(value)}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                        colorChoice === value ? 'border-slate-900 ring-2 ring-slate-900/10' : 'border-slate-200 hover:border-slate-400'
                      }`}
                    >
                      <span
                        className="h-4 w-4 rounded-full ring-1 ring-black/10"
                        style={{ backgroundColor: value === 'theme' ? primary : value === 'black' ? '#111111' : customColor }}
                      />
                      {label}
                    </button>
                  ))}
                  {colorChoice === 'custom' && (
                    <input
                      type="color"
                      aria-label="Escolher cor"
                      className="h-10 w-14 cursor-pointer rounded-lg border border-slate-200"
                      value={customColor}
                      onChange={(e) => setCustomColor(e.target.value)}
                    />
                  )}
                </div>
                {colorChoice === 'theme' && !themeColorUsable && (
                  <p className="mt-2 text-xs text-amber-700">A cor do tema é clara demais para ser lida pela câmera; usamos preto.</p>
                )}
                {colorChoice === 'custom' && readableOn(customColor) !== '#ffffff' && (
                  <p className="mt-2 text-xs text-amber-700">Cores claras podem dificultar a leitura. Prefira tons escuros.</p>
                )}
              </div>

              <Toggle
                checked={withLogo && Boolean(establishment.logo_url)}
                onChange={setWithLogo}
                disabled={!establishment.logo_url}
                label={establishment.logo_url ? 'Logotipo no centro do código' : 'Logotipo no centro (envie um logotipo em Personalização)'}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Título do cartaz">
                  <input className="input" maxLength={40} value={title} onChange={(e) => setTitle(e.target.value)} />
                </Field>
                <Field label="Instrução">
                  <input className="input" maxLength={70} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
                </Field>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900">Baixar e imprimir</h2>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Button icon={<Printer className="h-4 w-4" />} loading={busy === 'print'} onClick={() => void printPoster()}>
                Imprimir cartaz
              </Button>
              <Button variant="secondary" icon={<FileImage className="h-4 w-4" />} loading={busy === 'poster'} onClick={() => void downloadPoster()}>
                Baixar cartaz (A4)
              </Button>
              <Button variant="secondary" icon={<Download className="h-4 w-4" />} loading={busy === 'png'} onClick={() => void downloadPng()}>
                Baixar QR Code (PNG)
              </Button>
              <Button variant="secondary" icon={<Download className="h-4 w-4" />} loading={busy === 'svg'} onClick={() => void downloadSvg()}>
                Baixar QR Code (SVG)
              </Button>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              PNG para redes sociais e WhatsApp; SVG para gráficas (não perde qualidade ao ampliar). Teste a leitura com o celular antes de imprimir.
            </p>
          </Card>
        </div>

        {/* prévia do cartaz */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <p className="mb-3 text-sm font-medium text-slate-700">Prévia do cartaz</p>
          <div className="mx-auto w-full max-w-[380px] overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-slate-200">
            <div className="flex flex-col items-center px-6 py-7 text-center" style={{ backgroundColor: primary, color: onPrimary }}>
              {establishment.logo_url && (
                <img src={establishment.logo_url} alt="" className="mb-3 h-14 w-14 rounded-xl bg-white object-contain p-1" />
              )}
              <p className="text-2xl leading-tight" style={{ fontFamily: fontFamily(headingFont), fontWeight: headingWeight(headingFont) }}>
                {establishment.name}
              </p>
            </div>
            <div className="px-8 pb-7 pt-6 text-center">
              <p className="text-2xl leading-tight text-slate-900" style={{ fontFamily: fontFamily(headingFont), fontWeight: headingWeight(headingFont) }}>
                {title || ' '}
              </p>
              <div className="mx-auto mt-5 aspect-square w-full max-w-[240px] rounded-2xl p-2 ring-1 ring-slate-200">
                <QrSvg qr={qr} color={qrColor} logoUrl={logoUrl} />
              </div>
              <p className="mt-4 text-sm text-slate-600">{subtitle}</p>
              <p className="mt-3 truncate text-xs font-semibold text-slate-900">{url.replace(/^https?:\/\//, '')}</p>
            </div>
          </div>
          {url.includes('localhost') && (
            <p className="mx-auto mt-3 max-w-[380px] text-xs text-amber-700">
              Você está em <strong>localhost</strong>: este QR Code só funciona neste computador. Gere o QR definitivo depois de publicar o site.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
