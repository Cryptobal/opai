import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess, parseDateOnly, toISODate, getMonthDateRange } from "@/lib/ops";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const installationId = request.nextUrl.searchParams.get("installationId") || undefined;
    const dateRaw = request.nextUrl.searchParams.get("date") || toISODate(new Date());
    const rangeMode = request.nextUrl.searchParams.get("range") || "day";
    const date = parseDateOnly(dateRaw);

    let dateFilter: { gte: Date; lte: Date };
    if (rangeMode === "month") {
      const month = date.getUTCMonth() + 1;
      const year = date.getUTCFullYear();
      const range = getMonthDateRange(year, month);
      dateFilter = { gte: range.start, lte: range.end };
    } else {
      dateFilter = { gte: date, lte: date };
    }

    const instFilter = installationId && installationId !== "all"
      ? { installationId }
      : {};

    const [ppcFromPauta, totalGuards] = await Promise.all([
      prisma.opsPautaMensual.findMany({
        where: {
          tenantId: ctx.tenantId,
          ...instFilter,
          date: dateFilter,
          puesto: { active: true },
          OR: [
            { plannedGuardiaId: null, shiftCode: null },
            { plannedGuardiaId: null, shiftCode: { notIn: ["-"] } },
            { shiftCode: { in: ["V", "L", "P", "PCG", "PSG"] } },
          ],
        },
        include: {
          installation: { select: { id: true, name: true } },
          puesto: { select: { id: true, name: true, shiftStart: true, shiftEnd: true } },
          plannedGuardia: {
            select: {
              id: true,
              code: true,
              persona: { select: { firstName: true, lastName: true } },
            },
          },
        },
        orderBy: [{ date: "asc" }, { installation: { name: "asc" } }, { puesto: { name: "asc" } }],
      }),
      prisma.opsGuardia.count({
        where: { tenantId: ctx.tenantId, status: "active" },
      }),
    ]);

    const byReason: Record<string, number> = {
      sin_guardia: 0,
      vacaciones: 0,
      licencia: 0,
      permiso: 0,
    };

    const ppcItems = ppcFromPauta.map((item) => {
      const reason = !item.plannedGuardiaId
        ? "sin_guardia"
        : item.shiftCode === "V"
          ? "vacaciones"
          : item.shiftCode === "L"
            ? "licencia"
            : (item.shiftCode === "P" || item.shiftCode === "PCG" || item.shiftCode === "PSG")
              ? "permiso"
              : "sin_guardia";
      byReason[reason] = (byReason[reason] || 0) + 1;
      return {
        id: item.id,
        date: item.date,
        slotNumber: item.slotNumber,
        shiftCode: item.shiftCode,
        reason,
        installation: item.installation,
        puesto: item.puesto,
        plannedGuardia: item.plannedGuardia,
      };
    });

    const totalPpc = ppcItems.length;
    const ppcPercentage = totalGuards > 0
      ? Math.round((totalPpc / totalGuards) * 10000) / 100
      : 0;

    return NextResponse.json({
      success: true,
      data: {
        date: dateRaw,
        range: rangeMode,
        total: totalPpc,
        totalGuards,
        ppcPercentage,
        byReason,
        items: ppcItems,
      },
    });
  } catch (error) {
    console.error("[OPS] Error listing PPC:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener la lista de puestos por cubrir" },
      { status: 500 }
    );
  }
}
