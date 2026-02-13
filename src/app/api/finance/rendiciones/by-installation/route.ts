import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "finance")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const installationId = searchParams.get("installationId");
    const accountId = searchParams.get("accountId");

    if (!installationId && !accountId) {
      return NextResponse.json(
        { success: false, error: "installationId o accountId requerido" },
        { status: 400 },
      );
    }

    let costCenterIds: string[] = [];

    if (installationId) {
      costCenterIds = [installationId];
    } else if (accountId) {
      // Get all installation IDs for this account
      const installations = await prisma.crmInstallation.findMany({
        where: { tenantId: ctx.tenantId, accountId },
        select: { id: true },
      });
      costCenterIds = installations.map((i) => i.id);
    }

    if (costCenterIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        totals: { total: 0, paid: 0, pending: 0, count: 0 },
        byInstallation: {},
      });
    }

    const rendiciones = await prisma.financeRendicion.findMany({
      where: {
        tenantId: ctx.tenantId,
        costCenterId: { in: costCenterIds },
      },
      include: {
        item: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // Calculate totals from all matching rendiciones (not just the first 50)
    const allRendiciones = await prisma.financeRendicion.findMany({
      where: {
        tenantId: ctx.tenantId,
        costCenterId: { in: costCenterIds },
      },
      select: { amount: true, status: true, costCenterId: true },
    });

    const total = allRendiciones.reduce((sum, r) => sum + r.amount, 0);
    const paid = allRendiciones
      .filter((r) => r.status === "PAID")
      .reduce((sum, r) => sum + r.amount, 0);
    const pending = allRendiciones
      .filter((r) =>
        ["SUBMITTED", "IN_APPROVAL", "APPROVED"].includes(r.status),
      )
      .reduce((sum, r) => sum + r.amount, 0);

    // Breakdown by installation (costCenterId)
    const byInstallation: Record<string, { total: number; count: number }> = {};
    for (const r of allRendiciones) {
      const key = r.costCenterId || "sin-asignar";
      if (!byInstallation[key]) byInstallation[key] = { total: 0, count: 0 };
      byInstallation[key].total += r.amount;
      byInstallation[key].count++;
    }

    return NextResponse.json({
      success: true,
      data: rendiciones,
      totals: { total, paid, pending, count: allRendiciones.length },
      byInstallation,
    });
  } catch (error) {
    console.error("[Finance] Error fetching by installation:", error);
    return NextResponse.json(
      { success: false, error: "Error" },
      { status: 500 },
    );
  }
}
