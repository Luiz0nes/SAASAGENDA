import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ErrorBox, Spinner } from '../../components/ui';
import { supabase, unwrap } from '../../lib/supabase';
import { normalizeTheme } from '../../lib/theme';
import { useLoad } from '../../lib/useLoad';
import type { BusinessHour, CustomerPlan, Establishment, Professional, PublicEstablishmentData, Service, Theme } from '../../types/database';
import { isEditorMessage, type EditorMessage } from '../theme/previewProtocol';
import { BookingView } from './BookingView';
import { fetchAdminSlots } from './publicApi';

/**
 * Monta os mesmos dados da página pública a partir das tabelas (o usuário
 * logado lê o próprio estabelecimento pela RLS). Funciona mesmo com o
 * estabelecimento suspenso, para o dono conseguir ajustar o visual.
 */
async function fetchPreviewData(establishmentId: string): Promise<PublicEstablishmentData> {
  const [est, theme, services, professionals, links, hours, plans] = await Promise.all([
    supabase.from('establishments').select('*').eq('id', establishmentId).single(),
    supabase.from('establishment_themes').select('*').eq('establishment_id', establishmentId).maybeSingle(),
    supabase.from('services').select('*').eq('establishment_id', establishmentId).eq('is_active', true).order('sort_order').order('name'),
    supabase.from('professionals').select('*').eq('establishment_id', establishmentId).eq('is_active', true).order('name'),
    supabase.from('professional_services').select('professional_id, service_id').eq('establishment_id', establishmentId),
    supabase.from('business_hours').select('*').eq('establishment_id', establishmentId).order('weekday'),
    supabase.from('customer_plans').select('*').eq('establishment_id', establishmentId).eq('is_active', true).order('sort_order').order('name'),
  ]);
  const e = unwrap<Establishment>(est);
  const pros = unwrap<Professional[]>(professionals);
  const pairs = unwrap<{ professional_id: string; service_id: string }[]>(links);
  const activeIds = new Set(pros.map((p) => p.id));

  return {
    establishment: e,
    theme: normalizeTheme(unwrap<Theme | null>(theme)),
    business_hours: unwrap<BusinessHour[]>(hours),
    customer_plans: unwrap<CustomerPlan[]>(plans),
    services: unwrap<Service[]>(services).filter((s) => pairs.some((l) => l.service_id === s.id && activeIds.has(l.professional_id))),
    professionals: pros.map((p) => ({
      id: p.id,
      name: p.name,
      photo_url: p.photo_url,
      bio: p.bio,
      specialty: p.specialty,
      service_ids: pairs.filter((l) => l.professional_id === p.id).map((l) => l.service_id),
    })),
  };
}

/** /preview/:establishmentId — aberta dentro do iframe da Personalização. */
export function PreviewPage() {
  const { establishmentId = '' } = useParams();
  const { data, loading, error } = useLoad(() => fetchPreviewData(establishmentId), [establishmentId]);
  const [draft, setDraft] = useState<EditorMessage | null>(null);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      if (isEditorMessage(event.data)) setDraft(event.data);
    }
    window.addEventListener('message', onMessage);
    if (window.parent !== window) window.parent.postMessage({ source: 'agenda-preview', type: 'ready' }, window.location.origin);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const merged = useMemo<PublicEstablishmentData | null>(() => {
    if (!data) return null;
    if (!draft) return data;
    return {
      ...data,
      theme: draft.theme,
      establishment: { ...data.establishment, logo_url: draft.logo_url, cover_url: draft.cover_url },
    };
  }, [data, draft]);

  const loadSlots = useCallback(
    (serviceId: string, date: string, professionalId: string | null) => fetchAdminSlots(establishmentId, serviceId, date, professionalId),
    [establishmentId],
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (error || !merged) {
    return (
      <div className="p-6">
        <ErrorBox message={error ?? 'Não foi possível carregar a pré-visualização.'} />
      </div>
    );
  }
  return <BookingView data={merged} loadSlots={loadSlots} preview forcedMode={draft?.mode} />;
}
