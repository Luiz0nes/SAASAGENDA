-- =====================================================================
-- 0012 · LIMPAR CONCLUÍDOS DA AGENDA (ARQUIVAR)
-- Agendamentos nunca são apagados (histórico, faturamento, auditoria).
-- "Limpar concluídos" só preenche archived_at: o agendamento sai da agenda
-- do painel, mas continua nos indicadores e pode ser restaurado.
-- A RLS de UPDATE já existente define quem pode arquivar (equipe com
-- manage_appointments; profissional, só os próprios).
-- =====================================================================

alter table public.appointments
  add column if not exists archived_at timestamptz;

-- só concluídos podem ser arquivados
alter table public.appointments
  drop constraint if exists appointments_archive_only_completed;
alter table public.appointments
  add constraint appointments_archive_only_completed
  check (archived_at is null or status = 'completed');

create index if not exists appointments_active_agenda_idx
  on public.appointments (establishment_id, starts_at)
  where archived_at is null;
