import { useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { uploadAsset } from '../lib/supabase';
import { Button } from './ui';
import { useToast } from './Toast';

interface Props {
  establishmentId: string;
  prefix: string;
  value: string | null;
  onChange: (url: string | null) => void;
  label: string;
  wide?: boolean;
}

/** Envia a imagem ao Supabase Storage e devolve a URL pública. */
export function ImageUpload({ establishmentId, prefix, value, onChange, label, wide = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const toast = useToast();

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      onChange(await uploadAsset(establishmentId, file, prefix));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível enviar a imagem.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <div className="flex items-center gap-3">
        <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100 ${wide ? 'h-20 w-36' : 'h-20 w-20'}`}>
          {value ? <img src={value} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-6 w-6 text-slate-400" />}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" loading={uploading} onClick={() => inputRef.current?.click()}>
            {value ? 'Trocar imagem' : 'Enviar imagem'}
          </Button>
          {value && (
            <Button variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" />} onClick={() => onChange(null)}>
              Remover
            </Button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
      </div>
    </div>
  );
}
