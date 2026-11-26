// POST /functions/v1/push-notify
//
// Envia notificações Web Push (celular/computador, com o painel fechado).
//
// 1) Chamada pelo gatilho do banco (header x-notify-secret) quando um
//    cliente agenda pela página pública: avisa a equipe que pode ver o
//    agendamento (dono, administradores, quem gerencia a agenda e o
//    profissional do horário) com nome, serviço, dia e horário.
// 2) Chamada pelo painel com o token do usuário ({ "action": "test" }):
//    manda uma notificação de teste para os aparelhos dele.
//
// verify_jwt = false: o gatilho não tem token; cada caminho se autentica.
// Chaves VAPID e a senha do gatilho ficam no Supabase Vault (push_config).
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

interface PushConfig {
  vapid_public_key: string;
  vapid_private_key: string;
  vapid_subject: string;
  push_notify_secret: string;
}

let configPromise: Promise<PushConfig> | null = null;

function loadConfig(): Promise<PushConfig> {
  configPromise ??= (async () => {
    const { data, error } = await admin.rpc('push_config');
    if (error) throw new Error(`push_config: ${error.message}`);
    const cfg = data as PushConfig;
    if (!cfg?.vapid_public_key || !cfg?.vapid_private_key || !cfg?.push_notify_secret) {
      throw new Error('Segredos de notificação ausentes no Vault.');
    }
    webpush.setVapidDetails(cfg.vapid_subject || 'mailto:suporte@example.com', cfg.vapid_public_key, cfg.vapid_private_key);
    return cfg;
  })().catch((err) => {
    configPromise = null;
    throw err;
  });
  return configPromise;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

interface Subscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface Payload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

async function sendAll(subs: Subscription[], payload: Payload) {
  const result = { sent: 0, removed: 0, failed: 0 };
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
          { TTL: 6 * 3600, urgency: 'high' },
        );
        result.sent++;
        await admin.from('push_subscriptions').update({ last_used_at: new Date().toISOString() }).eq('id', sub.id);
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // aparelho desinstalou o app ou desativou: remove a inscrição
          await admin.from('push_subscriptions').delete().eq('id', sub.id);
          result.removed++;
        } else {
          result.failed++;
          console.error('push falhou', status, (err as Error).message);
        }
      }
    }),
  );
  return result;
}

function formatWhen(iso: string, timeZone: string) {
  const date = new Date(iso);
  const weekday = date.toLocaleDateString('pt-BR', { timeZone, weekday: 'short' }).replace('.', '');
  const day = date.toLocaleDateString('pt-BR', { timeZone, day: '2-digit', month: '2-digit' });
  const time = date.toLocaleTimeString('pt-BR', { timeZone, hour: '2-digit', minute: '2-digit' });
  const isoDay = date.toLocaleDateString('en-CA', { timeZone });
  return { text: `${weekday} ${day} às ${time}`, isoDay };
}

type Related<T> = T | T[] | null;
function one<T>(value: Related<T>): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

async function notifyAppointment(appointmentId: string) {
  const { data: appt, error } = await admin
    .from('appointments')
    .select(
      'id, starts_at, establishment_id, professional_id, customer:customers(name), service:services(name), professional:professionals(name), establishment:establishments(name, timezone)',
    )
    .eq('id', appointmentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!appt) return { sent: 0, removed: 0, failed: 0, reason: 'agendamento não encontrado' };

  const est = one(appt.establishment as Related<{ name: string; timezone: string }>);
  const customer = one(appt.customer as Related<{ name: string }>);
  const service = one(appt.service as Related<{ name: string }>);
  const professional = one(appt.professional as Related<{ name: string }>);

  // quem pode ver este agendamento recebe o aviso
  const { data: members } = await admin
    .from('establishment_users')
    .select('user_id, role, permissions, professional_id')
    .eq('establishment_id', appt.establishment_id)
    .eq('is_active', true);
  const userIds = (members ?? [])
    .filter(
      (m) =>
        m.role === 'owner' ||
        m.role === 'admin' ||
        (m.permissions as Record<string, unknown> | null)?.manage_appointments === true ||
        (m.professional_id && m.professional_id === appt.professional_id),
    )
    .map((m) => m.user_id as string);
  if (userIds.length === 0) return { sent: 0, removed: 0, failed: 0, reason: 'ninguém para avisar' };

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('establishment_id', appt.establishment_id)
    .in('user_id', userIds);
  if (!subs || subs.length === 0) return { sent: 0, removed: 0, failed: 0, reason: 'nenhum aparelho inscrito' };

  const when = formatWhen(appt.starts_at as string, est?.timezone ?? 'America/Sao_Paulo');
  const payload: Payload = {
    title: `Novo agendamento · ${est?.name ?? 'Agenda'}`,
    body: `${customer?.name ?? 'Cliente'} · ${service?.name ?? 'Serviço'}\n${when.text}${professional?.name ? ` com ${professional.name}` : ''}`,
    url: `/painel/agenda?data=${when.isoDay}`,
    tag: `agendamento-${appt.id}`,
  };
  return sendAll(subs as Subscription[], payload);
}

async function sendTest(req: Request) {
  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ error: 'Não autenticado.' }, 401);
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) return json({ error: 'Sessão inválida ou expirada.' }, 401);

  const { data: subs } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', data.user.id);
  if (!subs || subs.length === 0) return json({ error: 'Nenhum aparelho com notificações ativas na sua conta.' }, 404);

  const result = await sendAll(subs as Subscription[], {
    title: 'Notificações ativadas ✅',
    body: 'É assim que vão chegar os avisos de novos agendamentos.',
    url: '/painel/agenda',
    tag: 'teste',
  });
  return json(result);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const cfg = await loadConfig();
    const secret = req.headers.get('x-notify-secret');

    if (secret !== null) {
      if (!safeEqual(secret, cfg.push_notify_secret)) return json({ error: 'Não autorizado.' }, 401);
      const body = (await req.json().catch(() => ({}))) as { appointment_id?: string };
      if (!body.appointment_id) return json({ error: 'appointment_id ausente.' }, 400);
      return json(await notifyAppointment(body.appointment_id));
    }

    const body = (await req.json().catch(() => ({}))) as { action?: string };
    if (body.action === 'test') return await sendTest(req);
    return json({ error: 'Ação inválida.' }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: 'Erro interno.' }, 500);
  }
});
