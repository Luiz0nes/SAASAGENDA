// POST /functions/v1/admin-create-establishment
// Somente SuperAdmin. Cria a conta do proprietário (Supabase Auth Admin) e
// provisiona o estabelecimento em uma única transação no banco.
import { createAuthUser, dbErrorMessage, getCaller } from "../_shared/auth.ts";
import { HttpError, json, optionalPassword, readBody, requireEmail, requireString, serve } from "../_shared/http.ts";

interface Body {
  establishment?: Record<string, unknown>;
  owner?: { full_name?: unknown; email?: unknown; password?: unknown };
  plan_id?: string | null;
  redirect_to?: string;
}

serve(async (req) => {
  const caller = await getCaller(req);
  if (!caller.isSuperAdmin) throw new HttpError(403, "Apenas o SuperAdmin pode cadastrar estabelecimentos.");

  const body = await readBody<Body>(req);
  const est = body.establishment ?? {};
  const name = requireString(est.name, "nome do estabelecimento", 2, 120);
  const slug = requireString(est.slug, "endereço (slug)", 3, 60).toLowerCase();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    throw new HttpError(400, "O endereço (slug) aceita apenas letras minúsculas, números e hífens.");
  }
  const ownerName = requireString(body.owner?.full_name, "nome do proprietário", 2, 120);
  const ownerEmail = requireEmail(body.owner?.email);
  const password = optionalPassword(body.owner?.password);

  // evita criar o usuário para depois falhar no slug duplicado
  const { data: existing } = await caller.admin.from("establishments").select("id").eq("slug", slug).maybeSingle();
  if (existing) throw new HttpError(409, "Este endereço (slug) já está em uso.");

  const ownerId = await createAuthUser(caller.admin, {
    email: ownerEmail,
    fullName: ownerName,
    password,
    redirectTo: body.redirect_to,
  });

  const { data: establishmentId, error } = await caller.admin.rpc("admin_provision_establishment", {
    p_actor_id: caller.id,
    p_owner_id: ownerId,
    p_establishment: { ...est, name, slug },
    p_plan_id: body.plan_id || null,
  });

  if (error) {
    // desfaz a conta para não deixar um usuário órfão
    await caller.admin.auth.admin.deleteUser(ownerId);
    throw new HttpError(400, dbErrorMessage(error));
  }

  return json({ establishment_id: establishmentId, owner_id: ownerId, invited: password === null }, 201);
});
