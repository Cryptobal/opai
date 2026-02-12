import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess, parseDateOnly, toISODate, getMonthDateRange } from "@/lib/ops";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const installationId = request.nextUrl.searchParams.get("installationId") || undefined;
    const dateRaw = request.nextUrl.searchParams.get("date") || toISODate(new Date());
    const rangeMode = request.nextUrl.searchParams.get("range") || "day"; // "day" or "month"
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

    // PPC from pauta mensual: slots without plannedGuardiaId
    // OR slots with shiftCode V, L, P (vacaciones, licencia, permiso → need coverage)
    const ppcFromPauta = await prisma.opsPautaMensual.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(installationId && installationId !== "all" ? { installationId } : {}),
        date: dateFilter,
        puesto: { active: true },
        OR: [
          // No guard assigned (shiftCode can be null or any value except "-" which is rest day)
          { plannedGuardiaId: null, shiftCode: null },
          { plannedGuardiaId: null, shiftCode: { notIn: ["-"] } },
          // Special statuses that need coverage
          { shiftCode: { in: ["V", "L", "P"] } },
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
    });

    // Map to PPC items
    const ppcItems = ppcFromPauta.map((item) => ({
      id: item.id,
      date: item.date,
      slotNumber: item.slotNumber,
      shiftCode: item.shiftCode,
      reason: !item.plannedGuardiaId
        ? "sin_guardia"
        : item.shiftCode === "V"
          ? "vacaciones"
          : item.shiftCode === "L"
            ? "licencia"
            : item.shiftCode === "P"
              ? "permiso"
              : "sin_guardia",
      installation: item.installation,
      puesto: item.puesto,
      plannedGuardia: item.plannedGuardia,
    }));

    return NextResponse.json({
      success: true,
      data: {
        date: dateRaw,
        range: rangeMode,
        total: ppcItems.length,
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
