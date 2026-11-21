// Vitrine de planos mensais na página pública. "Quero assinar" abre uma
// conversa no WhatsApp do estabelecimento: não há cobrança pela plataforma.
import { MessageCircle } from 'lucide-react';
import { formatAmount, formatMoney, whatsappLink } from '../../lib/format';
import type { PublicCustomerPlan, PublicEstablishmentData } from '../../types/database';

function interestMessage(plan: PublicCustomerPlan, establishmentName: string): string {
  const options = plan.options.map((o) => `${o.label} (${formatMoney(o.price_cents)}/mês)`).join(' ou ');
  return `Olá! Vi na página de agendamento de ${establishmentName} e tenho interesse no plano ${plan.name}: ${options}. Pode me passar mais informações?`;
}

/** "Frequência: texto" -> título em negrito + texto */
function NoteLine({ line }: { line: string }) {
  const match = /^([^:]{2,40}):\s*(.+)$/.exec(line);
  if (!match) return <p className="pub-muted text-sm leading-relaxed">{line}</p>;
  return (
    <div>
      <p className="pub-primary-text text-xs font-bold uppercase tracking-wider">{match[1]}</p>
      <p className="pub-muted mt-1 text-sm leading-relaxed">{match[2].charAt(0).toUpperCase() + match[2].slice(1)}</p>
    </div>
  );
}

export function PlansSection({ data }: { data: PublicEstablishmentData }) {
  const plans = data.customer_plans ?? [];
  const est = data.establishment;
  if (plans.length === 0) return null;
  const noteLines = (est.plans_note ?? '').split('\n').map((l) => l.trim()).filter(Boolean);

  return (
    <section aria-labelledby="planos-titulo">
      <div className="mb-4">
        <h2 id="planos-titulo" className="pub-heading text-2xl sm:text-3xl">
          Nossos planos
        </h2>
        <p className="pub-muted mt-1 text-sm">Escolha o ideal para você</p>
      </div>

      <div className="space-y-4">
        {plans.map((plan) => (
          <article
            key={plan.id}
            className="pub-card relative p-5 sm:p-6"
            style={plan.highlight ? { borderColor: 'var(--c-primary)', borderWidth: 2 } : undefined}
          >
            {plan.highlight && (
              <span
                className="absolute -top-3 left-5 px-3 py-1 text-[11px] font-bold uppercase tracking-wide"
                style={{ borderRadius: '999px', backgroundColor: 'var(--c-primary)', color: 'var(--c-on-primary)' }}
              >
                Mais escolhido
              </span>
            )}
            <div className="sm:flex sm:gap-6">
              <div className="shrink-0 sm:w-40">
                <p className="pub-muted text-[11px] font-semibold uppercase tracking-[0.25em]">Plano</p>
                <h3 className="pub-heading mt-1 text-3xl">{plan.name}</h3>
                {plan.tagline && <p className="pub-muted mt-2 text-xs uppercase tracking-wider">{plan.tagline}</p>}
              </div>

              <div className="pub-line mt-4 flex-1 border-t pt-4 sm:mt-0 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
                <div className={`grid gap-4 ${plan.options.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {plan.options.map((option) => (
                    <div key={option.label}>
                      <p className="pub-muted text-[11px] font-semibold uppercase tracking-wider">{option.label}</p>
                      <p className="mt-1 flex items-baseline gap-1">
                        <span className="pub-primary-text text-sm font-bold">R$</span>
                        <span className="pub-heading pub-primary-text text-4xl">{formatAmount(option.price_cents)}</span>
                        <span className="pub-muted text-xs">/mês</span>
                      </p>
                      {option.note && <p className="pub-muted mt-1 text-xs">{option.note}</p>}
                    </div>
                  ))}
                </div>
                {plan.benefits && (
                  <p className="pub-soft mt-4 px-3 py-2.5 text-sm" style={{ borderRadius: 'var(--r-inner)' }}>
                    {plan.benefits}
                  </p>
                )}
                {est.whatsapp && (
                  <a
                    href={whatsappLink(est.whatsapp, interestMessage(plan, est.name))}
                    target="_blank"
                    rel="noreferrer"
                    className="pub-btn mt-4 w-full sm:w-auto"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Quero assinar o {plan.name}
                  </a>
                )}
              </div>
            </div>
          </article>
        ))}

        {noteLines.length > 0 && (
          <div className="pub-card grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
            {noteLines.map((line) => (
              <NoteLine key={line} line={line} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
