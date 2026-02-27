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

    // Previous period for trend comparison
    const periodMs = dateTo.getTime() - dateFrom.getTime();
    const prevDateTo = new Date(dateFrom.getTime() - 1);
    const prevDateFrom = new Date(prevDateTo.getTime() - periodMs);
    const prevWhere: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      checkInAt: { gte: prevDateFrom, lte: prevDateTo },
      ...(canViewAll ? {} : { supervisorId: ctx.userId }),
    };

    // Query findings separately — table may not exist before migration
    let openFindings: { id: string; installationId: string; severity: string; createdAt: Date }[] = [];
    try {
      openFindings = await prisma.opsSupervisionFinding.findMany({
        where: {
          tenantId: ctx.tenantId,
          status: { in: ["open", "in_progress"] },
        },
        select: { id: true, installationId: true, severity: true, createdAt: true },
      });
    } catch {
      // Table does not exist yet — gracefully degrade
    }

    const [
      visitas,
      prevVisitas,
      assignments,
      supervisors,
      installations,
    ] = await Promise.all([
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
          durationMinutes: true,
          isExpressFlagged: true,
          ratings: true,
          guardsExpected: true,
          guardsFound: true,
          bookUpToDate: true,
        },
      }),
      prisma.opsVisitaSupervision.findMany({
        where: prevWhere,
        select: { id: true, status: true },
      }),
      prisma.opsAsignacionSupervisor.findMany({
        where: {
          tenantId: ctx.tenantId,
          isActive: true,
          ...(canViewAll ? {} : { supervisorId: ctx.userId }),
        },
        select: { installationId: true, supervisorId: true },
      }),
      canViewAll
        ? prisma.admin.findMany({
            where: { tenantId: ctx.tenantId },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      prisma.crmInstallation.findMany({
        where: {
          tenantId: ctx.tenantId,
          isActive: true,
        },
        select: { id: true, name: true, commune: true },
      }),
    ]);

    // Core KPIs
    const totalVisitas = visitas.length;
    const completed = visitas.filter((v) => v.status === "completed");
    const totalCompleted = completed.length;
    const criticas = visitas.filter((v) => v.installationState === "critico").length;
    const pendientes = visitas.filter((v) => v.status === "in_progress").length;

    // Previous period KPIs for trend
    const prevTotal = prevVisitas.length;
    const prevCompleted = prevVisitas.filter((v) => v.status === "completed").length;
    const trendTotal =
      prevTotal > 0 ? Math.round(((totalVisitas - prevTotal) / prevTotal) * 100) : 0;
    const trendCompleted =
      prevCompleted > 0
        ? Math.round(((totalCompleted - prevCompleted) / prevCompleted) * 100)
        : 0;

    // Duration
    const durationsMin = completed
      .map((v) => v.durationMinutes ?? (v.checkOutAt ? Math.round((v.checkOutAt.getTime() - v.checkInAt.getTime()) / 60000) : null))
      .filter((d): d is number => d !== null);
    const avgDurationMin =
      durationsMin.length > 0
        ? Math.round(durationsMin.reduce((acc, n) => acc + n, 0) / durationsMin.length)
        : 0;

    // Average rating
    const ratedVisits = visitas
      .map((v) => v.ratings as { presentacion?: number; orden?: number; protocolo?: number } | null)
      .filter((r): r is { presentacion: number; orden: number; protocolo: number } =>
        r !== null &&
        typeof r.presentacion === "number" &&
        typeof r.orden === "number" &&
        typeof r.protocolo === "number",
      );
    const avgRating =
      ratedVisits.length > 0
        ? Math.round(
            (ratedVisits.reduce(
              (s, r) => s + (r.presentacion + r.orden + r.protocolo) / 3,
              0,
            ) /
              ratedVisits.length) *
              10,
          ) / 10
        : null;

    // Average ratings breakdown
    const avgPresentation = ratedVisits.length > 0
      ? Math.round(ratedVisits.reduce((s, r) => s + r.presentacion, 0) / ratedVisits.length * 10) / 10
      : null;
    const avgOrder = ratedVisits.length > 0
      ? Math.round(ratedVisits.reduce((s, r) => s + r.orden, 0) / ratedVisits.length * 10) / 10
      : null;
    const avgProtocol = ratedVisits.length > 0
      ? Math.round(ratedVisits.reduce((s, r) => s + r.protocolo, 0) / ratedVisits.length * 10) / 10
      : null;

    // Coverage
    const installationVisitedSet = new Set(visitas.map((v) => v.installationId));
    const assignmentInstallationSet = new Set(assignments.map((a) => a.installationId));
    const coveragePct =
      assignmentInstallationSet.size > 0
        ? Math.round((installationVisitedSet.size / assignmentInstallationSet.size) * 100)
        : 0;

    // Weekly trend (last 8 weeks)
    const weeklyTrend: { week: string; completed: number; pending: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const weekStart = new Date(dateTo);
      weekStart.setDate(weekStart.getDate() - (i + 1) * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      const weekVisits = visitas.filter(
        (v) => v.checkInAt >= weekStart && v.checkInAt < weekEnd,
      );
      const weekLabel = `S${8 - i}`;
      weeklyTrend.push({
        week: weekLabel,
        completed: weekVisits.filter((v) => v.status === "completed").length,
        pending: weekVisits.filter((v) => v.status !== "completed").length,
      });
    }

    // Alerts
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Installations without visit > 7 days
    const installationMap = new Map(installations.map((i) => [i.id, i]));
    const lastVisitByInstallation = new Map<string, Date>();
    for (const v of visitas) {
      const existing = lastVisitByInstallation.get(v.installationId);
      if (!existing || v.checkInAt > existing) {
        lastVisitByInstallation.set(v.installationId, v.checkInAt);
      }
    }

    const noVisitInstallations = Array.from(assignmentInstallationSet)
      .filter((id) => {
        const lastVisit = lastVisitByInstallation.get(id);
        return !lastVisit || lastVisit < sevenDaysAgo;
      })
      .map((id) => {
        const inst = installationMap.get(id);
        const lastVisit = lastVisitByInstallation.get(id);
        const daysSince = lastVisit
          ? Math.floor((now.getTime() - lastVisit.getTime()) / (24 * 60 * 60 * 1000))
          : null;
        return {
          id,
          name: inst?.name ?? "Desconocida",
          commune: inst?.commune ?? null,
          daysSinceVisit: daysSince,
        };
      })
      .sort((a, b) => (b.daysSinceVisit ?? 999) - (a.daysSinceVisit ?? 999));

    // Express visits
    const expressVisits = visitas
      .filter((v) => v.isExpressFlagged)
      .map((v) => ({
        id: v.id,
        installationId: v.installationId,
        installationName: installationMap.get(v.installationId)?.name ?? "—",
        date: v.checkInAt.toISOString().slice(0, 10),
        durationMinutes: v.durationMinutes,
      }));

    // By supervisor (with names)
    const bySupervisorMap = visitas.reduce<Record<string, { count: number; rated: number; avgRating: number; totalDuration: number; completedCount: number }>>((acc, v) => {
      if (!acc[v.supervisorId]) {
        acc[v.supervisorId] = { count: 0, rated: 0, avgRating: 0, totalDuration: 0, completedCount: 0 };
      }
      acc[v.supervisorId].count++;
      if (v.status === "completed") {
        acc[v.supervisorId].completedCount++;
        if (v.durationMinutes) acc[v.supervisorId].totalDuration += v.durationMinutes;
      }
      const r = v.ratings as { presentacion?: number; orden?: number; protocolo?: number } | null;
      if (r && typeof r.presentacion === "number") {
        acc[v.supervisorId].rated++;
        acc[v.supervisorId].avgRating += (r.presentacion + (r.orden ?? 0) + (r.protocolo ?? 0)) / 3;
      }
      return acc;
    }, {});

    const supervisorNameMap = new Map(supervisors.map((s) => [s.id, s.name]));
    const bySupervisor = Object.entries(bySupervisorMap).map(([id, data]) => ({
      supervisorId: id,
      name: supervisorNameMap.get(id) ?? "—",
      visits: data.count,
      avgRating: data.rated > 0 ? Math.round((data.avgRating / data.rated) * 10) / 10 : null,
      avgDuration: data.completedCount > 0 ? Math.round(data.totalDuration / data.completedCount) : null,
    }));

    // By state
    const byState = visitas.reduce<Record<string, number>>((acc, v) => {
      const key = v.installationState ?? "sin_estado";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    // Trend by day
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
          criticas,
          pendientes,
          instalacionesVisitadas: installationVisitedSet.size,
          instalacionesAsignadas: assignmentInstallationSet.size,
          coveragePct,
          avgDurationMin,
          avgRating,
          trendTotal,
          trendCompleted,
        },
        ratings: {
          avgPresentation,
          avgOrder,
          avgProtocol,
        },
        weeklyTrend,
        alerts: {
          noVisitInstallations,
          expressVisits,
          openFindingsCount: openFindings.length,
          overdueFindingsCount: openFindings.filter(
            (f) =>
              f.createdAt < new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
          ).length,
        },
        breakdowns: {
          byState,
          bySupervisor,
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
