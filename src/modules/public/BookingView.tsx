// Página pública do estabelecimento, pintada pelo tema dele.
// Usada na página real (/agendar/:slug) e na pré-visualização do painel.
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Clock, MapPin, MessageCircle, Moon, Phone, Sun, UserRound } from 'lucide-react';
import { SlotPicker } from '../../components/SlotPicker';
import {
  formatDate, formatDuration, formatMoney, formatPhone, formatTime, todayInZone, trimTime, weekdayOf, WEEKDAYS, whatsappLink,
} from '../../lib/format';
import { errorMessage, supabase, unwrap } from '../../lib/supabase';
import { initialMode, loadFonts, normalizeTheme, storeMode, themeVars, type ResolvedMode } from '../../lib/theme';
import type { PublicAppointment, PublicEstablishmentData, PublicProfessional, PublicService, Slot, Theme } from '../../types/database';
import { appointmentMessage, saveToken } from './publicApi';

type Step = 'service' | 'professional' | 'slot' | 'details' | 'done';

export interface BookingViewProps {
  data: PublicEstablishmentData;
  loadSlots: (serviceId: string, date: string, professionalId: string | null) => Promise<Slot[]>;
  /** pré-visualização do painel: nada é gravado */
  preview?: boolean;
  /** modo imposto pelo editor de tema (pré-visualização) */
  forcedMode?: ResolvedMode;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
}

function Logo({ data, size }: { data: PublicEstablishmentData; size: 'md' | 'lg' }) {
  const est = data.establishment;
  const box = size === 'lg' ? 'h-24 w-24 text-3xl' : 'h-16 w-16 text-xl';
  const style = { borderRadius: 'var(--r-card)' };
  if (est.logo_url) {
    return <img src={est.logo_url} alt={`Logotipo de ${est.name}`} className={`${box} shrink-0 object-cover shadow-lg`} style={{ ...style, backgroundColor: 'var(--c-surface)' }} />;
  }
  return (
    <div
      aria-hidden
      className={`${box} pub-heading flex shrink-0 items-center justify-center shadow-lg`}
      style={{ ...style, backgroundColor: 'var(--c-accent)', color: 'var(--c-on-accent)' }}
    >
      {initials(est.name)}
    </div>
  );
}

// ---------------------------------------------------------------------
// Cabeçalhos (hero). As classes hero-* só animam quando o tema pede
// (atributo data-hero em .pub — ver src/index.css).
// ---------------------------------------------------------------------

/** Capa com zoom lento; no modo dinâmico também se move com a rolagem. */
function Cover({ src, parallax }: { src: string; parallax: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !parallax || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const y = Math.min(window.scrollY, 900);
        el.style.transform = `translate3d(0, ${y * 0.35}px, 0)`;
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      el.style.transform = '';
    };
  }, [parallax]);

  return (
    <div ref={ref} className="hero-parallax absolute inset-0">
      <img src={src} alt="" className="hero-cover h-full w-full object-cover" />
    </div>
  );
}

/** Fundo da faixa do topo: capa ou degradê (que "respira" quando animado). */
function Band({ cover, parallax, className, children }: { cover: string | null; parallax: boolean; className: string; children?: ReactNode }) {
  return (
    <div className={`relative overflow-hidden ${cover ? '' : 'hero-gradient'} ${className}`} style={{ backgroundColor: 'var(--c-primary)', backgroundImage: 'var(--header-bg)' }}>
      {cover && <Cover src={cover} parallax={parallax} />}
      {children}
      <div className="hero-shine" aria-hidden />
      <div className="hero-stripes absolute inset-x-0 bottom-0" aria-hidden />
    </div>
  );
}

