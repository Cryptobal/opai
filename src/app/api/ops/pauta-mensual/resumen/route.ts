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

    const puestoRequiredById = new Map(puestos.map((p) => [p.id, p.requiredGuards]));
    const validAsignaciones = asignaciones.filter((a) => {
      const required = puestoRequiredById.get(a.puestoId);
      return typeof required === "number" && a.slotNumber >= 1 && a.slotNumber <= required;
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

    // PPC: Get distinct puesto+slot pairs that have at least one work day ("T") in the month
    // We'll cross-reference with OpsAsignacionGuardia to find which ones lack a real guard
    const slotsWithWorkDays = await prisma.opsPautaMensual.findMany({
      where: {
        tenantId: ctx.tenantId,
        installationId: { in: installationIds },
        date: { gte: start, lte: end },
        shiftCode: "T",
      },
      select: {
        installationId: true,
        puestoId: true,
        slotNumber: true,
      },
      distinct: ["installationId", "puestoId", "slotNumber"],
    });

    // Also get slots with V/L/P (need temporary coverage regardless of assignment)
    const slotsWithVLP = await prisma.opsPautaMensual.findMany({
      where: {
        tenantId: ctx.tenantId,
        installationId: { in: installationIds },
        date: { gte: start, lte: end },
        shiftCode: { in: ["V", "L", "P"] },
      },
      select: {
        installationId: true,
        puestoId: true,
        slotNumber: true,
      },
      distinct: ["installationId", "puestoId", "slotNumber"],
    });

    // Build a set of assigned slots for fast lookup
    const assignedSlotSet = new Set(
      validAsignaciones.map((a) => `${a.installationId}|${a.puestoId}|${a.slotNumber}`)
    );

    // PPC per installation:
    // 1. Slots with work days ("T") that don't have an active OpsAsignacionGuardia
    // 2. Plus slots with V/L/P (need temporary coverage)
    const ppcPerInstallation = new Map<string, number>();

    for (const slot of slotsWithWorkDays) {
      const key = `${slot.installationId}|${slot.puestoId}|${slot.slotNumber}`;
      if (!assignedSlotSet.has(key)) {
        ppcPerInstallation.set(
          slot.installationId,
          (ppcPerInstallation.get(slot.installationId) ?? 0) + 1
        );
      }
    }

    // Add V/L/P slots (these always count as PPC since they need replacement coverage)
    const vlpCounted = new Set<string>();
    for (const slot of slotsWithVLP) {
      const slotKey = `${slot.installationId}|${slot.puestoId}|${slot.slotNumber}`;
      // Don't double-count if already counted as unassigned
      if (!vlpCounted.has(slotKey) && assignedSlotSet.has(slotKey)) {
        vlpCounted.add(slotKey);
        ppcPerInstallation.set(
          slot.installationId,
          (ppcPerInstallation.get(slot.installationId) ?? 0) + 1
        );
      }
    }

    // Build lookup maps
    const pautaCountMap = new Map(pautaCounts.map((p) => [p.installationId, p._count.id]));
    const paintedCountMap = new Map(paintedCounts.map((p) => [p.installationId, p._count.id]));

    // Build per-installation summary
    const summary = installations.map((inst) => {
      const instPuestos = puestos.filter((p) => p.installationId === inst.id);
      const instAsignaciones = validAsignaciones.filter((a) => a.installationId === inst.id);

      // Calculate total required guards (sum of requiredGuards across puestos)
      const totalRequired = instPuestos.reduce((sum, p) => sum + p.requiredGuards, 0);

      // Count unique assigned slots
      const assignedSlots = new Set(
        instAsignaciones.map((a) => `${a.puestoId}|${a.slotNumber}`)
      ).size;

      const pautaCount = pautaCountMap.get(inst.id) ?? 0;
      const ppcCount = ppcPerInstallation.get(inst.id) ?? 0;
      const paintedCount = paintedCountMap.get(inst.id) ?? 0;

      // Status determination
      // - sin_crear: no pauta entries at all
      // - sin_pintar: pauta entries exist but no series painted
      // - incompleta: has vacancies (slots without guards) or PPC issues
      // - completa: all slots assigned and no PPC
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
