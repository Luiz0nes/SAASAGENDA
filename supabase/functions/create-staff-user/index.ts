// POST /functions/v1/create-staff-user
// Proprietário/administrador (permissão manage_users) cria contas da equipe
// do PRÓPRIO estabelecimento: administrador, recepcionista ou profissional.
import { createAuthUser, dbErrorMessage, getCaller } from "../_shared/auth.ts";
import { HttpError, json, optionalPassword, readBody, requireEmail, requireString, serve } from "../_shared/http.ts";

interface Body {
  establishment_id?: string;
  full_name?: unknown;
  email?: unknown;
  password?: unknown;
  role?: string;
  permissions?: Record<string, boolean>;
  professional_id?: string | null;
  redirect_to?: string;
}

const ROLES = ["admin", "receptionist", "professional"];
const PERMISSIONS = [
  "manage_appointments", "manage_customers", "manage_services", "manage_professionals",
  "manage_schedules", "manage_theme", "manage_settings", "manage_users", "view_reports",
];

serve(async (req) => {
  const caller = await getCaller(req);
  const body = await readBody<Body>(req);

  const establishmentId = requireString(body.establishment_id, "estabelecimento", 36, 36);
  const role = requireString(body.role, "papel");
  if (!ROLES.includes(role)) throw new HttpError(400, "Papel inválido.");
  const fullName = requireString(body.full_name, "nome", 2, 120);
  const email = requireEmail(body.email);
  const password = optionalPassword(body.password);

  // Autorização avaliada pelo banco, com a identidade de quem chamou.
  const { data: canManage, error: permError } = await caller.userClient.rpc("has_permission", {
    p_establishment_id: establishmentId,
    p_permission: "manage_users",
  });
  if (permError || canManage !== true) throw new HttpError(403, "Você não pode gerenciar usuários deste estabelecimento.");

  if (role === "admin") {
    const { data: isOwner } = await caller.userClient.rpc("has_role", {
      p_establishment_id: establishmentId,
      p_roles: ["owner"],
    });
    if (isOwner !== true) throw new HttpError(403, "Somente o proprietário pode criar administradores.");
  }

  // só aceita chaves de permissão conhecidas
  const permissions: Record<string, boolean> = {};
  for (const key of PERMISSIONS) {
    if (body.permissions?.[key] === true) permissions[key] = true;
  }

  const userId = await createAuthUser(caller.admin, { email, fullName, password, redirectTo: body.redirect_to });

  const { data: memberId, error } = await caller.admin.rpc("admin_add_member", {
    p_actor_id: caller.id,
    p_establishment_id: establishmentId,
    p_user_id: userId,
    p_role: role,
    p_permissions: permissions,
    p_professional_id: body.professional_id || null,
  });

  if (error) {
    await caller.admin.auth.admin.deleteUser(userId);
    throw new HttpError(400, dbErrorMessage(error));
  }

  return json({ member_id: memberId, user_id: userId, invited: password === null }, 201);
});
