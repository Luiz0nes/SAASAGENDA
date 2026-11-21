import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays, weekdayOf, WEEKDAYS_SHORT } from '../../lib/format';

export interface DayCount {
  /** agendamentos ativos no dia (pendentes, confirmados e concluídos) */
  total: number;
  /** aguardando confirmação */
  pending: number;
}

interface Props {
  start: string;
  days: number;
  today: string;
  selected: string;
  counts: Record<string, DayCount>;
  loading?: boolean;
  onSelect: (date: string) => void;
  onShift: (days: number) => void;
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function monthOf(date: string): string {
  return MONTHS[Number(date.slice(5, 7)) - 1];
}

/** Faixa de dias em botões, com o número de agendamentos de cada dia. */
export function DayStrip({ start, days, today, selected, counts, loading = false, onSelect, onShift }: Props) {
  const list = Array.from({ length: days }, (_, i) => addDays(start, i));
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  // mantém o dia escolhido visível na faixa (no celular ela rola)
  useEffect(() => {
    refs.current[selected]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [selected, start]);

  const end = list[list.length - 1];

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-700">
          {Number(start.slice(8))} {monthOf(start)} – {Number(end.slice(8))} {monthOf(end)}
        </p>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => onShift(-7)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-slate-400"
            aria-label="Semana anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onShift(7)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-slate-400"
            aria-label="Próxima semana"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-2 pb-1 pt-2.5" role="listbox" aria-label="Dias">
        {list.map((day) => {
          const isSelected = day === selected;
          const isToday = day === today;
          const count = counts[day];
          const total = count?.total ?? 0;
          const pending = count?.pending ?? 0;
          return (
            <button
              key={day}
              ref={(el: HTMLButtonElement | null) => {
                refs.current[day] = el;
              }}
              type="button"
              role="option"
              aria-selected={isSelected}
              aria-label={`${isToday ? 'Hoje, ' : ''}${WEEKDAYS_SHORT[weekdayOf(day)]} ${Number(day.slice(8))} de ${monthOf(day)}: ${
                total === 0 ? 'sem agendamentos' : `${total} agendamento${total > 1 ? 's' : ''}`
              }${pending > 0 ? `, ${pending} aguardando confirmação` : ''}`}
              onClick={() => onSelect(day)}
              className={`relative flex min-w-[68px] flex-1 flex-col items-center rounded-xl border px-2 pb-2 pt-2.5 transition ${
                isSelected
                  ? 'border-slate-900 bg-slate-900 text-white shadow-md'
                  : isToday
                    ? 'border-slate-900 bg-white text-slate-900'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'
              }`}
            >
              <span className={`text-[11px] font-semibold uppercase tracking-wide ${isSelected ? 'text-white/80' : 'text-slate-500'}`}>
                {isToday ? 'Hoje' : WEEKDAYS_SHORT[weekdayOf(day)]}
              </span>
              <span className="text-xl font-bold leading-tight">{Number(day.slice(8))}</span>
              <span className={`flex items-center gap-1 text-[11px] ${isSelected ? 'text-white/70' : 'text-slate-400'}`}>
                {pending > 0 && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden />}
                {monthOf(day)}
              </span>

              {/* notificação: quantidade de agendamentos do dia */}
              {total > 0 && (
                <span
                  className="absolute -right-1.5 -top-2 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold leading-none text-white shadow ring-2 ring-white"
                >
                  {total > 99 ? '99+' : total}
                </span>
              )}
              {loading && total === 0 && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-slate-300" aria-hidden />}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">2</span>
          agendamentos no dia
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          aguardando confirmação
        </span>
      </div>
    </div>
  );
}
