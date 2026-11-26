// Notificações no celular (Web Push) para a equipe do estabelecimento.
// iPhone/iPad: só funciona no iOS 16.4+ com o painel adicionado à Tela de
// Início pelo Safari e aberto pelo ícone.
import { invokeFunction, supabase } from './supabase';

/** Chave pública VAPID (a privada fica só no Supabase Vault). */
export const VAPID_PUBLIC_KEY = 'BKgs9AGYNH6VSTBtGU5mrdozZvFhrqThnVLGXWvqbqkGgi_FGyx0Ua6Toa4yykpaeTmuCZFYoEEovYtEly9GXuA';

export type PushStatus =
  | 'unsupported' // navegador sem suporte
  | 'ios-needs-install' // iPhone no Safari: precisa adicionar à Tela de Início
  | 'denied' // usuário bloqueou
  | 'off' // pode ativar
  | 'on'; // ativo neste aparelho

export function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function supported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function toBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

let registration: Promise<ServiceWorkerRegistration> | null = null;

/** Registra o service worker (uma vez por página). */
export function registerServiceWorker(): Promise<ServiceWorkerRegistration> | null {
  if (!('serviceWorker' in navigator)) return null;
  registration ??= navigator.serviceWorker.register('/sw.js', { scope: '/' });
  return registration;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = registerServiceWorker();
  if (!reg) return null;
  return (await reg).pushManager.getSubscription();
}

export async function getPushStatus(): Promise<PushStatus> {
  if (isIos() && !isStandalone()) return 'ios-needs-install';
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const sub = await currentSubscription();
    return sub && Notification.permission === 'granted' ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

/** Pede permissão e inscreve este aparelho. Chamar dentro de um clique. */
export async function enablePush(establishmentId: string): Promise<void> {
  if (!supported()) throw new Error('Este navegador não aceita notificações.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Permissão de notificação não concedida.');

  const reg = await registerServiceWorker()!;
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    });
  }
  const { error } = await supabase.rpc('register_push_subscription', {
    p_establishment_id: establishmentId,
    p_endpoint: sub.endpoint,
    p_p256dh: toBase64Url(sub.getKey('p256dh')),
    p_auth: toBase64Url(sub.getKey('auth')),
    p_user_agent: navigator.userAgent.slice(0, 300),
  });
  if (error) throw new Error('Não foi possível salvar o aparelho. Tente novamente.');
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await supabase.rpc('unregister_push_subscription', { p_endpoint: sub.endpoint });
  await sub.unsubscribe().catch(() => undefined);
}

export async function sendTestPush(): Promise<{ sent: number }> {
  return invokeFunction<{ sent: number }>('push-notify', { action: 'test' });
}

/**
 * Coloca o manifesto e as tags do iPhone só nas páginas do painel, para que
 * "Adicionar à Tela de Início" crie o app do painel sem afetar a página
 * pública dos clientes. Devolve a função que remove as tags.
 */
export function installPanelManifest(): () => void {
  const tags: HTMLElement[] = [];
  const add = (tag: 'link' | 'meta', attrs: Record<string, string>) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    el.dataset.panelPwa = '1';
    document.head.appendChild(el);
    tags.push(el);
  };
  if (!document.querySelector('[data-panel-pwa]')) {
    add('link', { rel: 'manifest', href: '/manifest.webmanifest' });
    add('link', { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' });
    add('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
    add('meta', { name: 'mobile-web-app-capable', content: 'yes' });
    add('meta', { name: 'apple-mobile-web-app-title', content: 'Agenda' });
    add('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'default' });
  }
  return () => tags.forEach((el) => el.remove());
}
