/**
 * API Authentication Helper
 *
 * Validates session and returns auth context for API routes.
 * Use `requireAuth()` at the top of every protected API handler.
 */

import { auth } from "@/lib/auth";
import { getDefaultTenantId } from "@/lib/tenant";

export type AuthContext = {
  userId: string;
  tenantId: string;
  userEmail: string;
  userRole: string;
  roleTemplateId?: string | null;
};

/**
 * Validates the session and returns the auth context.
 * Returns `null` if the user is not authenticated — the caller
 * should respond with 401 immediately.
 *
 * @example
 * ```ts
 * const ctx = await requireAuth();
 * if (!ctx) return unauthorized();
 * const { tenantId, userId } = ctx;
 * ```
 */
export async function requireAuth(): Promise<AuthContext | null> {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());

  return {
    userId: session.user.id,
    tenantId,
    userEmail: session.user.email ?? "",
    userRole: session.user.role ?? "",
    roleTemplateId: session.user.roleTemplateId ?? null,
  };
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { resolvePermissions } from "@/lib/permissions-server";
import { hasModuleAccess, canView, canEdit, canDelete, hasCapability } from "@/lib/permissions";
import type { ModuleKey, CapabilityKey, RolePermissions } from "@/lib/permissions";

/**
 * Standard 401 JSON response.
 */
export function unauthorized() {
  return NextResponse.json(
    { success: false, error: "No autorizado" },
    { status: 401 }
  );
}

/**
 * Parse & validate request body with a Zod schema.
 * Returns `{ data }` on success or `{ error }` with a formatted response.
 */
export async function parseBody<T extends z.ZodType>(
  request: Request,
  schema: T
): Promise<
  | { data: z.infer<T>; error?: never }
  | { data?: never; error: NextResponse }
> {
  try {
    const raw = await request.json();
    const result = schema.safeParse(raw);

    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      return {
        error: NextResponse.json(
          { success: false, error: issues },
          { status: 400 }
        ),
      };
    }

    return { data: result.data };
  } catch {
    return {
      error: NextResponse.json(
        { success: false, error: "Body JSON inválido" },
        { status: 400 }
      ),
    };
  }
}

// ── Permission helpers for API routes ──

/**
 * Resolver permisos de un AuthContext (usa cache de 5min).
 * Soporta tanto roles legacy como custom (RoleTemplate).
 */
export async function resolveApiPerms(ctx: AuthContext): Promise<RolePermissions> {
  return resolvePermissions({
    role: ctx.userRole,
    roleTemplateId: ctx.roleTemplateId,
  });
}

/**
 * Verificar acceso a un módulo. Retorna 403 o null.
 * 
 * Reemplaza: `if (!hasAppAccess(ctx.userRole, "cpq")) return forbiddenCpq();`
 * Con:       `const forbidden = await ensureModuleAccess(ctx, "cpq"); if (forbidden) return forbidden;`
 */
export async function ensureModuleAccess(
  ctx: AuthContext,
  module: ModuleKey,
): Promise<NextResponse | null> {
  const perms = await resolveApiPerms(ctx);
  if (!hasModuleAccess(perms, module)) {
    return NextResponse.json(
      { success: false, error: `Sin permisos para módulo ${module.toUpperCase()}` },
      { status: 403 },
    );
  }
  return null;
}

/**
 * Verificar que el usuario pueda crear cotizaciones.
 * Acepta acceso a crm.quotes (edit/full) O cpq (edit/full).
 * Útil cuando se crea desde cuenta/cliente/negocio/instalación en el CRM.
 */
export async function ensureCanCreateQuote(
  ctx: AuthContext,
): Promise<NextResponse | null> {
  const perms = await resolveApiPerms(ctx);
  const canViaCrm = canEdit(perms, "crm", "quotes");
  const canViaCpq = canEdit(perms, "cpq");
  if (!canViaCrm && !canViaCpq) {
    return NextResponse.json(
      { success: false, error: "Sin permisos para crear cotizaciones" },
      { status: 403 },
    );
  }
  return null;
}

/**
 * Verificar permiso de eliminación (nivel full) en módulo/submódulo.
 * Retorna 403 o null.
 */
export async function ensureCanDelete(
  ctx: AuthContext,
  module: ModuleKey,
  submodule?: string,
): Promise<NextResponse | null> {
  const perms = await resolveApiPerms(ctx);
  if (!canDelete(perms, module, submodule)) {
    return NextResponse.json(
      { success: false, error: `Sin permisos para eliminar en ${module}${submodule ? `.${submodule}` : ""}` },
      { status: 403 },
    );
  }
  return null;
}
