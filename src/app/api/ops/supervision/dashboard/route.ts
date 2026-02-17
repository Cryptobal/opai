import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView, hasCapability } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canView(perms, "ops", "supervision")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para dashboard de supervisión" },
        { status: 403 },
      );
    }

    const sp = request.nextUrl.searchParams;
    const dateFromRaw = sp.get("dateFrom");
    const dateToRaw = sp.get("dateTo");

    const dateTo = dateToRaw ? new Date(`${dateToRaw}T23:59:59.999Z`) : new Date();
    const dateFrom = dateFromRaw
      ? new Date(`${dateFromRaw}T00:00:00.000Z`)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const canViewAll = hasCapability(perms, "supervision_view_all");
    const baseWhere: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      checkInAt: { gte: dateFrom, lte: dateTo },
      ...(canViewAll ? {} : { supervisorId: ctx.userId }),
    };

    const [visitas, assignments] = await Promise.all([
      prisma.opsVisitaSupervision.findMany({
        where: baseWhere,
        select: {
          id: true,
          supervisorId: true,
          installationId: true,
          status: true,
          checkInAt: true,
          checkOutAt: true,
          installationState: true,
        },
      }),
      prisma.opsAsignacionSupervisor.findMany({
        where: {
          tenantId: ctx.tenantId,
          isActive: true,
          ...(canViewAll ? {} : { supervisorId: ctx.userId }),
        },
        select: { installationId: true },
      }),
    ]);

    const totalVisitas = visitas.length;
    const completed = visitas.filter((v) => v.status === "completed");
    const totalCompleted = completed.length;

    const installationVisitedSet = new Set(visitas.map((v) => v.installationId));
    const assignmentInstallationSet = new Set(assignments.map((a) => a.installationId));
    const coveragePct =
      assignmentInstallationSet.size > 0
        ? Math.round((installationVisitedSet.size / assignmentInstallationSet.size) * 100)
        : 0;

    const durationsMin = completed
      .filter((v) => v.checkOutAt)
      .map((v) => Math.max(0, Math.round((v.checkOutAt!.getTime() - v.checkInAt.getTime()) / 60000)));
    const avgDurationMin =
      durationsMin.length > 0
        ? Math.round(durationsMin.reduce((acc, n) => acc + n, 0) / durationsMin.length)
        : 0;

    const byState = visitas.reduce<Record<string, number>>((acc, v) => {
      const key = v.installationState ?? "sin_estado";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    const bySupervisor = visitas.reduce<Record<string, number>>((acc, v) => {
      acc[v.supervisorId] = (acc[v.supervisorId] ?? 0) + 1;
      return acc;
    }, {});

    const byInstallation = visitas.reduce<Record<string, number>>((acc, v) => {
      acc[v.installationId] = (acc[v.installationId] ?? 0) + 1;
      return acc;
    }, {});

    const trendByDay = visitas.reduce<Record<string, number>>((acc, v) => {
      const d = v.checkInAt.toISOString().slice(0, 10);
      acc[d] = (acc[d] ?? 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      success: true,
      data: {
        period: {
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString(),
        },
        totals: {
          visitas: totalVisitas,
          visitasCompleted: totalCompleted,
          instalacionesVisitadas: installationVisitedSet.size,
          instalacionesAsignadas: assignmentInstallationSet.size,
          coveragePct,
          avgDurationMin,
        },
        breakdowns: {
          byState,
          bySupervisor,
          byInstallation,
          trendByDay,
        },
      },
    });
  } catch (error) {
    console.error("[OPS][SUPERVISION] Error building dashboard:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron calcular los KPIs de supervisión" },
      { status: 500 },
    );
  }
}
