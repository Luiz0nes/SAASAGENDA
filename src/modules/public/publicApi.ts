// Acesso da página pública: somente funções RPC, nunca tabelas.
import type { CSSProperties } from 'react';
import { contrastColor, formatDate, formatTime } from '../../lib/format';
import { supabase, unwrap } from '../../lib/supabase';
import type { PublicAppointment, PublicEstablishmentData, Slot, Theme } from '../../types/database';

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

export const DEFAULT_THEME: Theme = {
  primary_color: '#0f172a',
  secondary_color: '#2563eb',
  background_color: '#f8fafc',
  text_color: '#0f172a',
  layout: 'classic',
  headline: null,
  about_text: null,
  show_prices: true,
  show_professionals: true,
};

/** Variáveis CSS do tema: cada estabelecimento pinta a própria página. */
export function themeStyle(theme: Theme): CSSProperties {
  return {
    '--c-primary': theme.primary_color,
    '--c-on-primary': contrastColor(theme.primary_color),
    '--c-secondary': theme.secondary_color,
    '--c-on-secondary': contrastColor(theme.secondary_color),
    '--c-bg': theme.background_color,
    '--c-text': theme.text_color,
  } as CSSProperties;
}

export const PRIMARY_BUTTON =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--c-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--c-on-primary)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60';

export const ACCENT_SELECTED = 'border-[var(--c-primary)] bg-[var(--c-primary)] text-[var(--c-on-primary)]';

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
