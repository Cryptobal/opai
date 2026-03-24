import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureInventarioAccess } from "@/lib/inventory";

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureInventarioAccess(ctx);
    if (forbidden) return forbidden;

    const [assignments, assetsAssigned, allStock] = await Promise.all([
      prisma.inventoryGuardiaAssignment.findMany({
        where: { tenantId: ctx.tenantId, returnedAt: null },
        include: {
          variant: true,
          movement: {
            select: {
              lines: { select: { variantId: true, unitCost: true } },
            },
          },
        },
      }),
      prisma.inventoryAsset.findMany({
        where: {
          tenantId: ctx.tenantId,
          status: "assigned",
        },
        include: {
          assignments: {
            where: { returnedAt: null },
            select: { installationId: true },
          },
        },
      }),
      prisma.inventoryStock.findMany({
        where: { tenantId: ctx.tenantId },
        include: {
          variant: {
            include: {
              product: { select: { name: true } },
              size: { select: { sizeCode: true } },
            },
          },
          warehouse: { select: { name: true } },
        },
      }),
    ]);

    const costByGuardia: Record<string, number> = {};
    const costByInstallation: Record<string, number> = {};

    for (const a of assignments) {
      const line = a.movement.lines.find((l) => l.variantId === a.variantId);
      const unitCost = line ? Number(line.unitCost ?? 0) : 0;
      const total = unitCost * a.quantity;

      costByGuardia[a.guardiaId] = (costByGuardia[a.guardiaId] ?? 0) + total;
      if (a.installationId) {
        costByInstallation[a.installationId] =
          (costByInstallation[a.installationId] ?? 0) + total;
      }
    }

    for (const asset of assetsAssigned) {
      const cost = Number(asset.purchaseCost ?? 0);
      const instId = asset.assignments[0]?.installationId;
      if (instId && cost > 0) {
        costByInstallation[instId] = (costByInstallation[instId] ?? 0) + cost;
      }
    }

    const guardias = await prisma.opsGuardia.findMany({
      where: {
        id: { in: Object.keys(costByGuardia) },
        tenantId: ctx.tenantId,
      },
      include: {
        persona: { select: { firstName: true, lastName: true } },
      },
    });
    const installations = await prisma.crmInstallation.findMany({
      where: {
        id: { in: Object.keys(costByInstallation) },
      },
      select: { id: true, name: true },
    });

    const byGuardia = guardias.map((g) => ({
      guardiaId: g.id,
      guardiaName: `${g.persona.firstName} ${g.persona.lastName}`,
      totalCost: costByGuardia[g.id] ?? 0,
    }));

    const byInstallation = installations.map((i) => ({
      installationId: i.id,
      installationName: i.name,
      totalCost: costByInstallation[i.id] ?? 0,
    }));

    const totalUniformes = Object.values(costByGuardia).reduce((s, c) => s + c, 0);
    const totalActivos = assetsAssigned.reduce(
      (s, a) => s + Number(a.purchaseCost ?? 0),
      0
    );

    // Stock health metrics
    const totalStockValue = allStock.reduce(
      (sum, s) => sum + s.quantity * Number(s.avgCost ?? 0),
      0
    );
    const totalStockItems = allStock.reduce((sum, s) => sum + s.quantity, 0);
    const outOfStock = allStock.filter((s) => s.quantity === 0);
    const belowMinimum = allStock.filter(
      (s) => s.variant.minStock > 0 && s.quantity > 0 && s.quantity <= s.variant.minStock
    );

    const stockAlerts = [
      ...outOfStock.map((s) => ({
        type: "critical" as const,
        label: `${s.variant.product.name}${s.variant.size ? ` ${s.variant.size.sizeCode}` : ""}`,
        warehouse: s.warehouse.name,
        quantity: 0,
        minStock: s.variant.minStock,
      })),
      ...belowMinimum.map((s) => ({
        type: "low" as const,
        label: `${s.variant.product.name}${s.variant.size ? ` ${s.variant.size.sizeCode}` : ""}`,
        warehouse: s.warehouse.name,
        quantity: s.quantity,
        minStock: s.variant.minStock,
      })),
    ];

    return NextResponse.json({
      byGuardia: byGuardia.sort((a, b) => b.totalCost - a.totalCost),
      byInstallation: byInstallation.sort((a, b) => b.totalCost - a.totalCost),
      summary: {
        totalUniformesAsignados: totalUniformes,
        totalActivosAsignados: totalActivos,
        totalGeneral: totalUniformes + totalActivos,
      },
      stock: {
        totalValue: totalStockValue,
        totalItems: totalStockItems,
        outOfStockCount: outOfStock.length,
        belowMinimumCount: belowMinimum.length,
        alerts: stockAlerts,
      },
    });
  } catch (e) {
    console.error("[inventario/kpis GET]", e);
    return NextResponse.json(
      { success: false, error: "Error al obtener KPIs" },
      { status: 500 }
    );
  }
}
