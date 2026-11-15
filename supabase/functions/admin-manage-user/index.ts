// POST /functions/v1/admin-manage-user
// Gerencia o acesso de uma conta existente:
//   { action: "reset_password", user_id, new_password }
//   { action: "set_access", user_id, enabled }   -> bloqueia/libera o login
// SuperAdmin: qualquer conta (exceto outro SuperAdmin).
// Quem tem manage_users: apenas membros não-proprietários cuja única
// vinculação seja com um estabelecimento que ele gerencia.
import { getCaller } from "../_shared/auth.ts";
import { HttpError, json, optionalPassword, readBody, requireString, serve } from "../_shared/http.ts";

interface Body {
  action?: string;
  user_id?: string;
  new_password?: unknown;
  enabled?: boolean;
}

serve(async (req) => {
  const caller = await getCaller(req);
  const body = await readBody<Body>(req);
  const userId = requireString(body.user_id, "usuário", 36, 36);

  if (userId === caller.id) throw new HttpError(400, "Use a tela de perfil para alterar a própria conta.");

  const { data: target } = await caller.admin
    .from("profiles").select("id, is_super_admin").eq("id", userId).maybeSingle();
  if (!target) throw new HttpError(404, "Usuário não encontrado.");
  if (target.is_super_admin) throw new HttpError(403, "Esta conta não pode ser alterada por aqui.");

  if (!caller.isSuperAdmin) {
    const { data: memberships, error } = await caller.admin
      .from("establishment_users").select("establishment_id, role").eq("user_id", userId);
    if (error || !memberships || memberships.length !== 1 || memberships[0].role === "owner") {
      throw new HttpError(403, "Você não pode alterar esta conta.");
    }
    const { data: canManage } = await caller.userClient.rpc("has_permission", {
      p_establishment_id: memberships[0].establishment_id,
      p_permission: "manage_users",
    });
    if (canManage !== true) throw new HttpError(403, "Você não pode alterar esta conta.");
    if (memberships[0].role === "admin") {
      const { data: isOwner } = await caller.userClient.rpc("has_role", {
        p_establishment_id: memberships[0].establishment_id,
        p_roles: ["owner"],
      });
      if (isOwner !== true) throw new HttpError(403, "Somente o proprietário pode alterar administradores.");
    }
  }

  if (body.action === "reset_password") {
    const password = optionalPassword(body.new_password);
    if (!password) throw new HttpError(400, "Informe a nova senha.");
    const { error } = await caller.admin.auth.admin.updateUserById(userId, { password });
    if (error) throw new HttpError(400, `Não foi possível alterar a senha: ${error.message}`);
  } else if (body.action === "set_access") {
    if (typeof body.enabled !== "boolean") throw new HttpError(400, "Informe se o acesso fica liberado.");
    // ban_duration "none" libera; um prazo longo bloqueia o login.
    const { error } = await caller.admin.auth.admin.updateUserById(userId, {
      ban_duration: body.enabled ? "none" : "876000h",
    });
    if (error) throw new HttpError(400, `Não foi possível alterar o acesso: ${error.message}`);
  } else {
    throw new HttpError(400, "Ação inválida.");
  }

  await caller.admin.from("audit_logs").insert({
    actor_id: caller.id,
    action: body.action,
    entity: "auth_user",
    entity_id: userId,
    new_data: body.action === "set_access" ? { enabled: body.enabled } : null,
  });

  return json({ ok: true });
});
