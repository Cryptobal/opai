import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

export const runtime = "nodejs";

/**
 * GET /api/finance/cost-centers/by-installation?accountId=<crmAccountId>
 *
 * Devuelve las instalaciones del CrmAccount con su costCenterId asociado.
 * Si una instalación no tiene CC en finance, lo crea on-the-fly (idempotente).
 * Habilita selector "Instalaciones por línea" en el form de DTE.
 */
export async function GET(request: Request) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const url = new URL(request.url);
  const accountId = url.searchParams.get("accountId");
  if (!accountId) {
    return NextResponse.json(
      { success: false, error: "accountId requerido" },
      { status: 400 },
    );
  }

  const installations = await prisma.crmInstallation.findMany({
    where: { tenantId: ctx.tenantId, accountId, isActive: true },
    select: { id: true, name: true, commune: true },
    orderBy: { name: "asc" },
  });

  const out: Array<{
    installationId: string;
    installationName: string;
    commune: string | null;
    costCenterId: string;
  }> = [];

  for (const inst of installations) {
    let cc = await prisma.financeCostCenter.findFirst({
      where: { tenantId: ctx.tenantId, installationId: inst.id },
      select: { id: true },
    });
    if (!cc) {
      cc = await prisma.financeCostCenter.create({
        data: {
          tenantId: ctx.tenantId,
          name: inst.name,
          active: true,
          installationId: inst.id,
        },
        select: { id: true },
      });
    }
    out.push({
      installationId: inst.id,
      installationName: inst.name,
      commune: inst.commune,
      costCenterId: cc.id,
    });
  }

  return NextResponse.json({ success: true, data: out });
}
