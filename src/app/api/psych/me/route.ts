/**
 * GET /api/psych/me
 *
 * Retorna permisos del usuario autenticado sobre el módulo psych.
 * Útil para que la UI decida si mostrar botones destructivos (eliminar)
 * o de administración (config).
 */

import { NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { isTenantModuleEnabled } from "@/lib/tenant-modules";

const READ_ROLES = new Set([
  "owner",
  "admin",
  "manager",
  "rrhh",
  "gerencia",
  "editor",
]);
const WRITE_ROLES = new Set(["owner", "admin", "rrhh", "gerencia"]);
const ADMIN_ROLES = new Set(["owner", "admin"]);

export async function GET() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const enabled = await isTenantModuleEnabled(ctx.tenantId, "psych");
  const role = (ctx.userRole ?? "").toLowerCase();

  return NextResponse.json({
    success: true,
    enabled,
    role: ctx.userRole,
    canRead: READ_ROLES.has(role),
    canWrite: WRITE_ROLES.has(role),
    canAdmin: ADMIN_ROLES.has(role),
  });
}
