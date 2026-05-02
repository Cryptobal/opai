import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureInventarioAccess } from "@/lib/inventory";
import { requireTenantModule } from "@/lib/require-module";

/**
 * GET /api/ops/inventario/overview
 *
 * Datos resumidos para la página de inicio del módulo (estilo "war room"):
 *  - counts: products, warehouses, deliveries y transfers del último mes
 *  - stockSummary: valor total, unidades, agotados, bajo mínimo
 *  - topByGuardia / topByInstallation: top 5 por costo asignado
 *  - recentMovements: 8 más recientes con autor
 *  - alerts: hasta 8 ítems críticos / bajos
 */
export async function GET() {
  try {
    const modCheck = await requireTenantModule("ops_inventario");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureInventarioAccess(ctx);
    if (forbidden) return forbidden;

    const tenantId = ctx.tenantId;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      productActiveCount,
      warehouseActiveCount,
      deliveriesCount,
      transfersCount,
      assignments,
      assetsAssigned,
      allStock,
      recentMovements,
    ] = await Promise.all([
      prisma.inventoryProduct.count({ where: { tenantId, active: true } }),
      prisma.inventoryWarehouse.count({ where: { tenantId, active: true } }),
      prisma.inventoryMovement.count({
        where: { tenantId, type: "delivery", date: { gte: thirtyDaysAgo } },
      }),
      prisma.inventoryMovement.count({
        where: { tenantId, type: "transfer", date: { gte: thirtyDaysAgo } },
      }),
      prisma.inventoryGuardiaAssignment.findMany({
        where: { tenantId, returnedAt: null },
        include: {
          movement: {
            select: { lines: { select: { variantId: true, unitCost: true } } },
          },
        },
      }),
      prisma.inventoryAsset.findMany({
        where: { tenantId, status: "assigned" },
        include: {
          assignments: {
            where: { returnedAt: null },
            select: { installationId: true },
          },
        },
      }),
      prisma.inventoryStock.findMany({
        where: { tenantId },
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
      prisma.inventoryMovement.findMany({
        where: { tenantId },
        orderBy: { date: "desc" },
        take: 8,
        include: {
          fromWarehouse: { select: { name: true } },
          toWarehouse: { select: { name: true } },
          guardia: {
            select: { persona: { select: { firstName: true, lastName: true } } },
          },
          installation: { select: { name: true } },
          lines: {
            include: {
              variant: {
                include: {
                  product: { select: { name: true } },
                  size: { select: { sizeCode: true } },
                },
              },
            },
          },
        },
      }),
    ]);

    // ── Costo asignado: por guardia y por instalación ──
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

    const guardiaIds = Object.keys(costByGuardia);
    const installationIds = Object.keys(costByInstallation);

    const [guardias, installations] = await Promise.all([
      guardiaIds.length
        ? prisma.opsGuardia.findMany({
            where: { id: { in: guardiaIds }, tenantId },
            include: { persona: { select: { firstName: true, lastName: true } } },
          })
        : Promise.resolve([] as Array<{ id: string; persona: { firstName: string; lastName: string } }>),
      installationIds.length
        ? prisma.crmInstallation.findMany({
            where: { id: { in: installationIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([] as Array<{ id: string; name: string }>),
    ]);

    const topByGuardia = guardias
      .map((g) => ({
        guardiaId: g.id,
        guardiaName: `${g.persona.firstName} ${g.persona.lastName}`.trim(),
        totalCost: costByGuardia[g.id] ?? 0,
      }))
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, 5);

    const topByInstallation = installations
      .map((i) => ({
        installationId: i.id,
        installationName: i.name,
        totalCost: costByInstallation[i.id] ?? 0,
      }))
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, 5);

    const totalUniformes = Object.values(costByGuardia).reduce((s, c) => s + c, 0);
    const totalActivos = assetsAssigned.reduce(
      (s, a) => s + Number(a.purchaseCost ?? 0),
      0,
    );

    // ── Stock health ──
    const totalStockValue = allStock.reduce(
      (sum, s) => sum + s.quantity * Number(s.avgCost ?? 0),
      0,
    );
    const totalStockItems = allStock.reduce((sum, s) => sum + s.quantity, 0);
    const outOfStock = allStock.filter((s) => s.quantity === 0);
    const belowMinimum = allStock.filter(
      (s) =>
        s.variant.minStock > 0 && s.quantity > 0 && s.quantity <= s.variant.minStock,
    );

    const alerts = [
      ...outOfStock.slice(0, 8).map((s) => ({
        type: "critical" as const,
        label: `${s.variant.product.name}${s.variant.size ? ` ${s.variant.size.sizeCode}` : ""}`,
        warehouse: s.warehouse.name,
        quantity: 0,
        minStock: s.variant.minStock,
      })),
      ...belowMinimum.slice(0, 8).map((s) => ({
        type: "low" as const,
        label: `${s.variant.product.name}${s.variant.size ? ` ${s.variant.size.sizeCode}` : ""}`,
        warehouse: s.warehouse.name,
        quantity: s.quantity,
        minStock: s.variant.minStock,
      })),
    ].slice(0, 8);

    // ── Recent movements: resolver autor ──
    const creatorIds = Array.from(
      new Set(recentMovements.map((m) => m.createdBy).filter((v): v is string => !!v)),
    );
    const creators = creatorIds.length
      ? await prisma.admin.findMany({
          where: { id: { in: creatorIds } },
          select: { id: true, name: true },
        })
      : [];
    const creatorMap = new Map(creators.map((c) => [c.id, c.name]));

    const movements = recentMovements.map((m) => ({
      id: m.id,
      type: m.type,
      date: m.date,
      fromWarehouse: m.fromWarehouse?.name ?? null,
      toWarehouse: m.toWarehouse?.name ?? null,
      guardiaName: m.guardia
        ? `${m.guardia.persona.firstName} ${m.guardia.persona.lastName}`.trim()
        : null,
      installationName: m.installation?.name ?? null,
      lineCount: m.lines.length,
      totalUnits: m.lines.reduce((s, l) => s + l.quantity, 0),
      summary: m.lines
        .slice(0, 2)
        .map(
          (l) =>
            `${l.quantity} × ${l.variant.product.name}${
              l.variant.size ? ` ${l.variant.size.sizeCode}` : ""
            }`,
        )
        .join(" · "),
      createdByName: m.createdBy ? creatorMap.get(m.createdBy) ?? null : null,
      confirmationStatus: m.confirmationStatus,
    }));

    return NextResponse.json({
      success: true,
      data: {
        counts: {
          products: productActiveCount,
          warehouses: warehouseActiveCount,
          deliveriesLast30d: deliveriesCount,
          transfersLast30d: transfersCount,
        },
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
        },
        topByGuardia,
        topByInstallation,
        recentMovements: movements,
        alerts,
      },
    });
  } catch (e) {
    console.error("[inventario/overview GET]", e);
    return NextResponse.json(
      { success: false, error: "Error al obtener overview de inventario" },
      { status: 500 },
    );
  }
}
