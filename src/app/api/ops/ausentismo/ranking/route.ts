import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess, parseDateOnly } from "@/lib/ops";
import { formatPersonName } from "@/lib/personas";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const fromRaw = request.nextUrl.searchParams.get("from");
    const toRaw = request.nextUrl.searchParams.get("to");
    const installationId = request.nextUrl.searchParams.get("installationId") || undefined;

    const now = new Date();
    const from = fromRaw ? parseDateOnly(fromRaw) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const to = toRaw ? parseDateOnly(toRaw) : now;

    const baseWhere = {
      tenantId: ctx.tenantId,
      date: { gte: from, lte: to },
      plannedGuardiaId: { not: null } as { not: null },
      ...(installationId && installationId !== "all" ? { installationId } : {}),
    };

    // Get absences (no_asistio) grouped by planned guard
    const absences = await prisma.opsAsistenciaDiaria.groupBy({
      by: ["plannedGuardiaId"],
      where: { ...baseWhere, attendanceStatus: "no_asistio" },
      _count: { id: true },
    });

    // Get total planned shifts per guard
    const planned = await prisma.opsAsistenciaDiaria.groupBy({
      by: ["plannedGuardiaId"],
      where: baseWhere,
      _count: { id: true },
    });

    const plannedMap = new Map<string, number>();
    for (const p of planned) {
      if (p.plannedGuardiaId) plannedMap.set(p.plannedGuardiaId, p._count.id);
    }

    const guardIds = absences
      .filter((a) => a.plannedGuardiaId !== null)
      .map((a) => a.plannedGuardiaId as string);

    if (guardIds.length === 0) {
      // Get total guards with 0 absences
      const totalWithShifts = planned.filter((p) => p.plannedGuardiaId).length;
      return NextResponse.json({
        success: true,
        data: {
          from: from.toISOString().slice(0, 10),
          to: to.toISOString().slice(0, 10),
          totalAbsences: 0,
          totalPlannedShifts: planned.reduce((s, p) => s + p._count.id, 0),
          absenteeismRate: 0,
          guardsWithZeroAbsences: totalWithShifts,
          totalGuardsWithShifts: totalWithShifts,
          rankings: [],
        },
      });
    }

    const guards = await prisma.opsGuardia.findMany({
      where: { id: { in: guardIds }, tenantId: ctx.tenantId },
      select: {
        id: true,
        code: true,
        currentInstallation: { select: { name: true } },
        persona: { select: { firstName: true, lastName: true, rut: true } },
      },
    });

    const guardMap = new Map(guards.map((g) => [g.id, g]));

    // Previous period for trend
    const periodMs = to.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - periodMs);
    const prevTo = new Date(from.getTime() - 1);

    const prevAbsences = await prisma.opsAsistenciaDiaria.groupBy({
      by: ["plannedGuardiaId"],
      where: {
        ...baseWhere,
        date: { gte: prevFrom, lte: prevTo },
        attendanceStatus: "no_asistio",
      },
      _count: { id: true },
    });
    const prevMap = new Map<string, number>();
    for (const p of prevAbsences) {
      if (p.plannedGuardiaId) prevMap.set(p.plannedGuardiaId, p._count.id);
    }

    let totalAbsences = 0;
    const rankings = absences
      .filter((a) => a.plannedGuardiaId !== null)
      .map((a) => {
        const guardiaId = a.plannedGuardiaId as string;
        const guard = guardMap.get(guardiaId);
        const absenceCount = a._count.id;
        const totalShifts = plannedMap.get(guardiaId) ?? 0;
        const rate = totalShifts > 0 ? Math.round((absenceCount / totalShifts) * 10000) / 100 : 0;
        const prevCount = prevMap.get(guardiaId) ?? 0;
        const trendDiff = absenceCount - prevCount;

        totalAbsences += absenceCount;

        return {
          guardiaId,
          name: guard ? formatPersonName(guard.persona.firstName, guard.persona.lastName) : "—",
          rut: guard?.persona.rut ?? "—",
          code: guard?.code ?? null,
          installation: guard?.currentInstallation?.name ?? "—",
          absenceCount,
          totalShifts,
          rate,
          prevCount,
          trendDiff,
        };
      })
      .sort((a, b) => b.absenceCount - a.absenceCount);

    const totalPlannedShifts = planned.reduce((s, p) => s + p._count.id, 0);
    const totalGuardsWithShifts = planned.filter((p) => p.plannedGuardiaId).length;
    const guardsWithZeroAbsences = totalGuardsWithShifts - guardIds.length;

    return NextResponse.json({
      success: true,
      data: {
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
        totalAbsences,
        totalPlannedShifts,
        absenteeismRate: totalPlannedShifts > 0 ? Math.round((totalAbsences / totalPlannedShifts) * 10000) / 100 : 0,
        guardsWithZeroAbsences,
        totalGuardsWithShifts,
        rankings,
      },
    });
  } catch (error) {
    console.error("[OPS] Error fetching absenteeism ranking:", error);
    return NextResponse.json({ success: false, error: "Error obteniendo ranking de ausentismo" }, { status: 500 });
  }
}
