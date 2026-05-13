/**
 * API Route: /api/cpq/quotes/[id]/services/auto-group
 * POST - Auto-agrupar positions sin serviceGroupId.
 *
 * Estrategia: bucket por (cargoId, rolId, puestoTrabajoId), ordenado por startTime.
 * El pattern del grupo resultante se infiere por horarios/días en sus positions:
 *   día+noche, Lun-Dom → "24-7"
 *   solo día, Lun-Dom  → "12-7-dia"
 *   solo noche, Lun-Dom → "12-7-noche"
 *   solo día, 5 días    → "5x2-dia"
 *   otro                → "custom"
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCpqEdit } from "@/lib/api-auth-cpq";
import { requireTenantModule } from "@/lib/require-module";
import { inferCoveragePatternFromPositions } from "@/lib/cpq/coverage-patterns";
import { refreshQuoteTotals } from "@/modules/cpq/costing/compute-quote-costs";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const mod = await requireTenantModule("cpq");
    if (!mod.authorized) return mod.response;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqEdit(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const quote = await prisma.cpqQuote.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!quote) {
      return NextResponse.json({ success: false, error: "Quote not found" }, { status: 404 });
    }

    const orphans = await prisma.cpqPosition.findMany({
      where: { quoteId: id, serviceGroupId: null },
      include: { puestoTrabajo: true, cargo: true, rol: true },
      orderBy: [{ cargoId: "asc" }, { puestoTrabajoId: "asc" }, { startTime: "asc" }],
    });
    if (orphans.length === 0) {
      return NextResponse.json({ success: true, data: { created: 0, assigned: 0 } });
    }

    const buckets = new Map<string, typeof orphans>();
    for (const p of orphans) {
      const key = `${p.cargoId}::${p.rolId}::${p.puestoTrabajoId}`;
      const arr = buckets.get(key) ?? [];
      arr.push(p);
      buckets.set(key, arr);
    }

    let createdGroups = 0;
    let assigned = 0;
    const lastOrder = await prisma.cpqServiceGroup.findFirst({
      where: { quoteId: id, tenantId: ctx.tenantId },
      orderBy: { displayOrder: "desc" },
      select: { displayOrder: true },
    });
    let order = (lastOrder?.displayOrder ?? -1) + 1;

    for (const [, posList] of buckets) {
      const pattern = inferCoveragePatternFromPositions(posList);
      const cargoName = posList[0]?.cargo?.name ?? "";
      const puestoName = posList[0]?.puestoTrabajo?.name ?? "Servicio";
      const groupName = [puestoName, cargoName].filter(Boolean).join(" — ") || "Servicio";

      await prisma.$transaction(async (tx) => {
        const group = await tx.cpqServiceGroup.create({
          data: {
            tenantId: ctx.tenantId,
            quoteId: id,
            name: groupName,
            coveragePattern: pattern,
            displayOrder: order++,
          },
        });
        const result = await tx.cpqPosition.updateMany({
          where: { id: { in: posList.map((p) => p.id) }, quoteId: id },
          data: { serviceGroupId: group.id },
        });
        createdGroups++;
        assigned += result.count;
      });
    }

    await refreshQuoteTotals(id);
    return NextResponse.json({
      success: true,
      data: { created: createdGroups, assigned },
    });
  } catch (error) {
    console.error("Error auto-grouping positions:", error);
    return NextResponse.json(
      { success: false, error: "Failed to auto-group" },
      { status: 500 }
    );
  }
}
