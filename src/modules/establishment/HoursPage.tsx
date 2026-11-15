import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Card, ConfirmModal, EmptyState, ErrorBox, Field, Modal, PageHeader, Spinner, Toggle } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { formatDateTime, todayInZone, trimTime, WEEKDAYS, zonedToIso } from '../../lib/format';
import { errorMessage, supabase, unwrap } from '../../lib/supabase';
import { useLoad } from '../../lib/useLoad';
import type { BlockedTime, BusinessHour, Professional } from '../../types/database';
import { useEstablishment } from './EstablishmentContext';

interface DayForm {
  weekday: number;
  isOpen: boolean;
  opens: string;
  closes: string;
}

interface BlockForm {
  professionalId: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  allDay: boolean;
  reason: string;
}

export function HoursPage() {
  const { establishment } = useEstablishment();
  const toast = useToast();
  const tz = establishment.timezone;

  const { data, loading, error, reload } = useLoad(async () => {
    const [hours, blocks, professionals] = await Promise.all([
      supabase.from('business_hours').select('*').eq('establishment_id', establishment.id),
      supabase
        .from('blocked_times')
        .select('*')
        .eq('establishment_id', establishment.id)
        .gte('ends_at', new Date().toISOString())
        .order('starts_at'),
      supabase.from('professionals').select('*').eq('establishment_id', establishment.id).order('name'),
    ]);
    return {
      hours: unwrap<BusinessHour[]>(hours),
      blocks: unwrap<BlockedTime[]>(blocks),
      professionals: unwrap<Professional[]>(professionals),
    };
  }, [establishment.id]);

  const [days, setDays] = useState<DayForm[]>([]);
  const [block, setBlock] = useState<BlockForm | null>(null);
  const [toDelete, setToDelete] = useState<BlockedTime | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setDays(
      WEEKDAYS.map((_, weekday) => {
        const row = data.hours.find((h) => h.weekday === weekday);
        return {
          weekday,
          isOpen: row ? !row.is_closed : false,
          opens: trimTime(row?.opens_at) || '09:00',
          closes: trimTime(row?.closes_at) || '18:00',
        };
      }),
    );
  }, [data]);

  function updateDay(weekday: number, patch: Partial<DayForm>) {
    setDays((current) => current.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)));
  }

  async function saveHours() {
    for (const day of days) {
      if (day.isOpen && day.closes <= day.opens) return toast.error(`${WEEKDAYS[day.weekday]}: o fechamento deve ser depois da abertura.`);
    }
    setSaving(true);
    try {
      unwrap(
        await supabase.from('business_hours').upsert(
          days.map((day) => ({
            establishment_id: establishment.id,
            weekday: day.weekday,
            is_closed: !day.isOpen,
            opens_at: day.isOpen ? day.opens : '09:00',
            closes_at: day.isOpen ? day.closes : '18:00',
          })),
          { onConflict: 'establishment_id,weekday' },
        ),
      );
      toast.success('Horário de funcionamento salvo.');
      await reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function openBlock() {
    const today = todayInZone(tz);
    setBlock({ professionalId: '', startDate: today, startTime: '09:00', endDate: today, endTime: '18:00', allDay: true, reason: '' });
  }

  async function saveBlock(event: FormEvent) {
    event.preventDefault();
    if (!block) return;
    // dia inteiro: de 00:00 do primeiro dia até 00:00 do dia seguinte ao último
    const startsAt = zonedToIso(block.startDate, block.allDay ? '00:00' : block.startTime, tz);
    const endsAt = block.allDay
      ? new Date(new Date(zonedToIso(block.endDate, '23:59', tz)).getTime() + 60_000).toISOString()
      : zonedToIso(block.endDate, block.endTime, tz);
    if (new Date(endsAt) <= new Date(startsAt)) return toast.error('O fim do bloqueio deve ser depois do início.');
    setSaving(true);
    try {
      unwrap(
        await supabase.from('blocked_times').insert({
          establishment_id: establishment.id,
          professional_id: block.professionalId || null,
          starts_at: startsAt,
          ends_at: endsAt,
          reason: block.reason.trim() || null,
        }),
      );
      toast.success('Bloqueio criado. Os horários saíram da agenda pública.');
      setBlock(null);
      await reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function deleteBlock() {
    if (!toDelete) return;
    setSaving(true);
    try {
      unwrap(await supabase.from('blocked_times').delete().eq('id', toDelete.id));
      toast.success('Bloqueio removido.');
      setToDelete(null);
      await reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorBox message={error ?? 'Erro ao carregar.'} onRetry={() => void reload()} />;

  return (
    <>
      <PageHeader title="Horários e bloqueios" description="Funcionamento do estabelecimento, folgas e períodos sem atendimento." />

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Horário de funcionamento</h2>
        <div className="space-y-2">
          {days.map((day) => (
            <div key={day.weekday} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
              <Toggle checked={day.isOpen} onChange={(isOpen) => updateDay(day.weekday, { isOpen })} label={WEEKDAYS[day.weekday]} />
              {day.isOpen ? (
                <div className="flex items-center gap-2 text-sm">
                  <input type="time" className="input w-auto" value={day.opens} onChange={(e) => updateDay(day.weekday, { opens: e.target.value })} aria-label="Abertura" />
                  <span className="text-slate-500">até</span>
                  <input type="time" className="input w-auto" value={day.closes} onChange={(e) => updateDay(day.weekday, { closes: e.target.value })} aria-label="Fechamento" />
                </div>
              ) : (
                <span className="text-sm text-slate-500">Fechado</span>
              )}
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={() => void saveHours()} loading={saving}>
            Salvar funcionamento
          </Button>
        </div>
      </Card>

      <div className="mb-3 mt-8 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">Bloqueios e folgas</h2>
        <Button variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openBlock}>
          Novo bloqueio
        </Button>
      </div>
      {data.blocks.length === 0 ? (
        <EmptyState title="Nenhum bloqueio futuro" description="Use bloqueios para feriados, férias, folgas ou qualquer período sem atendimento." />
      ) : (
        <div className="space-y-2">
          {data.blocks.map((b) => (
            <Card key={b.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0 text-sm">
                <p className="font-medium text-slate-900">
                  {b.professional_id ? data.professionals.find((p) => p.id === b.professional_id)?.name ?? 'Profissional' : 'Todo o estabelecimento'}
                </p>
                <p className="text-slate-600">
                  {formatDateTime(b.starts_at, tz)} → {formatDateTime(b.ends_at, tz)}
                </p>
                {b.reason && <p className="text-xs text-slate-500">{b.reason}</p>}
              </div>
              <Button variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" />} onClick={() => setToDelete(b)} aria-label="Remover bloqueio" />
            </Card>
          ))}
        </div>
      )}

      <Modal open={block !== null} title="Novo bloqueio" onClose={() => setBlock(null)}>
        {block && (
          <form onSubmit={saveBlock} className="space-y-4">
            <Field label="Quem fica bloqueado">
              <select className="input" value={block.professionalId} onChange={(e) => setBlock({ ...block, professionalId: e.target.value })}>
                <option value="">Todo o estabelecimento</option>
                {data.professionals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Toggle checked={block.allDay} onChange={(allDay) => setBlock({ ...block, allDay })} label="Dia(s) inteiro(s)" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="De">
                <input type="date" className="input" required value={block.startDate} onChange={(e) => setBlock({ ...block, startDate: e.target.value, endDate: block.endDate < e.target.value ? e.target.value : block.endDate })} />
              </Field>
              <Field label="Até">
                <input type="date" className="input" required min={block.startDate} value={block.endDate} onChange={(e) => setBlock({ ...block, endDate: e.target.value })} />
              </Field>
              {!block.allDay && (
                <>
                  <Field label="Hora inicial">
                    <input type="time" className="input" required value={block.startTime} onChange={(e) => setBlock({ ...block, startTime: e.target.value })} />
                  </Field>
                  <Field label="Hora final">
                    <input type="time" className="input" required value={block.endTime} onChange={(e) => setBlock({ ...block, endTime: e.target.value })} />
                  </Field>
                </>
              )}
            </div>
            <Field label="Motivo (opcional)">
              <input className="input" maxLength={200} placeholder="Feriado, férias, folga…" value={block.reason} onChange={(e) => setBlock({ ...block, reason: e.target.value })} />
            </Field>
            <p className="text-xs text-slate-500">Agendamentos já marcados neste período não são cancelados automaticamente. Confira a agenda.</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => setBlock(null)} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" loading={saving}>
                Bloquear
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmModal
        open={toDelete !== null}
        title="Remover bloqueio"
        message="Remover este bloqueio? Os horários voltam a ficar disponíveis para agendamento."
        confirmLabel="Remover"
        danger
        loading={saving}
        onConfirm={() => void deleteBlock()}
        onClose={() => setToDelete(null)}
      />
    </>
  );
}
