import { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing, Share, SquarePlus } from 'lucide-react';
import { Badge, Button, Card } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { disablePush, enablePush, getPushStatus, isIos, sendTestPush, type PushStatus } from '../../lib/push';
import { useEstablishment } from './EstablishmentContext';

/** Cartão para ativar os avisos de novos agendamentos neste aparelho. */
export function PushNotificationsCard({ compact = false }: { compact?: boolean }) {
  const { establishment, can } = useEstablishment();
  const toast = useToast();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let alive = true;
    void getPushStatus().then((s) => alive && setStatus(s));
    return () => {
      alive = false;
    };
  }, []);

  if (status === null) return null;
  // no Início, some quando já está ativo (continua em Configurações)
  if (compact && status === 'on' && can('manage_settings')) return null;

  async function run(task: () => Promise<void>) {
    setWorking(true);
    try {
      await task();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível concluir.');
    } finally {
      setWorking(false);
      setStatus(await getPushStatus());
    }
  }

  const enable = () =>
    run(async () => {
      await enablePush(establishment.id);
      toast.success('Notificações ativadas neste aparelho.');
    });
  const disable = () =>
    run(async () => {
      await disablePush();
      toast.success('Notificações desativadas neste aparelho.');
    });
  const test = () =>
    run(async () => {
      const result = await sendTestPush();
      if (result.sent > 0) toast.success('Teste enviado. Deve chegar em alguns segundos.');
      else toast.error('Nenhum aparelho recebeu o teste. Desative e ative de novo.');
    });

  return (
    <Card className={compact ? 'mb-6 p-4' : 'mt-6 p-4'}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700">
            {status === 'on' ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900">Avisos de novos agendamentos no celular</h2>
              {status === 'on' && <Badge tone="green">Ativo neste aparelho</Badge>}
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Quando um cliente agendar pela sua página, chega uma notificação com nome, serviço, dia e horário — mesmo com o painel fechado.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {status === 'off' && (
            <Button size="sm" icon={<Bell className="h-4 w-4" />} loading={working} onClick={() => void enable()}>
              Ativar notificações
            </Button>
          )}
          {status === 'on' && (
            <>
              <Button size="sm" variant="secondary" icon={<BellRing className="h-4 w-4" />} loading={working} onClick={() => void test()}>
                Enviar teste
              </Button>
              <Button size="sm" variant="ghost" icon={<BellOff className="h-4 w-4" />} disabled={working} onClick={() => void disable()}>
                Desativar
              </Button>
            </>
          )}
        </div>
      </div>

      {status === 'ios-needs-install' && (
        <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
          <p className="font-medium text-slate-900">No iPhone, faça isto uma vez:</p>
          <ol className="mt-2 space-y-1.5">
            <li>
              1. Abra este painel no <strong>Safari</strong> e toque em <Share className="inline h-4 w-4 align-[-2px]" /> <strong>Compartilhar</strong>.
            </li>
            <li>
              2. Escolha <SquarePlus className="inline h-4 w-4 align-[-2px]" /> <strong>Adicionar à Tela de Início</strong> e confirme.
            </li>
            <li>3. Abra o app <strong>Agenda</strong> pelo ícone novo, entre com seu e-mail e senha.</li>
            <li>
              4. Volte aqui e toque em <strong>Ativar notificações</strong>.
            </li>
          </ol>
          <p className="mt-2 text-xs text-slate-500">Precisa do iOS 16.4 ou mais novo.</p>
        </div>
      )}
      {status === 'denied' && (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          As notificações foram bloqueadas neste aparelho.{' '}
          {isIos()
            ? 'Libere em Ajustes › Notificações › Agenda e depois recarregue o app.'
            : 'Libere nas permissões do site (ícone ao lado do endereço) e recarregue a página.'}
        </p>
      )}
      {status === 'unsupported' && (
        <p className="mt-3 text-sm text-slate-500">Este navegador não aceita notificações. Use Chrome, Edge, Firefox ou o Safari (no iPhone, pela Tela de Início).</p>
      )}
    </Card>
  );
}
