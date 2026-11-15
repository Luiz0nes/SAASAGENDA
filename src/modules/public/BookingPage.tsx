import { useCallback, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Clock, MapPin, MessageCircle, Phone, UserRound } from 'lucide-react';
import { SlotPicker } from '../../components/SlotPicker';
import { ErrorBox, Spinner } from '../../components/ui';
import { formatDate, formatDuration, formatMoney, formatPhone, formatTime, trimTime, WEEKDAYS, whatsappLink } from '../../lib/format';
import { errorMessage, supabase, unwrap } from '../../lib/supabase';
import { useLoad } from '../../lib/useLoad';
import type { PublicAppointment, PublicEstablishmentData, PublicProfessional, PublicService, Slot } from '../../types/database';
import {
  ACCENT_SELECTED, appointmentMessage, DEFAULT_THEME, fetchPublicEstablishment, fetchPublicSlots, PRIMARY_BUTTON, saveToken, themeStyle,
} from './publicApi';

type Step = 'service' | 'professional' | 'slot' | 'details' | 'done';

export function BookingPage() {
  const { slug = '' } = useParams();
  const { data, loading, error, reload } = useLoad(() => fetchPublicEstablishment(slug), [slug]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (error) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <ErrorBox message={error} onRetry={() => void reload()} />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Página indisponível</h1>
        <p className="mt-2 text-sm text-slate-600">Este estabelecimento não foi encontrado ou não está recebendo agendamentos no momento.</p>
        <Link to="/" className="mt-6 inline-block text-sm font-medium text-slate-900 underline">
          Voltar ao início
        </Link>
      </div>
    );
  }
  return <Booking data={data} />;
}

