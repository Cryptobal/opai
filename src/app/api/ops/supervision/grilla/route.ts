import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView, hasCapability } from "@/lib/permissions";

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canView(perms, "ops", "supervision")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }

    const sp = request.nextUrl.searchParams;
    const now = new Date();
    const year = parseInt(sp.get("year") ?? String(now.getFullYear()));
    const month = parseInt(sp.get("month") ?? String(now.getMonth() + 1));

    const canViewAll = hasCapability(perms, "supervision_view_all");
    const supervisorFilter = canViewAll ? {} : { supervisorId: ctx.userId };

    // Date bounds for the month
    const dateFrom = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const daysInMonth = new Date(year, month, 0).getDate();
    const dateTo = new Date(Date.UTC(year, month - 1, daysInMonth, 23, 59, 59, 999));

    // 1. Get assigned installation IDs
    const assignments = await prisma.opsAsignacionSupervisor.findMany({
      where: {
        tenantId: ctx.tenantId,
        isActive: true,
        ...supervisorFilter,
      },
      select: { installationId: true },
    });
    const installationIds = [...new Set(assignments.map((a) => a.installationId))];

    if (installationIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          year,
          month,
          daysInMonth,
          installations: [],
          visitsByInstallationDay: {},
        },
      });
    }

    // 2. Fetch installations sorted A-Z
    const installations = await prisma.crmInstallation.findMany({
      where: { id: { in: installationIds }, status: "active" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    // 3. Fetch visits for the month
    const visitas = await prisma.opsVisitaSupervision.findMany({
      where: {
        tenantId: ctx.tenantId,
        installationId: { in: installationIds },
        checkInAt: { gte: dateFrom, lte: dateTo },
        ...supervisorFilter,
      },
      select: {
        installationId: true,
        checkInAt: true,
        supervisor: { select: { name: true } },
      },
    });

    // 4. Fetch open findings per installation
    let findingsMap = new Map<string, number>();
    try {
      const findingsRaw = await prisma.opsSupervisionFinding.groupBy({
        by: ["installationId"],
        where: {
          tenantId: ctx.tenantId,
          installationId: { in: installationIds },
          status: { in: ["open", "in_progress"] },
        },
        _count: true,
      });
      findingsMap = new Map(findingsRaw.map((f) => [f.installationId, f._count]));
    } catch {
      // Table may not exist yet — degrade gracefully
    }

    // 5. Build visits by installation×day
    const visitMap: Record<string, Record<number, string[]>> = {};
    for (const v of visitas) {
      const day = new Date(v.checkInAt).getUTCDate();
      const instMap = (visitMap[v.installationId] ??= {});
      const supervisors = (instMap[day] ??= []);
      if (v.supervisor?.name) supervisors.push(v.supervisor.name);
    }

    const visitsByInstallationDay: Record<
      string,
      Record<number, { count: number; supervisors: string[]; initials: string }>
    > = {};
    for (const [instId, days] of Object.entries(visitMap)) {
      visitsByInstallationDay[instId] = {};
      for (const [dayStr, supervisors] of Object.entries(days)) {
        const day = Number(dayStr);
        visitsByInstallationDay[instId][day] = {
          count: supervisors.length,
          supervisors,
          initials: supervisors.length === 1 ? getInitials(supervisors[0]) : "",
        };
      }
    }

    const totalVisitsMap: Record<string, number> = {};
    for (const [instId, days] of Object.entries(visitMap)) {
      totalVisitsMap[instId] = Object.values(days).reduce((sum, sups) => sum + sups.length, 0);
    }

    return NextResponse.json({
      success: true,
      data: {
        year,
        month,
        daysInMonth,
        installations: installations.map((i) => ({
          id: i.id,
          name: i.name,
          openFindings: findingsMap.get(i.id) ?? 0,
          totalVisits: totalVisitsMap[i.id] ?? 0,
        })),
        visitsByInstallationDay,
      },
    });
  } catch (error) {
    console.error("[API] supervision/grilla GET error:", error);
    return NextResponse.json(
      { success: false, error: "Error cargando grilla" },
      { status: 500 },
    );
  }
}
