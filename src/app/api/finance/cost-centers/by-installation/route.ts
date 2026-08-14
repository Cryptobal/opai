import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { resolveCostCenterIdsForInstallations } from "@/modules/finance/banking/cost-allocation.service";

export const runtime = "nodejs";

/**
 * GET /api/finance/cost-centers/by-installation?accountId=<crmAccountId>
 *
 * Devuelve las instalaciones del CrmAccount con su costCenterId asociado.
 * Si una instalación no tiene CC en finance, lo crea on-the-fly (idempotente).
 */
export async function GET(request: Request) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!canView(perms, "finance")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const accountId = url.searchParams.get("accountId");
  if (!accountId) {
    return NextResponse.json(
      { success: false, error: "accountId requerido" },
      { status: 400 },
    );
  }

  const installations = await prisma.crmInstallation.findMany({
    where: { tenantId: ctx.tenantId, accountId, status: "active" },
    select: { id: true, name: true, commune: true },
    orderBy: { name: "asc" },
  });

  const ccMap = await resolveCostCenterIdsForInstallations(
    ctx.tenantId,
    installations.map((i) => i.id),
  );

  const out = installations.map((inst) => ({
    installationId: inst.id,
    installationName: inst.name,
    commune: inst.commune,
    costCenterId: ccMap.get(inst.id) ?? "",
  }));

  return NextResponse.json({ success: true, data: out });
}
