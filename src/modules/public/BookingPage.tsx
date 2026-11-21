import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ErrorBox, Spinner } from '../../components/ui';
import { useLoad } from '../../lib/useLoad';
import { BookingView } from './BookingView';
import { fetchPublicEstablishment, fetchPublicSlots } from './publicApi';

/** /agendar/:slug — página pública de agendamento do estabelecimento. */
export function BookingPage() {
  const { slug = '' } = useParams();
  const { data, loading, error, reload } = useLoad(() => fetchPublicEstablishment(slug), [slug]);
  const loadSlots = useCallback(
    (serviceId: string, date: string, professionalId: string | null) => fetchPublicSlots(slug, serviceId, date, professionalId),
    [slug],
  );

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
  return <BookingView data={data} loadSlots={loadSlots} />;
}
