// Formatação e datas. Todos os horários são exibidos no fuso do
// estabelecimento, independentemente do fuso do aparelho de quem acessa.
import type { AppointmentStatus, EstablishmentStatus, MemberRole } from '../types/database';

export const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  pending: 'Pendente',
  confirmed: 'Confirmado',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  no_show: 'Não compareceu',
};

export const ESTABLISHMENT_STATUS_LABEL: Record<EstablishmentStatus, string> = {
  active: 'Ativo',
  suspended: 'Suspenso',
  inactive: 'Desativado',
};

export const ROLE_LABEL: Record<MemberRole, string> = {
  owner: 'Proprietário',
  admin: 'Administrador',
  receptionist: 'Recepcionista',
  professional: 'Profissional',
};

export function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** "45,90" | "45.90" | "45" -> 4590 (ou null se inválido) */
export function parseMoney(text: string): number | null {
  const normalized = text.trim().replace(/\./g, '').replace(',', '.');
  if (normalized === '') return 0;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

/** Está em promoção quando o preço original é maior que o atual. */
export function isPromotion(service: { price_cents: number; compare_price_cents?: number | null }): boolean {
  return service.compare_price_cents != null && service.compare_price_cents > service.price_cents;
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

export function onlyDigits(text: string): string {
  return text.replace(/\D/g, '');
}

export function formatPhone(phone: string | null | undefined): string {
  const d = onlyDigits(phone ?? '');
  const local = d.length > 11 && d.startsWith('55') ? d.slice(2) : d;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return phone ?? '';
}

/** Link "clique para conversar" do WhatsApp. Não envia nada automaticamente. */
export function whatsappLink(phone: string, text?: string): string {
  let digits = onlyDigits(phone);
  if (digits.length <= 11) digits = `55${digits}`;
  const query = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${digits}${query}`;
}

/** "@gh.barber", "instagram.com/gh.barber/" ou link completo -> "gh.barber" */
export function instagramHandle(text: string | null | undefined): string {
  let value = (text ?? '').trim();
  const fromUrl = /instagram\.com\/([^/?#\s]+)/i.exec(value);
  if (fromUrl) value = fromUrl[1];
  return value.replace(/^@+/, '').replace(/\/+$/, '');
}

export function isValidInstagram(handle: string): boolean {
  return /^[A-Za-z0-9._]{1,30}$/.test(handle);
}

export function instagramLink(handle: string): string {
  return `https://instagram.com/${encodeURIComponent(handle)}`;
}

export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------
// Datas com fuso horário
// ---------------------------------------------------------------------

export function formatTime(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { timeZone, hour: '2-digit', minute: '2-digit' });
}

export function formatDate(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    timeZone,
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });
}

export function formatDateShort(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(iso: string, timeZone: string): string {
  return `${formatDateShort(iso, timeZone)} às ${formatTime(iso, timeZone)}`;
}

/** Data (YYYY-MM-DD) de um instante no fuso informado. */
export function dateInZone(date: Date, timeZone: string): string {
  // en-CA formata como YYYY-MM-DD
  return date.toLocaleDateString('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
}

export function todayInZone(timeZone: string): string {
  return dateInZone(new Date(), timeZone);
}

/** Soma dias a uma data YYYY-MM-DD (aritmética de calendário, sem fuso). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Dia da semana (0 = domingo) de uma data YYYY-MM-DD. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** "2026-11-18" -> "18/11" */
export function formatDayMonth(date: string): string {
  const [, m, d] = date.split('-');
  return `${d}/${m}`;
}

/** "2026-11-18" -> "quarta-feira, 18 de novembro" */
export function formatDateLong(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('pt-BR', {
    timeZone: 'UTC',
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });
}

function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Converte data + hora "de parede" no fuso do estabelecimento para ISO (UTC). */
export function zonedToIso(date: string, time: string, timeZone: string): string {
  const wall = new Date(`${date}T${time.slice(0, 5)}:00Z`).getTime();
  let instant = wall - zoneOffsetMs(new Date(wall), timeZone);
  // segunda passada cobre as viradas de horário de verão
  instant = wall - zoneOffsetMs(new Date(instant), timeZone);
  return new Date(instant).toISOString();
}

/** "09:00:00" -> "09:00" */
export function trimTime(time: string | null | undefined): string {
  return (time ?? '').slice(0, 5);
}

/** Cor de texto (clara ou escura) com melhor contraste sobre a cor informada. */
export function contrastColor(hex: string): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return '#ffffff';
  const value = parseInt(match[1], 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return luminance > 0.45 ? '#0f172a' : '#ffffff';
}
