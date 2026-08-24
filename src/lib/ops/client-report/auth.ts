import { NextResponse } from "next/server";
import { requireTenantModule } from "@/lib/require-module";
import { resolveApiPerms, type AuthContext } from "@/lib/api-auth";
import {
  canView,
  canEditInstallations,
  hasCapability,
  type RolePermissions,
} from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export type ClientReportAuth = {
  ctx: AuthContext;
  perms: RolePermissions;
};

export async function requireClientReportAuth(): Promise<
  | { ok: true; auth: ClientReportAuth }
  | { ok: false; response: NextResponse }
> {
  const modCheck = await requireTenantModule("ops_supervision");
  if (!modCheck.authorized) return { ok: false, response: modCheck.response };
  const ctx = modCheck.ctx;
  const perms = await resolveApiPerms(ctx);
  if (!canView(perms, "ops", "supervision")) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Sin permisos de supervisión" },
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
  const gate = await requireClientReportAuth();
  if (!gate.ok) return gate;
  if (!hasCapability(gate.auth.perms, "supervision_dashboard")) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Sin permisos de reportes de supervisión" },
        { status: 403 }
      ),
    };
  }
  return gate;
}

export function canManageClientReportConfig(perms: RolePermissions): boolean {
  return canEditInstallations(perms) || hasCapability(perms, "supervision_dashboard");
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
