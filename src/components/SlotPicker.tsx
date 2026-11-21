import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { addDays, formatDayMonth, formatTime, todayInZone, weekdayOf, WEEKDAYS_SHORT } from '../lib/format';
import { useLoad } from '../lib/useLoad';
import type { Slot } from '../types/database';
import { ErrorBox, Spinner } from './ui';

interface Props {
  timeZone: string;
  /** quantos dias à frente podem ser escolhidos */
  maxDays: number;
  /** busca os horários livres da data (sempre calculados no backend) */
  loadSlots: (date: string) => Promise<Slot[]>;
  value: Slot | null;
  onChange: (slot: Slot | null) => void;
  /** muda quando serviço/profissional mudam, para recarregar */
  reloadKey?: string;
  /** "public" usa as cores do tema do estabelecimento */
  variant?: 'panel' | 'public';
}

/** Seleção de dia e horário usada na página pública e nos painéis. */
export function SlotPicker({ timeZone, maxDays, loadSlots, value, onChange, reloadKey = '', variant = 'panel' }: Props) {
  const themed = variant === 'public';
  const today = todayInZone(timeZone);
  const days = useMemo(
    () => Array.from({ length: Math.min(Math.max(maxDays, 1), 90) + 1 }, (_, i) => addDays(today, i)),
    [today, maxDays],
  );
  const [date, setDate] = useState(today);

  const { data, loading, error, reload } = useLoad(async () => {
    const slots = await loadSlots(date);
    // "qualquer profissional": mantém um horário por instante
    const unique = new Map<string, Slot>();
    for (const slot of slots) {
      const key = new Date(slot.slot_start).toISOString();
      if (!unique.has(key)) unique.set(key, slot);
    }
    return Array.from(unique.values());
  }, [date, reloadKey]);

  const optionClass = (selected: boolean) =>
    themed
      ? 'pub-option'
      : `rounded-lg border transition ${selected ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-800 hover:border-slate-400'}`;

  return (
    <div>
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
        {days.map((day) => {
          const selected = day === date;
          return (
            <button
              key={day}
              type="button"
              data-selected={selected}
              onClick={() => {
                setDate(day);
                onChange(null);
              }}
              className={`flex w-14 shrink-0 flex-col items-center px-2 py-2 text-xs ${optionClass(selected)}`}
              style={themed ? { textAlign: 'center' } : undefined}
            >
              <span className="font-medium">{day === today ? 'Hoje' : WEEKDAYS_SHORT[weekdayOf(day)]}</span>
              <span className="mt-0.5 text-sm font-semibold">{formatDayMonth(day)}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-3">
        {loading &&
          (themed ? (
            <div className="pub-muted flex items-center justify-center gap-2 py-8 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Buscando horários…
            </div>
          ) : (
            <Spinner label="Buscando horários…" />
          ))}
        {error &&
          (themed ? (
            <div className="pub-soft px-4 py-4 text-center text-sm" style={{ borderRadius: 'var(--r-inner)' }}>
              <p>{error}</p>
              <button type="button" className="mt-1 font-semibold underline" onClick={() => void reload()}>
                Tentar novamente
              </button>
            </div>
          ) : (
            <ErrorBox message={error} onRetry={() => void reload()} />
          ))}
        {!loading && !error && data && data.length === 0 && (
          <p
            className={themed ? 'pub-soft px-4 py-6 text-center text-sm' : 'rounded-lg bg-slate-100 px-4 py-6 text-center text-sm text-slate-600'}
            style={themed ? { borderRadius: 'var(--r-inner)' } : undefined}
          >
            Nenhum horário disponível nesta data. Escolha outro dia.
          </p>
        )}
        {!loading && !error && data && data.length > 0 && (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {data.map((slot) => {
              const selected = value !== null && new Date(value.slot_start).getTime() === new Date(slot.slot_start).getTime();
              return (
                <button
                  key={slot.slot_start}
                  type="button"
                  data-selected={selected}
                  onClick={() => onChange(slot)}
                  className={`py-2 text-sm font-medium ${optionClass(selected)}`}
                  style={themed ? { textAlign: 'center' } : undefined}
                >
                  {formatTime(slot.slot_start, timeZone)}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
