import { Link } from 'react-router-dom';
import { CalendarCheck, CalendarClock, MessageCircle, Palette, ShieldCheck, Smartphone, Users } from 'lucide-react';

const SEGMENTS = ['Barbearias', 'Salões de beleza', 'Clínicas', 'Consultórios odontológicos', 'Clínicas de estética', 'Profissionais autônomos'];

const FEATURES = [
  { icon: CalendarClock, title: 'Agenda online 24 horas', text: 'Seu cliente escolhe serviço, profissional e horário pelo link, sem precisar ligar.' },
  { icon: ShieldCheck, title: 'Sem horários duplicados', text: 'A disponibilidade é calculada no servidor. Dois clientes nunca ficam com o mesmo horário.' },
  { icon: Users, title: 'Equipe e permissões', text: 'Cada profissional com sua agenda. Recepção e administração com acessos separados.' },
  { icon: Palette, title: 'Sua identidade visual', text: 'Logotipo, cores, capa e textos próprios na página de agendamento.' },
  { icon: MessageCircle, title: 'Contato pelo WhatsApp', text: 'Confirmação e pedidos de alteração com um toque, direto na conversa.' },
  { icon: Smartphone, title: 'Feito para o celular', text: 'Painel e página de agendamento funcionam bem em qualquer tela.' },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <div className="flex items-center gap-2 text-slate-900">
          <CalendarCheck className="h-6 w-6" />
          <span className="font-semibold">Agenda</span>
        </div>
        <nav className="flex items-center gap-2">
          <Link to="/meus-agendamentos" className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900">
            Meus agendamentos
          </Link>
          <Link to="/login" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
            Entrar
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 sm:pt-20">
        <div className="max-w-2xl">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">Agendamento online para o seu negócio de serviços.</h1>
          <p className="mt-5 text-lg text-slate-600">
            Uma página de agendamento com a sua marca e um painel para organizar serviços, profissionais, horários e clientes em um só lugar.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/login" className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800">
              Acessar meu painel
            </Link>
            <Link to="/meus-agendamentos" className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50">
              Consultar um agendamento
            </Link>
          </div>
        </div>
        <ul className="mt-10 flex flex-wrap gap-2">
          {SEGMENTS.map((segment) => (
            <li key={segment} className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
              {segment}
            </li>
          ))}
        </ul>
      </section>

      <section className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto grid max-w-6xl gap-4 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-xl border border-slate-200 bg-white p-5">
              <Icon className="h-6 w-6 text-slate-900" />
              <h2 className="mt-3 font-semibold text-slate-900">{title}</h2>
              <p className="mt-1 text-sm text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
        O cadastro de novos estabelecimentos é feito pela administração da plataforma.
      </footer>
    </div>
  );
}
