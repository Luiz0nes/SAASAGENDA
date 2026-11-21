import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Monitor, Moon, Smartphone, Sun } from 'lucide-react';
import type { ResolvedMode } from '../../lib/theme';

export type PreviewDevice = 'mobile' | 'desktop';

interface Props {
  src: string;
  iframeRef: RefObject<HTMLIFrameElement>;
  device: PreviewDevice;
  onDevice: (device: PreviewDevice) => void;
  mode: ResolvedMode;
  onMode: (mode: ResolvedMode) => void;
  onLoad: () => void;
  urlLabel: string;
}

const SIZES = {
  mobile: { width: 375, height: 760, outerWidth: 375 + 24, outerHeight: 760 + 24 },
  desktop: { width: 1280, height: 800, outerWidth: 1280, outerHeight: 800 + 40 },
};

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; icon: ReactNode }[] }) {
  return (
    <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-label={o.label}
          title={o.label}
          aria-pressed={value === o.value}
          className={`flex h-8 w-8 items-center justify-center rounded-md transition ${value === o.value ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'}`}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}

/**
 * Moldura de celular ou de navegador com a página pública real dentro de
 * um iframe. O iframe tem a largura de verdade do aparelho (os pontos de
 * quebra do layout funcionam) e é reduzido com transform para caber.
 * A estrutura é sempre a mesma para o iframe não recarregar ao trocar.
 */
export function PreviewPanel({ src, iframeRef, device, onDevice, mode, onMode, onLoad, urlLabel }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(0);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const update = () => setAvailable(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const size = SIZES[device];
  const scale = available === 0 ? 0 : Math.min(device === 'mobile' ? 0.86 : 0.72, available / size.outerWidth);
  const mobile = device === 'mobile';

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-700">Como o cliente vê</p>
        <div className="flex gap-2">
          <Segmented
            value={mode}
            onChange={onMode}
            options={[
              { value: 'light', label: 'Ver no modo claro', icon: <Sun className="h-4 w-4" /> },
              { value: 'dark', label: 'Ver no modo escuro', icon: <Moon className="h-4 w-4" /> },
            ]}
          />
          <Segmented
            value={device}
            onChange={onDevice}
            options={[
              { value: 'mobile', label: 'Celular', icon: <Smartphone className="h-4 w-4" /> },
              { value: 'desktop', label: 'Computador', icon: <Monitor className="h-4 w-4" /> },
            ]}
          />
        </div>
      </div>

      <div ref={boxRef} className="w-full">
        <div className="mx-auto" style={{ width: size.outerWidth * scale, height: size.outerHeight * scale }}>
          <div
            className={mobile ? 'relative rounded-[3.25rem] bg-slate-900 p-3 shadow-2xl' : 'relative overflow-hidden rounded-xl border border-slate-300 bg-white shadow-2xl'}
            style={{ width: size.outerWidth, height: size.outerHeight, transform: `scale(${scale})`, transformOrigin: 'top left' }}
          >
            <div className={mobile ? 'hidden' : 'flex h-10 items-center gap-3 border-b border-slate-200 bg-slate-100 px-4'}>
              <span className="flex gap-1.5">
                <span className="h-3 w-3 rounded-full bg-red-400" />
                <span className="h-3 w-3 rounded-full bg-amber-400" />
                <span className="h-3 w-3 rounded-full bg-emerald-400" />
              </span>
              <span className="flex-1 truncate rounded-md bg-white px-3 py-1 text-xs text-slate-500">{urlLabel}</span>
            </div>
            <iframe
              ref={iframeRef}
              src={src}
              title="Pré-visualização da página de agendamento"
              onLoad={onLoad}
              className={mobile ? 'block overflow-hidden rounded-[2.5rem] bg-white' : 'block bg-white'}
              style={{ width: size.width, height: size.height, border: 0 }}
            />
            <div className={mobile ? 'pointer-events-none absolute left-1/2 top-5 h-6 w-24 -translate-x-1/2 rounded-full bg-slate-900' : 'hidden'} />
          </div>
        </div>
      </div>
    </div>
  );
}