function Header({ data, theme }: { data: PublicEstablishmentData; theme: Theme }) {
  const est = data.establishment;
  const cover = est.cover_url;
  const parallax = theme.hero_animation === 'dynamic';

  if (theme.layout === 'modern') {
    return (
      <header style={{ color: cover ? '#ffffff' : 'var(--c-on-primary)' }}>
        <Band cover={cover} parallax={parallax} className="">
          {cover && <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/15" />}
          <div className="relative mx-auto max-w-5xl px-5 pb-12 pt-20 sm:pb-16 sm:pt-28">
            <div className="flex items-center gap-4 sm:gap-6">
              <div className="hero-logo">
                <Logo data={data} size="md" />
              </div>
              <h1 className="hero-title pub-heading text-4xl sm:text-6xl">{est.name}</h1>
            </div>
            <div className="hero-line mt-5 h-1 w-16 rounded-full" style={{ backgroundColor: 'var(--c-accent)' }} />
            {theme.headline && <p className="hero-in hero-d2 mt-4 max-w-2xl text-base opacity-90 sm:text-lg">{theme.headline}</p>}
          </div>
        </Band>
      </header>
    );
  }

  if (theme.layout === 'centered') {
    return (
      <header className="text-center">
        <Band cover={cover} parallax={parallax} className="h-36 sm:h-52" />
        <div className="relative z-10 mx-auto -mt-12 flex max-w-2xl flex-col items-center px-5">
          <div className="hero-logo rounded-[calc(var(--r-card)+6px)] p-1.5" style={{ backgroundColor: 'var(--c-bg)' }}>
            <Logo data={data} size="lg" />
          </div>
          <h1 className="hero-title pub-heading mt-4 text-3xl sm:text-5xl">{est.name}</h1>
          {theme.headline && <p className="hero-in hero-d2 pub-muted mt-3 max-w-xl text-base">{theme.headline}</p>}
          <div className="hero-line hero-line-center mt-4 h-1 w-12 rounded-full" style={{ backgroundColor: 'var(--c-accent)' }} />
        </div>
      </header>
    );
  }

  if (theme.layout === 'compact') {
    return (
      <header className="mx-auto max-w-5xl px-5 pt-16 sm:pt-14">
        <div className="flex items-center gap-4">
          <div className="hero-logo">
            <Logo data={data} size="md" />
          </div>
          <div className="min-w-0">
            <h1 className="hero-title pub-heading text-2xl sm:text-4xl">{est.name}</h1>
            {theme.headline && <p className="hero-in hero-d2 pub-muted mt-1 text-sm sm:text-base">{theme.headline}</p>}
          </div>
        </div>
        <div className="hero-line mt-5 h-1 w-16 rounded-full" style={{ backgroundColor: 'var(--c-accent)' }} />
      </header>
    );
  }

  // classic
  return (
    <header>
      <Band cover={cover} parallax={parallax} className="h-40 sm:h-60" />
      <div className="mx-auto max-w-5xl px-5">
        <div className="relative z-10 -mt-12 flex items-end gap-4">
          <div className="hero-logo rounded-[calc(var(--r-card)+6px)] p-1.5" style={{ backgroundColor: 'var(--c-bg)' }}>
            <Logo data={data} size="lg" />
          </div>
        </div>
        <h1 className="hero-title pub-heading mt-3 text-3xl sm:text-5xl">{est.name}</h1>
        {theme.headline && <p className="hero-in hero-d2 pub-muted mt-2 max-w-2xl text-base">{theme.headline}</p>}
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------
export function BookingView({ data, loadSlots, preview = false, forcedMode }: BookingViewProps) {
  const theme = useMemo(() => normalizeTheme(data.theme), [data.theme]);
  const est = data.establishment;
  const tz = est.timezone;

  // ---- modo claro/escuro ----
  const [mode, setMode] = useState<ResolvedMode>(() => forcedMode ?? initialMode(theme, est.slug, !preview));
  useEffect(() => {
    if (forcedMode) setMode(forcedMode);
  }, [forcedMode]);
  const toggleMode = useCallback(() => {
    setMode((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      if (!preview) storeMode(est.slug, next);
      return next;
    });
  }, [preview, est.slug]);

  const vars = useMemo(() => themeVars(theme, mode), [theme, mode]);

  useEffect(() => {
    loadFonts([theme.font_heading, theme.font_body]);
  }, [theme.font_heading, theme.font_body]);

  // fundo do navegador acompanha o tema (sem "faixa branca" ao rolar)
  const bg = (vars as unknown as Record<string, string>)['--c-bg'];
  useEffect(() => {
    const previous = document.body.style.backgroundColor;
    document.body.style.backgroundColor = bg;
    return () => {
      document.body.style.backgroundColor = previous;
    };
  }, [bg]);

  // ---- fluxo de agendamento ----
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

  const slotsFor = useCallback(
    (date: string) => loadSlots(service?.id ?? '', date, professional?.id ?? null),
    [loadSlots, service?.id, professional?.id],
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
    if (preview) {
      setFormError('Esta é uma pré-visualização: nenhum agendamento é criado aqui.');
      return;
    }
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
      setStep('slot');
    } finally {
      setSubmitting(false);
    }
  }

  // ---- informações ----
  const todayHours = data.business_hours.find((h) => h.weekday === weekdayOf(todayInZone(tz)));
  const todayLabel = !todayHours || todayHours.is_closed ? 'Fechado hoje' : `Hoje, ${trimTime(todayHours.opens_at)} – ${trimTime(todayHours.closes_at)}`;
  const address = [est.address, est.city, est.state].filter(Boolean).join(' · ');
  const about = theme.about_text || est.description;

  const steps: { id: Step; label: string }[] = [
    { id: 'service', label: 'Serviço' },
    ...(chooseProfessional ? [{ id: 'professional' as Step, label: 'Profissional' }] : []),
    { id: 'slot', label: 'Horário' },
    { id: 'details', label: 'Seus dados' },
  ];
  const stepIndex = steps.findIndex((s) => s.id === step);
  const stepTitle: Record<Step, string> = {
    service: 'Escolha o serviço',
    professional: 'Escolha o profissional',
    slot: 'Escolha o dia e o horário',
    details: 'Seus dados',
    done: 'Agendamento realizado',
  };

  const showToggle = theme.dark_mode_toggle;

  return (
    <div style={vars} className="pub min-h-screen overflow-x-clip pb-16" data-mode={mode} data-hero={theme.hero_animation}>
      {showToggle && (
        <button
          type="button"
          onClick={toggleMode}
          className="pub-mode-toggle fixed right-3 top-3 z-30 sm:right-5 sm:top-5"
          aria-label={mode === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
          aria-pressed={mode === 'dark'}
        >
          {mode === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {mode === 'dark' ? 'Modo claro' : 'Modo escuro'}
        </button>
      )}

      {/* a chave faz a animação de entrada tocar de novo quando o estilo muda */}
      <Header key={`${theme.hero_animation}-${theme.layout}`} data={data} theme={theme} />

      <div className="mx-auto max-w-5xl px-5">
        <div key={theme.hero_animation} className="hero-in hero-d3 mt-5 flex flex-wrap gap-2">
          <span className="pub-chip">
            <Clock className="h-3.5 w-3.5 pub-primary-text" />
            {todayLabel}
          </span>
          {address && (
            <span className="pub-chip max-w-full">
              <MapPin className="h-3.5 w-3.5 shrink-0 pub-primary-text" />
              <span className="truncate">{address}</span>
            </span>
          )}
          {est.whatsapp && (
            <a href={whatsappLink(est.whatsapp, `Olá! Vim pela página de agendamento de ${est.name}.`)} target="_blank" rel="noreferrer" className="pub-chip hover:opacity-80">
              <MessageCircle className="h-3.5 w-3.5 pub-primary-text" />
              WhatsApp
            </a>
          )}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          {/* ---------------- coluna principal ---------------- */}
          <div className="min-w-0 space-y-5">
            <section className="pub-card p-5 sm:p-6" aria-live="polite">
              {step !== 'done' && (
                <div className="mb-5">
                  <div className="flex gap-1.5">
                    {steps.map((s, i) => (
                      <div
                        key={s.id}
                        className="h-1.5 flex-1 rounded-full transition-colors"
                        style={{ backgroundColor: i <= stepIndex ? 'var(--c-primary)' : 'var(--c-border)' }}
                      />
                    ))}
                  </div>
                  <p className="pub-muted mt-2 text-xs font-medium uppercase tracking-wide">
                    Etapa {stepIndex + 1} de {steps.length} · {steps[stepIndex]?.label}
                  </p>
                </div>
              )}

              <div className="mb-4 flex items-center gap-2">
                {step !== 'service' && step !== 'done' && (
                  <button type="button" onClick={back} className="pub-btn-ghost -ml-2 !p-2" aria-label="Voltar">
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                )}
                <h2 className="pub-heading text-xl sm:text-2xl">{stepTitle[step]}</h2>
              </div>

              {step !== 'service' && step !== 'done' && service && (
                <p className="pub-soft mb-4 px-3 py-2 text-sm" style={{ borderRadius: 'var(--r-inner)' }}>
                  {service.name}
                  {professional ? ` · ${professional.name}` : ''}
                  {slot && step === 'details' ? ` · ${formatDate(slot.slot_start, tz)} às ${formatTime(slot.slot_start, tz)}` : ''}
                </p>
              )}

              {step === 'service' &&
                (data.services.length === 0 ? (
                  <p className="pub-muted text-sm">Este estabelecimento ainda não tem serviços disponíveis para agendamento online.</p>
                ) : (
                  <ul className="space-y-2.5">
                    {data.services.map((s) => (
                      <li key={s.id}>
                        <button type="button" onClick={() => pickService(s)} className="pub-option flex items-center gap-3 p-3 sm:p-4">
                          {s.image_url && <img src={s.image_url} alt="" className="h-16 w-16 shrink-0 object-cover" style={{ borderRadius: 'var(--r-inner)' }} />}
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold">{s.name}</span>
                            {s.description && <span className="pub-muted mt-0.5 block text-sm">{s.description}</span>}
                            <span className="pub-muted mt-1 inline-flex items-center gap-1 text-xs">
                              <Clock className="h-3.5 w-3.5" />
                              {formatDuration(s.duration_minutes)}
                            </span>
                          </span>
                          {theme.show_prices && <span className="pub-primary-text shrink-0 text-base font-bold">{formatMoney(s.price_cents)}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                ))}

              {step === 'professional' && (
                <ul className="space-y-2.5">
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        setProfessional(null);
                        setStep('slot');
                      }}
                      className="pub-option p-4"
                    >
                      <span className="block font-semibold">Sem preferência</span>
                      <span className="pub-muted block text-sm">Mostrar todos os horários disponíveis</span>
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
                        className="pub-option flex items-center gap-3 p-3"
                      >
                        <span className="pub-soft flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full">
                          {p.photo_url ? <img src={p.photo_url} alt="" className="h-full w-full object-cover" /> : <UserRound className="h-5 w-5 pub-primary-text" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block font-semibold">{p.name}</span>
                          {p.specialty && <span className="pub-muted block text-sm">{p.specialty}</span>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {step === 'slot' && service && (
                <>
                  {formError && (
                    <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600" role="alert">
                      {formError}
                    </p>
                  )}
                  <SlotPicker
                    timeZone={tz}
                    maxDays={est.max_advance_days}
                    loadSlots={slotsFor}
                    value={slot}
                    onChange={(next) => {
                      setSlot(next);
                      setFormError(null);
                    }}
                    reloadKey={`${service.id}:${professional?.id ?? ''}`}
                    variant="public"
                  />
                  <button type="button" disabled={!slot} onClick={() => setStep('details')} className="pub-btn mt-5 w-full">
                    Continuar
                  </button>
                </>
              )}

              {step === 'details' && (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium">Nome completo</span>
                    <input className="pub-input" required minLength={2} maxLength={120} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium">Telefone / WhatsApp (com DDD)</span>
                    <input className="pub-input" required inputMode="tel" autoComplete="tel" placeholder="(11) 99999-9999" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium">E-mail (opcional)</span>
                    <input className="pub-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium">Observações (opcional)</span>
                    <textarea className="pub-input" rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
                  </label>
                  {formError && (
                    <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600" role="alert">
                      {formError}
                    </p>
                  )}
                  <button type="submit" disabled={submitting} className="pub-btn w-full">
                    {submitting ? 'Confirmando…' : 'Confirmar agendamento'}
                  </button>
                  <p className="pub-muted text-center text-xs">Seus dados são usados apenas por {est.name} para este atendimento.</p>
                </form>
              )}

              {step === 'done' && result && (
                <div>
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-500" />
                    <p className="pub-muted text-sm">
                      {result.status === 'confirmed' ? 'Seu horário está confirmado.' : 'Seu horário está reservado e aguarda a confirmação do estabelecimento.'}
                    </p>
                  </div>
                  <dl className="pub-soft mt-4 space-y-2 p-4 text-sm" style={{ borderRadius: 'var(--r-inner)' }}>
                    {[
                      ['Serviço', result.service.name],
                      ['Profissional', result.professional.name],
                      ['Data', formatDate(result.starts_at, tz)],
                      ['Horário', formatTime(result.starts_at, tz)],
                      ...(theme.show_prices ? [['Valor', formatMoney(result.price_cents)]] : []),
                    ].map(([label, value]) => (
                      <div key={label} className="flex justify-between gap-3">
                        <dt className="pub-muted">{label}</dt>
                        <dd className="text-right font-semibold capitalize">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-4 space-y-2">
                    {est.whatsapp && (
                      <a
                        href={whatsappLink(est.whatsapp, appointmentMessage(result, `Olá! Fiz um agendamento em ${est.name}.`))}
                        target="_blank"
                        rel="noreferrer"
                        className="flex w-full items-center justify-center gap-2 bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
                        style={{ borderRadius: 'var(--r-btn)' }}
                      >
                        <MessageCircle className="h-4 w-4" />
                        Enviar confirmação pelo WhatsApp
                      </a>
                    )}
                    <Link to={`/agendamento/${result.public_token}`} className="pub-btn w-full">
                      Ver, cancelar ou reagendar
                    </Link>
                    <button type="button" onClick={restart} className="pub-btn-ghost w-full">
                      Fazer outro agendamento
                    </button>
                  </div>
                  <p className="pub-muted mt-3 text-center text-xs">Guarde o link do agendamento: é por ele que você consulta ou altera o horário.</p>
                </div>
              )}
            </section>

            {theme.gallery.length > 0 && (
              <section>
                <h2 className="pub-heading mb-3 text-xl">Fotos</h2>
                <div className="no-scrollbar -mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-1 lg:mx-0 lg:px-0">
                  {theme.gallery.map((url) => (
                    <img
                      key={url}
                      src={url}
                      alt=""
                      loading="lazy"
                      className="h-44 w-64 shrink-0 snap-start object-cover sm:h-52 sm:w-72"
                      style={{ borderRadius: 'var(--r-card)' }}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* ---------------- coluna lateral ---------------- */}
          <aside className="min-w-0 space-y-5">
            {theme.show_professionals && data.professionals.length > 0 && (
              <section className="pub-card p-5">
                <h2 className="pub-heading text-lg">Equipe</h2>
                <ul className="mt-3 space-y-3">
                  {data.professionals.map((p) => (
                    <li key={p.id} className="flex items-center gap-3">
                      <span className="pub-soft flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full">
                        {p.photo_url ? <img src={p.photo_url} alt="" className="h-full w-full object-cover" /> : <UserRound className="h-5 w-5 pub-primary-text" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{p.name}</span>
                        {p.specialty && <span className="pub-muted block truncate text-xs">{p.specialty}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="pub-card p-5">
              <h2 className="pub-heading text-lg">Sobre</h2>
              {about && <p className="pub-muted mt-2 whitespace-pre-line text-sm leading-relaxed">{about}</p>}
              <ul className="mt-3 space-y-2 text-sm">
                {address && (
                  <li className="flex items-start gap-2">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 pub-primary-text" />
                    <span>{address}</span>
                  </li>
                )}
                {est.phone && (
                  <li className="flex items-center gap-2">
                    <Phone className="h-4 w-4 shrink-0 pub-primary-text" />
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
                  className="mt-4 flex w-full items-center justify-center gap-2 border border-emerald-500 px-4 py-2.5 text-sm font-semibold text-emerald-600 hover:bg-emerald-500/10"
                  style={{ borderRadius: 'var(--r-btn)' }}
                >
                  <MessageCircle className="h-4 w-4" />
                  Falar pelo WhatsApp
                </a>
              )}
              {data.business_hours.length > 0 && (
                <>
                  <h3 className="mt-5 text-sm font-semibold">Horário de funcionamento</h3>
                  <ul className="mt-2 space-y-1 text-sm">
                    {data.business_hours.map((h) => {
                      const isToday = h.weekday === todayHours?.weekday;
                      return (
                        <li key={h.weekday} className={`flex justify-between ${isToday ? 'font-semibold' : 'pub-muted'}`}>
                          <span>{WEEKDAYS[h.weekday]}</span>
                          <span className="tabular-nums">{h.is_closed ? 'Fechado' : `${trimTime(h.opens_at)} – ${trimTime(h.closes_at)}`}</span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </section>
          </aside>
        </div>

        <footer className="mt-10 text-center text-sm">
          <Link to="/meus-agendamentos" className="pub-muted underline hover:opacity-80">
            Já agendou? Consulte seus agendamentos
          </Link>
        </footer>
      </div>
    </div>
  );
}
