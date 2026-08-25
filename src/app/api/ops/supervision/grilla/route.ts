import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { requireTenantModule } from "@/lib/require-module";
import { canView, hasCapability } from "@/lib/permissions";
import { todayInChile, extractYearMonth } from "@/lib/dates-cl";
import { INCIDENTE_TICKET_SLUG } from "@/lib/incidentes-instalacion/constants";
import {
  mapIncident,
  mapVisit,
  monthRangeChile,
  type GrillaAssignmentWindow,
  type GrillaInstallation,
  type GrillaPayload,
} from "@/lib/supervision-grilla";

function ymdFromDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const modCheck = await requireTenantModule("ops_supervision");
  if (!modCheck.authorized) return modCheck.response;
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
    const nowParts = extractYearMonth(todayInChile());
    const year = parseInt(sp.get("year") ?? String(nowParts.year), 10);
    const month = parseInt(sp.get("month") ?? String(nowParts.month), 10);
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
      return NextResponse.json(
        { success: false, error: "Mes inválido" },
        { status: 400 },
      );
    }

    const canViewAll = hasCapability(perms, "supervision_view_all");
    const supervisorFilter = canViewAll ? {} : { supervisorId: ctx.userId };
    const { start, end, daysInMonth } = monthRangeChile(year, month);

    const assignmentRows = await prisma.opsAsignacionSupervisor.findMany({
      where: {
        tenantId: ctx.tenantId,
        isActive: true,
        ...supervisorFilter,
      },
      select: {
        installationId: true,
        startDate: true,
        endDate: true,
      },
    });
    const installationIds = [...new Set(assignmentRows.map((a) => a.installationId))];

    const empty = (): GrillaPayload => ({
      year,
      month,
      daysInMonth,
      today: nowParts,
      installations: [],
      visits: [],
      incidents: [],
    });

    if (installationIds.length === 0) {
      return NextResponse.json({ success: true, data: empty() });
    }

    const windowsByInst = new Map<string, GrillaAssignmentWindow[]>();
    for (const row of assignmentRows) {
      const list = windowsByInst.get(row.installationId) ?? [];
      list.push({
        start: ymdFromDateOnly(row.startDate),
        end: row.endDate ? ymdFromDateOnly(row.endDate) : null,
      });
      windowsByInst.set(row.installationId, list);
    }

    const installations = await prisma.crmInstallation.findMany({
      where: { id: { in: installationIds }, status: "active" },
      select: { id: true, name: true, nocturnoEnabled: true },
      orderBy: { name: "asc" },
    });
    const activeIds = installations.map((i) => i.id);

    const visitas = activeIds.length === 0
      ? []
      : await prisma.opsVisitaSupervision.findMany({
          where: {
            tenantId: ctx.tenantId,
            installationId: { in: activeIds },
            checkInAt: { gte: start, lte: end },
            status: { in: ["in_progress", "completed"] },
            ...supervisorFilter,
          },
          select: {
            id: true,
            installationId: true,
            checkInAt: true,
            checkOutAt: true,
            checkInGeoValidada: true,
            checkInDistanciaM: true,
            status: true,
            supervisor: { select: { name: true } },
          },
        });

    const visitIds = visitas.map((v) => v.id);
    const findingsByVisit = new Map<string, number>();
    let findingsMap = new Map<string, number>();
    try {
      if (visitIds.length > 0) {
        const byVisit = await prisma.opsSupervisionFinding.groupBy({
          by: ["visitId"],
          where: { tenantId: ctx.tenantId, visitId: { in: visitIds } },
          _count: true,
        });
        for (const row of byVisit) findingsByVisit.set(row.visitId, row._count);
      }
      const openFindings = await prisma.opsSupervisionFinding.groupBy({
        by: ["installationId"],
        where: {
          tenantId: ctx.tenantId,
          installationId: { in: activeIds },
          status: { in: ["open", "in_progress"] },
        },
        _count: true,
      });
      findingsMap = new Map(openFindings.map((f) => [f.installationId, f._count]));
    } catch {
      // Tabla puede no existir aún
    }

    let incidentRows: Array<{
      id: string;
      installationId: string | null;
      createdAt: Date;
      status: string;
      title: string;
      code: string;
    }> = [];
    try {
      incidentRows = await prisma.opsTicket.findMany({
        where: {
          tenantId: ctx.tenantId,
          installationId: { in: activeIds },
          ticketType: { slug: INCIDENTE_TICKET_SLUG },
          createdAt: { gte: start, lte: end },
          status: { not: "cancelled" },
        },
        select: {
          id: true,
          installationId: true,
          createdAt: true,
          status: true,
          title: true,
          code: true,
        },
      });
    } catch {
      // Tipo de ticket puede no existir en tenants viejos
    }

    const mappedInstallations: GrillaInstallation[] = installations.map((i) => ({
      id: i.id,
      name: i.name,
      openFindings: findingsMap.get(i.id) ?? 0,
      nocturnoEnabled: i.nocturnoEnabled,
      assignmentWindows: windowsByInst.get(i.id) ?? [],
    }));

    const data: GrillaPayload = {
      year,
      month,
      daysInMonth,
      today: nowParts,
      installations: mappedInstallations,
      visits: visitas
        .map((v) =>
          mapVisit(
            {
              id: v.id,
              installationId: v.installationId,
              checkInAt: v.checkInAt,
              checkOutAt: v.checkOutAt,
              checkInGeoValidada: v.checkInGeoValidada,
              checkInDistanciaM: v.checkInDistanciaM,
              status: v.status,
              supervisorName: v.supervisor?.name ?? null,
              findingCount: findingsByVisit.get(v.id) ?? 0,
            },
            year,
            month,
          ),
        )
        .filter((v): v is NonNullable<typeof v> => v != null),
      incidents: incidentRows
        .map((row) => mapIncident(row, year, month))
        .filter((row): row is NonNullable<typeof row> => row != null),
    };

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[API] supervision/grilla GET error:", error);
    return NextResponse.json(
      { success: false, error: "Error cargando grilla" },
      { status: 500 },
    );
  }
}
