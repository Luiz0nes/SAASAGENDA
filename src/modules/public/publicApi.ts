// Acesso da página pública: somente funções RPC, nunca tabelas.
import { formatDate, formatTime } from '../../lib/format';
import { supabase, unwrap } from '../../lib/supabase';
import type { PublicAppointment, PublicEstablishmentData, Slot } from '../../types/database';

export async function fetchPublicEstablishment(slug: string): Promise<PublicEstablishmentData | null> {
  return unwrap<PublicEstablishmentData | null>(await supabase.rpc('get_public_establishment', { p_slug: slug }));
}

export async function fetchPublicSlots(slug: string, serviceId: string, date: string, professionalId: string | null): Promise<Slot[]> {
  return unwrap<Slot[]>(
    await supabase.rpc('get_available_slots', {
      p_slug: slug,
      p_service_id: serviceId,
      p_date: date,
      p_professional_id: professionalId,
    }),
  );
}

export async function fetchAdminSlots(establishmentId: string, serviceId: string, date: string, professionalId: string | null): Promise<Slot[]> {
  return unwrap<Slot[]>(
    await supabase.rpc('get_available_slots_admin', {
      p_establishment_id: establishmentId,
      p_service_id: serviceId,
      p_date: date,
      p_professional_id: professionalId,
    }),
  );
}

export async function fetchPublicAppointment(token: string): Promise<PublicAppointment | null> {
  return unwrap<PublicAppointment | null>(await supabase.rpc('get_public_appointment', { p_token: token }));
}

// ---- códigos dos agendamentos feitos neste aparelho ----
const TOKENS_KEY = 'agenda.tokens';

export function readSavedTokens(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(TOKENS_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

export function saveToken(token: string): void {
  try {
    const tokens = [token, ...readSavedTokens().filter((t) => t !== token)].slice(0, 30);
    window.localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
  } catch {
    // sem armazenamento local: o cliente ainda pode usar o link do agendamento
  }
}

export function manageUrl(token: string): string {
  return `${window.location.origin}/agendamento/${token}`;
}

/** Texto pronto para o cliente enviar ao estabelecimento pelo WhatsApp. */
export function appointmentMessage(appointment: PublicAppointment, intro: string): string {
  const tz = appointment.establishment.timezone;
  return [
    intro,
    '',
    `Nome: ${appointment.customer_name}`,
    `Serviço: ${appointment.service.name}`,
    `Profissional: ${appointment.professional.name}`,
    `Data: ${formatDate(appointment.starts_at, tz)} às ${formatTime(appointment.starts_at, tz)}`,
    `Detalhes: ${manageUrl(appointment.public_token)}`,
  ].join('\n');
}
