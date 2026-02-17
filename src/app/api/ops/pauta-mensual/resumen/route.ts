import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess, getMonthDateRange } from "@/lib/ops";

/**
 * GET /api/ops/pauta-mensual/resumen?month=2&year=2026
 *
 * Returns a summary of all installations for the tenant with:
 * - Installation name, client name
 * - Number of active puestos and their details
 * - Number of guards assigned vs required
 * - Whether the pauta for the month exists
 * - Whether there are PPC issues (slots without guards on work days)
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const month = Number(request.nextUrl.searchParams.get("month") || new Date().getUTCMonth() + 1);
    const year = Number(request.nextUrl.searchParams.get("year") || new Date().getUTCFullYear());

    const { start, end } = getMonthDateRange(year, month);

    // Get all active installations for the tenant
    const installations = await prisma.crmInstallation.findMany({
      where: {
        tenantId: ctx.tenantId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        account: {
          select: { id: true, name: true },
        },
      },
      orderBy: [{ account: { name: "asc" } }, { name: "asc" }],
    });

    const installationIds = installations.map((i) => i.id);

    // Get all active puestos for these installations
    const puestos = await prisma.opsPuestoOperativo.findMany({
      where: {
        tenantId: ctx.tenantId,
        installationId: { in: installationIds },
        active: true,
      },
      select: {
        id: true,
        installationId: true,
        name: true,
        shiftStart: true,
        shiftEnd: true,
        requiredGuards: true,
      },
      orderBy: { name: "asc" },
    });

    // Get all active guard assignments
    const asignaciones = await prisma.opsAsignacionGuardia.findMany({
      where: {
        tenantId: ctx.tenantId,
        installationId: { in: installationIds },
        isActive: true,
      },
      select: {
        puestoId: true,
        slotNumber: true,
        installationId: true,
      },
    });

    // Check which installations have pauta entries for this month
    const pautaCounts = await prisma.opsPautaMensual.groupBy({
      by: ["installationId"],
      where: {
        tenantId: ctx.tenantId,
        installationId: { in: installationIds },
        date: { gte: start, lte: end },
      },
      _count: { id: true },
    });

    // Check PPC: slots with shiftCode "T" but no plannedGuardiaId
    const ppcCounts = await prisma.opsPautaMensual.groupBy({
      by: ["installationId"],
      where: {
        tenantId: ctx.tenantId,
        installationId: { in: installationIds },
        date: { gte: start, lte: end },
        shiftCode: "T",
        plannedGuardiaId: null,
      },
      _count: { id: true },
    });

    // Check painted series: slots with shiftCode not null (has been painted)
    const paintedCounts = await prisma.opsPautaMensual.groupBy({
      by: ["installationId"],
      where: {
        tenantId: ctx.tenantId,
        installationId: { in: installationIds },
        date: { gte: start, lte: end },
        shiftCode: { not: null },
      },
      _count: { id: true },
    });

    // Build lookup maps
    const pautaCountMap = new Map(pautaCounts.map((p) => [p.installationId, p._count.id]));
    const ppcCountMap = new Map(ppcCounts.map((p) => [p.installationId, p._count.id]));
    const paintedCountMap = new Map(paintedCounts.map((p) => [p.installationId, p._count.id]));

    // Build per-installation summary
    const summary = installations.map((inst) => {
      const instPuestos = puestos.filter((p) => p.installationId === inst.id);
      const instAsignaciones = asignaciones.filter((a) => a.installationId === inst.id);

      // Calculate total required guards (sum of requiredGuards across puestos)
      const totalRequired = instPuestos.reduce((sum, p) => sum + p.requiredGuards, 0);

      // Count unique assigned slots
      const assignedSlots = new Set(
        instAsignaciones.map((a) => `${a.puestoId}|${a.slotNumber}`)
      ).size;

      const pautaCount = pautaCountMap.get(inst.id) ?? 0;
      const ppcCount = ppcCountMap.get(inst.id) ?? 0;
      const paintedCount = paintedCountMap.get(inst.id) ?? 0;

      // Status determination
      let status: "sin_crear" | "sin_pintar" | "incompleta" | "completa" = "sin_crear";
      if (pautaCount > 0) {
        if (paintedCount === 0) {
          status = "sin_pintar";
        } else if (assignedSlots < totalRequired || ppcCount > 0) {
          status = "incompleta";
        } else {
          status = "completa";
        }
      }

      return {
        id: inst.id,
        name: inst.name,
        clientName: inst.account?.name ?? "Sin cliente",
        clientId: inst.account?.id ?? null,
        puestos: instPuestos.map((p) => {
          const h = parseInt(p.shiftStart.split(":")[0], 10);
          const isNight = h >= 18 || h < 6;
          const puestoAsigs = instAsignaciones.filter((a) => a.puestoId === p.id);
          return {
            id: p.id,
            name: p.name,
            shiftStart: p.shiftStart,
            shiftEnd: p.shiftEnd,
            isNight,
            requiredGuards: p.requiredGuards,
            assignedGuards: new Set(puestoAsigs.map((a) => `${a.puestoId}|${a.slotNumber}`)).size,
          };
        }),
        totalPuestos: instPuestos.length,
        totalRequired,
        assignedSlots,
        vacantes: Math.max(0, totalRequired - assignedSlots),
        hasPauta: pautaCount > 0,
        hasPainted: paintedCount > 0,
        ppcCount,
        status,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        month,
        year,
        installations: summary,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo obtener el resumen";
    console.error("[OPS] Error fetching pauta resumen:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