function Header({ data }: { data: PublicEstablishmentData }) {
  const { establishment: est } = data;
  const theme = data.theme ?? DEFAULT_THEME;
  const logo = est.logo_url ? (
    <img src={est.logo_url} alt={`Logotipo de ${est.name}`} className="h-20 w-20 rounded-2xl border-4 border-white bg-white object-cover shadow" />
  ) : null;

  if (theme.layout === 'modern') {
    return (
      <header className="relative flex min-h-[14rem] items-end bg-[var(--c-primary)] text-white">
        {est.cover_url && <img src={est.cover_url} alt="" className="absolute inset-0 h-full w-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-black/10" />
        <div className="relative mx-auto flex w-full max-w-2xl items-end gap-4 px-4 pb-6">
          {logo}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">{est.name}</h1>
            {theme.headline && <p className="mt-1 text-sm text-white/90">{theme.headline}</p>}
          </div>
        </div>
      </header>
    );
  }

  if (theme.layout === 'compact') {
    return (
      <header className="mx-auto flex max-w-2xl items-center gap-4 px-4 pt-6">
        {est.logo_url && <img src={est.logo_url} alt={`Logotipo de ${est.name}`} className="h-14 w-14 rounded-xl bg-white object-cover shadow" />}
        <div className="min-w-0">
          <h1 className="text-xl font-bold">{est.name}</h1>
          {theme.headline && <p className="text-sm opacity-80">{theme.headline}</p>}
        </div>
      </header>
    );
  }

  return (
    <header>
      {est.cover_url ? <img src={est.cover_url} alt="" className="h-40 w-full object-cover sm:h-52" /> : <div className="h-24 bg-[var(--c-primary)]" />}
      <div className="mx-auto max-w-2xl px-4">
        <div className="-mt-10 flex items-end gap-4">
          {logo}
          <div className={`min-w-0 ${logo ? 'pb-1' : 'pt-12'}`}>
            <h1 className="text-2xl font-bold">{est.name}</h1>
          </div>
        </div>
        {theme.headline && <p className="mt-2 text-sm opacity-80">{theme.headline}</p>}
      </div>
    </header>
  );
}

function Booking({ data }: { data: PublicEstablishmentData }) {
  const { establishment: est } = data;
  const theme = data.theme ?? DEFAULT_THEME;
  const tz = est.timezone;

  const [step, setStep] = useState<Step>('service');
  const [service, setService] = useState<PublicService | null>(null);
  const [professional, setProfessional] = useState<PublicProfessional | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<PublicAppointment | null>(null);

  const eligible = service ? data.professionals.filter((p) => p.service_ids.includes(service.id)) : [];
  const chooseProfessional = theme.show_professionals && eligible.length > 1;

  const loadSlots = useCallback(
    (date: string) => fetchPublicSlots(est.slug, service?.id ?? '', date, professional?.id ?? null),
    [est.slug, service?.id, professional?.id],
  );

  function pickService(next: PublicService) {
    setService(next);
    setProfessional(null);
    setSlot(null);
    const count = data.professionals.filter((p) => p.service_ids.includes(next.id)).length;
    setStep(theme.show_professionals && count > 1 ? 'professional' : 'slot');
  }

  function back() {
    setFormError(null);
    if (step === 'details') setStep('slot');
    else if (step === 'slot') setStep(chooseProfessional ? 'professional' : 'service');
    else setStep('service');
  }

  function restart() {
    setService(null);
    setProfessional(null);
    setSlot(null);
    setNotes('');
    setResult(null);
    setStep('service');
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!service || !slot) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const appointment = unwrap<PublicAppointment>(
        await supabase.rpc('create_public_appointment', {
          p_slug: est.slug,
          p_service_id: service.id,
          p_starts_at: slot.slot_start,
          p_customer_name: name,
          p_customer_phone: phone,
          // sem preferência: o servidor escolhe um profissional livre no horário
          p_professional_id: professional?.id ?? null,
          p_customer_email: email || null,
          p_notes: notes || null,
        }),
      );
      saveToken(appointment.public_token);
      setResult(appointment);
      setStep('done');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setFormError(errorMessage(err));
      // o horário pode ter sido ocupado: volta para escolher outro
      setSlot(null);
    } finally {
      setSubmitting(false);
    }
  }

  const card = 'rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-sm sm:p-5';
  const stepTitle: Record<Step, string> = {
    service: 'Escolha o serviço',
    professional: 'Escolha o profissional',
    slot: 'Escolha a data e o horário',
    details: 'Seus dados',
    done: 'Agendamento realizado',
  };

  return (
    <div style={themeStyle(theme)} className="min-h-screen bg-[var(--c-bg)] pb-16 text-[var(--c-text)]">
      <Header data={data} />

      <main className="mx-auto mt-6 max-w-2xl space-y-4 px-4">
        <section className={card} aria-live="polite">
          <div className="mb-4 flex items-center gap-2">
            {step !== 'service' && step !== 'done' && (
              <button type="button" onClick={back} className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100" aria-label="Voltar">
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            <h2 className="text-lg font-semibold">{stepTitle[step]}</h2>
          </div>

          {step !== 'service' && step !== 'done' && service && (
            <p className="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              {service.name}
              {professional ? ` · ${professional.name}` : ''}
              {slot && step === 'details' ? ` · ${formatDate(slot.slot_start, tz)} às ${formatTime(slot.slot_start, tz)}` : ''}
            </p>
          )}

          {step === 'service' &&
            (data.services.length === 0 ? (
              <p className="text-sm text-slate-600">Este estabelecimento ainda não tem serviços disponíveis para agendamento online.</p>
            ) : (
              <ul className="space-y-2">
                {data.services.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => pickService(s)}
                      className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left transition hover:border-[var(--c-primary)]"
                    >
                      {s.image_url && <img src={s.image_url} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />}
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{s.name}</span>
                        {s.description && <span className="block text-sm text-slate-500">{s.description}</span>}
                        <span className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500">
                          <Clock className="h-3.5 w-3.5" />
                          {formatDuration(s.duration_minutes)}
                        </span>
                      </span>
                      {theme.show_prices && <span className="shrink-0 text-sm font-semibold">{formatMoney(s.price_cents)}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            ))}

          {step === 'professional' && (
            <ul className="space-y-2">
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setProfessional(null);
                    setStep('slot');
                  }}
                  className="w-full rounded-xl border border-slate-200 p-3 text-left font-medium transition hover:border-[var(--c-primary)]"
                >
                  Sem preferência
                  <span className="block text-sm font-normal text-slate-500">Mostrar todos os horários disponíveis</span>
                </button>
              </li>
              {eligible.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setProfessional(p);
                      setStep('slot');
                    }}
                    className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left transition hover:border-[var(--c-primary)]"
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100">
                      {p.photo_url ? <img src={p.photo_url} alt="" className="h-full w-full object-cover" /> : <UserRound className="h-5 w-5 text-slate-400" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-medium">{p.name}</span>
                      {p.specialty && <span className="block text-sm text-slate-500">{p.specialty}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {step === 'slot' && service && (
            <>
              {formError && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}
              <SlotPicker
                timeZone={tz}
                maxDays={est.max_advance_days}
                loadSlots={loadSlots}
                value={slot}
                onChange={(next) => {
                  setSlot(next);
                  setFormError(null);
                }}
                reloadKey={`${service.id}:${professional?.id ?? ''}`}
                accentClassName={ACCENT_SELECTED}
              />
              <button type="button" disabled={!slot} onClick={() => setStep('details')} className={`mt-5 w-full ${PRIMARY_BUTTON}`}>
                Continuar
              </button>
            </>
          )}

          {step === 'details' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Nome completo</span>
                <input className="input" required minLength={2} maxLength={120} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Telefone / WhatsApp (com DDD)</span>
                <input className="input" required inputMode="tel" autoComplete="tel" placeholder="(11) 99999-9999" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">E-mail (opcional)</span>
                <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Observações (opcional)</span>
                <textarea className="input" rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
              {formError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}
              <button type="submit" disabled={submitting} className={`w-full ${PRIMARY_BUTTON}`}>
                {submitting ? 'Confirmando…' : 'Confirmar agendamento'}
              </button>
              <p className="text-center text-xs text-slate-500">Seus dados são usados apenas por {est.name} para este atendimento.</p>
            </form>
          )}

          {step === 'done' && result && (
            <div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
                <p className="text-sm text-slate-600">
                  {result.status === 'confirmed'
                    ? 'Seu horário está confirmado.'
                    : 'Seu horário está reservado e aguarda a confirmação do estabelecimento.'}
                </p>
              </div>
              <dl className="mt-4 space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Serviço</dt>
                  <dd className="text-right font-medium">{result.service.name}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Profissional</dt>
                  <dd className="text-right font-medium">{result.professional.name}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Data</dt>
                  <dd className="text-right font-medium capitalize">{formatDate(result.starts_at, tz)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Horário</dt>
                  <dd className="text-right font-medium">{formatTime(result.starts_at, tz)}</dd>
                </div>
                {theme.show_prices && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Valor</dt>
                    <dd className="text-right font-medium">{formatMoney(result.price_cents)}</dd>
                  </div>
                )}
              </dl>
              <div className="mt-4 space-y-2">
                {est.whatsapp && (
                  <a
                    href={whatsappLink(est.whatsapp, appointmentMessage(result, `Olá! Fiz um agendamento em ${est.name}.`))}
                    target="_blank"
                    rel="noreferrer"
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Enviar confirmação pelo WhatsApp
                  </a>
                )}
                <Link to={`/agendamento/${result.public_token}`} className={`w-full ${PRIMARY_BUTTON}`}>
                  Ver, cancelar ou reagendar
                </Link>
                <button type="button" onClick={restart} className="w-full rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100">
                  Fazer outro agendamento
                </button>
              </div>
              <p className="mt-3 text-center text-xs text-slate-500">Guarde o link do agendamento: é por ele que você consulta ou altera o horário.</p>
            </div>
          )}
        </section>

        <section className={card}>
          <h2 className="text-base font-semibold">Sobre</h2>
          {(theme.about_text || est.description) && <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{theme.about_text || est.description}</p>}
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {est.address && (
              <li className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <span>{[est.address, est.city, est.state].filter(Boolean).join(' · ')}</span>
              </li>
            )}
            {est.phone && (
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4 shrink-0 text-slate-400" />
                <a href={`tel:${est.phone}`} className="hover:underline">
                  {formatPhone(est.phone)}
                </a>
              </li>
            )}
          </ul>
          {est.whatsapp && (
            <a
              href={whatsappLink(est.whatsapp, `Olá! Vim pela página de agendamento de ${est.name}.`)}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
            >
              <MessageCircle className="h-4 w-4" />
              Falar pelo WhatsApp
            </a>
          )}
          {data.business_hours.length > 0 && (
            <>
              <h3 className="mt-5 text-sm font-semibold">Horário de funcionamento</h3>
              <ul className="mt-2 space-y-1 text-sm text-slate-600">
                {data.business_hours.map((h) => (
                  <li key={h.weekday} className="flex justify-between">
                    <span>{WEEKDAYS[h.weekday]}</span>
                    <span className="tabular-nums">{h.is_closed ? 'Fechado' : `${trimTime(h.opens_at)} – ${trimTime(h.closes_at)}`}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <p className="text-center text-sm">
          <Link to="/meus-agendamentos" className="underline opacity-80 hover:opacity-100">
            Já agendou? Consulte seus agendamentos
          </Link>
        </p>
      </main>
    </div>
  );
}
