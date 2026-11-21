// Agenda em tempo real: escuta as mudanças de agendamentos do
// estabelecimento (Supabase Realtime) e avisa as telas do painel.
// A RLS vale aqui também: cada usuário só recebe o que pode ver.
import { useEffect } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { useToast } from '../../components/Toast';
import { formatDateShort, formatTime } from '../../lib/format';
import { supabase } from '../../lib/supabase';

/** Evento disparado na janela sempre que um agendamento muda. */
export const AGENDA_CHANGED = 'agenda:changed';

export interface AgendaChangedDetail {
  /** id do agendamento recém-criado pela página pública, se for o caso */
  newAppointmentId?: string;
}

type Row = {
  id?: string;
  starts_at?: string;
  source?: string;
  status?: string;
  cancellation_reason?: string | null;
  cancelled_at?: string | null;
};

/** "Plim" curto, gerado no navegador (sem arquivo de áudio). */
function playChime() {
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const notes = [880, 1318.5];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + i * 0.16;
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    });
    window.setTimeout(() => void ctx.close(), 1200);
  } catch {
    // sem áudio (navegador bloqueou ou não suporta): só a notificação visual
  }
}

/** Marca a aba do navegador quando chega agendamento com o painel em segundo plano. */
function flagTab() {
  if (!document.hidden || document.title.startsWith('🔔')) return;
  const original = document.title;
  document.title = `🔔 Novo agendamento · ${original}`;
  const restore = () => {
    if (document.hidden) return;
    document.title = original;
    document.removeEventListener('visibilitychange', restore);
  };
  document.addEventListener('visibilitychange', restore);
}

/** Liga a escuta em tempo real enquanto o painel do estabelecimento está aberto. */
export function useAgendaRealtime(establishmentId: string, timeZone: string) {
  const toast = useToast();

  useEffect(() => {
    const channel = supabase
      .channel(`agenda-${establishmentId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments', filter: `establishment_id=eq.${establishmentId}` },
        (payload: RealtimePostgresChangesPayload<Row>) => {
          const row = (payload.new ?? {}) as Row;
          const detail: AgendaChangedDetail = {};

          if (payload.eventType === 'INSERT' && row.source === 'public' && row.starts_at) {
            detail.newAppointmentId = row.id;
            toast.success(`Novo agendamento online: ${formatDateShort(row.starts_at, timeZone)} às ${formatTime(row.starts_at, timeZone)}`);
            playChime();
            flagTab();
          }

          if (
            payload.eventType === 'UPDATE' &&
            row.status === 'cancelled' &&
            row.cancellation_reason === 'Cancelado pelo cliente' &&
            row.cancelled_at &&
            Date.now() - new Date(row.cancelled_at).getTime() < 60_000 &&
            row.starts_at
          ) {
            toast.error(`Cliente cancelou o horário de ${formatDateShort(row.starts_at, timeZone)} às ${formatTime(row.starts_at, timeZone)}`);
          }

          window.dispatchEvent(new CustomEvent<AgendaChangedDetail>(AGENDA_CHANGED, { detail }));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [establishmentId, timeZone, toast]);
}

/**
 * Atualiza a tela quando a agenda muda: pelo tempo real, ao voltar para a
 * aba e, por segurança, a cada minuto (caso a conexão em tempo real caia).
 */
export function useAgendaRefresh(onRefresh: (detail: AgendaChangedDetail) => void) {
  useEffect(() => {
    let timer = 0;
    let pending: AgendaChangedDetail = {};
    const schedule = (detail: AgendaChangedDetail = {}) => {
      pending = { newAppointmentId: detail.newAppointmentId ?? pending.newAppointmentId };
      window.clearTimeout(timer);
      // agrupa várias mudanças seguidas em uma atualização só
      timer = window.setTimeout(() => {
        onRefresh(pending);
        pending = {};
      }, 300);
    };
    const onChange = (event: Event) => schedule((event as CustomEvent<AgendaChangedDetail>).detail ?? {});
    const onVisible = () => {
      if (!document.hidden) schedule();
    };
    const interval = window.setInterval(() => {
      if (!document.hidden) schedule();
    }, 60_000);

    window.addEventListener(AGENDA_CHANGED, onChange);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
      window.removeEventListener(AGENDA_CHANGED, onChange);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [onRefresh]);
}
