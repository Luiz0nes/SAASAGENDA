import { useMemo, useState } from 'react';
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
  accentClassName?: string;
}

/** Seleção de dia e horário usada na página pública e nos painéis. */
export function SlotPicker({ timeZone, maxDays, loadSlots, value, onChange, reloadKey = '', accentClassName = 'bg-slate-900 text-white border-slate-900' }: Props) {
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

  return (
    <div>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
        {days.map((day) => {
          const selected = day === date;
          return (
            <button
              key={day}
              type="button"
              onClick={() => {
                setDate(day);
                onChange(null);
              }}
              className={`flex w-14 shrink-0 flex-col items-center rounded-lg border px-2 py-2 text-xs transition ${
                selected ? accentClassName : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'
              }`}
            >
              <span className="font-medium">{day === today ? 'Hoje' : WEEKDAYS_SHORT[weekdayOf(day)]}</span>
              <span className="mt-0.5 text-sm font-semibold">{formatDayMonth(day)}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-3">
        {loading && <Spinner label="Buscando horários…" />}
        {error && <ErrorBox message={error} onRetry={() => void reload()} />}
        {!loading && !error && data && data.length === 0 && (
          <p className="rounded-lg bg-slate-100 px-4 py-6 text-center text-sm text-slate-600">Nenhum horário disponível nesta data. Escolha outro dia.</p>
        )}
        {!loading && !error && data && data.length > 0 && (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {data.map((slot) => {
              const selected = value !== null && new Date(value.slot_start).getTime() === new Date(slot.slot_start).getTime();
              return (
                <button
                  key={slot.slot_start}
                  type="button"
                  onClick={() => onChange(slot)}
                  className={`rounded-lg border py-2 text-sm font-medium transition ${
                    selected ? accentClassName : 'border-slate-200 bg-white text-slate-800 hover:border-slate-400'
                  }`}
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
