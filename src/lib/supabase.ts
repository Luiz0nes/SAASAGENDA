import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** false quando o arquivo .env ainda não foi preenchido. */
export const isSupabaseConfigured = Boolean(url && anonKey);

// Apenas a chave pública (anon) é usada no navegador. Tudo o que o usuário
// pode ver ou alterar é decidido pelas políticas RLS do banco.
export const supabase = createClient(url ?? 'http://localhost:54321', anonKey ?? 'not-configured');

interface DbError {
  code?: string;
  message: string;
}

/** Converte erros do Supabase/Postgres em mensagens para o usuário. */
export function errorMessage(error: unknown): string {
  const e = error as DbError | null;
  if (!e || typeof e.message !== 'string') return 'Ocorreu um erro inesperado.';
  if (e.message.includes('row-level security')) return 'Você não tem permissão para esta ação.';
  // P0001 e 42501 são levantados pelas nossas funções, já em português
  if (e.code === 'P0001' || e.code === '42501') return e.message;
  if (e.code === '23505') return 'Já existe um registro com estes dados.';
  if (e.code === '23503') return 'Este registro está em uso e não pode ser excluído. Desative-o em vez de excluir.';
  if (e.code === '23514') return 'Algum campo está fora do formato permitido.';
  if (e.code === '23P01') return 'Este horário já está reservado.';
  if (e.message === 'Invalid login credentials') return 'E-mail ou senha incorretos.';
  if (e.message.includes('Failed to fetch')) return 'Sem conexão com o servidor. Verifique sua internet.';
  return e.code ? 'Não foi possível concluir a operação.' : e.message;
}

/** Lança o erro de uma resposta do Supabase ou devolve os dados tipados. */
export function unwrap<T>(result: { data: unknown; error: DbError | null }): T {
  if (result.error) throw result.error;
  return result.data as T;
}

/** Chama uma Edge Function e devolve o JSON; lança Error com a mensagem do servidor. */
export async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let message = 'Não foi possível concluir a operação.';
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const payload = (await context.json()) as { error?: string };
        if (payload.error) message = payload.error;
      } catch {
        // resposta sem JSON: mantém a mensagem padrão
      }
    }
    throw new Error(message);
  }
  return data as T;
}

/** Envia uma imagem para a pasta do estabelecimento e devolve a URL pública. */
export async function uploadAsset(establishmentId: string, file: File, prefix: string): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Envie uma imagem JPG, PNG ou WebP.');
  }
  if (file.size > 5 * 1024 * 1024) throw new Error('A imagem deve ter no máximo 5 MB.');
  const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${establishmentId}/${prefix}-${Date.now()}.${extension}`;
  const { error } = await supabase.storage.from('establishment-assets').upload(path, file, {
    contentType: file.type,
    cacheControl: '31536000',
  });
  if (error) throw new Error('Não foi possível enviar a imagem.');
  return supabase.storage.from('establishment-assets').getPublicUrl(path).data.publicUrl;
}
