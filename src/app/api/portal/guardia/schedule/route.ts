import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { GuardScheduleDay } from "@/lib/guard-portal";
import { SHIFT_CODE_LABELS } from "@/lib/guard-portal";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const guardiaId = searchParams.get("guardiaId");
    const month = searchParams.get("month"); // e.g. "2026-02"

    if (!guardiaId) {
      return NextResponse.json(
        { success: false, error: "guardiaId es requerido" },
        { status: 400 },
      );
    }

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { success: false, error: "month es requerido (formato YYYY-MM)" },
        { status: 400 },
      );
    }

    const [yearStr, monthStr] = month.split("-");
    const year = parseInt(yearStr, 10);
    const monthNum = parseInt(monthStr, 10);

    // Build date range for the month
    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 0); // last day of month

    // Query pauta entries for this guard and month
    const pautas = await prisma.opsPautaMensual.findMany({
      where: {
        plannedGuardiaId: guardiaId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        installation: { select: { name: true } },
        puesto: { select: { shiftStart: true, shiftEnd: true } },
      },
      orderBy: { date: "asc" },
    });

    // Build a map of date -> pauta entry
    const pautaMap = new Map<string, typeof pautas[number]>();
    for (const p of pautas) {
      const dateStr = p.date instanceof Date
        ? p.date.toISOString().split("T")[0]
        : String(p.date).split("T")[0];
      // If multiple entries for same date, keep the first (or latest)
      if (!pautaMap.has(dateStr)) {
        pautaMap.set(dateStr, p);
      }
    }

    // Generate days for the full month
    const daysInMonth = endDate.getDate();
    const data: GuardScheduleDay[] = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(monthNum).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const pauta = pautaMap.get(dateStr);

      if (pauta) {
        const shiftCode = pauta.shiftCode ?? "T";
        const turno =
          pauta.puesto
            ? `${pauta.puesto.shiftStart}-${pauta.puesto.shiftEnd}`
            : null;

        data.push({
          date: dateStr,
          shiftCode,
          shiftLabel: SHIFT_CODE_LABELS[shiftCode]?.label ?? shiftCode,
          installationName: pauta.installation?.name ?? null,
          turno: shiftCode === "T" ? turno : null,
        });
      } else {
        // No pauta entry = not scheduled (show as rest/unassigned)
        data.push({
          date: dateStr,
          shiftCode: "-",
          shiftLabel: SHIFT_CODE_LABELS["-"]?.label ?? "Sin asignar",
          installationName: null,
          turno: null,
        });
      }
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Portal Guardia] Schedule error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener pauta" },
      { status: 500 },
    );
  }
}
