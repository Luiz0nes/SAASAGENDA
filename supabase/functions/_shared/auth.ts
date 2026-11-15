// Identificação de quem chama a função e cliente administrativo.
// A Service Role Key existe SOMENTE aqui, no servidor. Nunca vai ao frontend.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { HttpError } from "./http.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export interface Caller {
  id: string;
  isSuperAdmin: boolean;
  /** Cliente com o token do usuário: as políticas RLS valem normalmente. */
  userClient: SupabaseClient;
  /** Cliente com a service role: ignora RLS. Usar só após autorizar. */
  admin: SupabaseClient;
}

export async function getCaller(req: Request): Promise<Caller> {
  const authorization = req.headers.get("Authorization");
  if (!authorization) throw new HttpError(401, "Não autenticado.");

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) throw new HttpError(401, "Sessão inválida ou expirada.");

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("is_super_admin")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError) throw new HttpError(500, "Não foi possível validar o usuário.");

  return {
    id: data.user.id,
    isSuperAdmin: profile?.is_super_admin === true,
    userClient,
    admin,
  };
}

/**
 * Cria a conta no Supabase Auth. Com senha, o usuário já entra direto;
 * sem senha, o Supabase envia um convite por e-mail para ele definir a senha.
 */
export async function createAuthUser(
  admin: SupabaseClient,
  input: { email: string; fullName: string; password: string | null; redirectTo?: string },
): Promise<string> {
  const metadata = { full_name: input.fullName };
  const result = input.password
    ? await admin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: metadata,
    })
    : await admin.auth.admin.inviteUserByEmail(input.email, {
      data: metadata,
      redirectTo: input.redirectTo,
    });

  if (result.error || !result.data.user) {
    const message = result.error?.message ?? "";
    if (/already|registered|exists/i.test(message)) {
      throw new HttpError(409, "Já existe um usuário com este e-mail.");
    }
    throw new HttpError(400, `Não foi possível criar o usuário: ${message}`);
  }
  return result.data.user.id;
}

/** Traduz erros do banco (regras de negócio usam o código P0001). */
export function dbErrorMessage(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "Já existe um registro com estes dados (verifique o endereço/slug).";
  if (error.code === "23514") return "Algum campo está fora do formato permitido.";
  if (error.code === "P0001" || error.code === "42501") return error.message;
  return "Não foi possível salvar os dados.";
}
