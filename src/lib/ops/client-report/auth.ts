import { NextResponse } from "next/server";
import { requireTenantModule } from "@/lib/require-module";
import { requireAuth, unauthorized, resolveApiPerms, type AuthContext } from "@/lib/api-auth";
import {
  canView,
  canViewInstallations,
  canEditInstallations,
  hasCapability,
  type RolePermissions,
} from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export type ClientReportAuth = {
  ctx: AuthContext;
  perms: RolePermissions;
};

/**
 * Auth de la pestaña CRM «Reporte cliente».
 * No exige el módulo tenant ops_supervision: la ficha de instalación ya está
 * gated por CRM; un 403 ahí dejaba la pestaña en spinner infinito.
 */
export async function requireClientReportAuth(): Promise<
  | { ok: true; auth: ClientReportAuth }
  | { ok: false; response: NextResponse }
> {
  const ctx = await requireAuth();
  if (!ctx) return { ok: false, response: unauthorized() };
  const perms = await resolveApiPerms(ctx);
  if (!canView(perms, "ops", "supervision") && !canViewInstallations(perms)) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Sin permisos para ver el informe de esta instalación" },
        { status: 403 }
      ),
    };
  }
  return { ok: true, auth: { ctx, perms } };
}

/** Informe de visitas on-demand (APIs de /ops/supervision/reportes). */
export async function requireVisitReportAuth(): Promise<
  | { ok: true; auth: ClientReportAuth }
  | { ok: false; response: NextResponse }
> {
  const modCheck = await requireTenantModule("ops_supervision");
  if (!modCheck.authorized) return { ok: false, response: modCheck.response };
  const ctx = modCheck.ctx;
  const perms = await resolveApiPerms(ctx);
  if (!canView(perms, "ops", "supervision") || !hasCapability(perms, "supervision_dashboard")) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Sin permisos de reportes de supervisión" },
        { status: 403 }
      ),
    };
  }
  return { ok: true, auth: { ctx, perms } };
}

export function canManageClientReportConfig(perms: RolePermissions): boolean {
  return canEditInstallations(perms) || hasCapability(perms, "supervision_dashboard");
}

export function isMissingClientReportTable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /client_report_|P2021|does not exist/i.test(msg);
}

export async function assertInstallationInTenant(
  tenantId: string,
  installationId: string
) {
  return prisma.crmInstallation.findFirst({
    where: { id: installationId, tenantId },
    select: {
      id: true,
      name: true,
      accountId: true,
      account: { select: { id: true, name: true } },
    },
  });
}
