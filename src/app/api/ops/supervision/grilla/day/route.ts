import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { requireTenantModule } from "@/lib/require-module";
import { canView, hasCapability } from "@/lib/permissions";
import { INCIDENTE_TICKET_SLUG } from "@/lib/incidentes-instalacion/constants";
import {
  dayRangeChile,
  mapIncident,
  mapVisit,
  parseShiftFilter,
  visitMatchesShift,
} from "@/lib/supervision-grilla";

export async function GET(request: NextRequest) {
  const modCheck = await requireTenantModule("ops_supervision");
  if (!modCheck.authorized) return modCheck.response;
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops", "supervision")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const sp = request.nextUrl.searchParams;
    const installationId = sp.get("installationId") ?? "";
    const year = parseInt(sp.get("year") ?? "", 10);
    const month = parseInt(sp.get("month") ?? "", 10);
    const day = parseInt(sp.get("day") ?? "", 10);
    const shift = parseShiftFilter(sp.get("shift"));
    if (!installationId || !year || !month || !day) {
      return NextResponse.json(
        { success: false, error: "installationId, year, month y day requeridos" },
        { status: 400 },
      );
    }

    const canViewAll = hasCapability(perms, "supervision_view_all");
    const installation = await prisma.crmInstallation.findFirst({
      where: { id: installationId, tenantId: ctx.tenantId },
      select: { id: true, name: true },
    });
    if (!installation) {
      return NextResponse.json({ success: false, error: "Instalación no encontrada" }, { status: 404 });
    }

    if (!canViewAll) {
      const assigned = await prisma.opsAsignacionSupervisor.findFirst({
        where: {
          tenantId: ctx.tenantId,
          supervisorId: ctx.userId,
          installationId,
          isActive: true,
        },
        select: { id: true },
      });
      if (!assigned) {
        return NextResponse.json({ success: false, error: "Instalación no encontrada" }, { status: 404 });
      }
    }

    const { start, end } = dayRangeChile(year, month, day);
    const supervisorFilter = canViewAll ? {} : { supervisorId: ctx.userId };

    const visitas = await prisma.opsVisitaSupervision.findMany({
      where: {
        tenantId: ctx.tenantId,
        installationId,
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
      orderBy: { checkInAt: "asc" },
    });

    const mappedVisits = visitas
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
            findingCount: 0,
          },
          year,
          month,
        ),
      )
      .filter((v): v is NonNullable<typeof v> => v != null)
      .filter((v) => visitMatchesShift(v.shift, shift));

    const visitIds = mappedVisits.map((v) => v.id);
    let findings: Array<{
      id: string;
      visitId: string;
      category: string;
      severity: string;
      description: string;
      status: string;
    }> = [];
    try {
      if (visitIds.length > 0) {
        findings = await prisma.opsSupervisionFinding.findMany({
          where: { tenantId: ctx.tenantId, visitId: { in: visitIds } },
          select: {
            id: true,
            visitId: true,
            category: true,
            severity: true,
            description: true,
            status: true,
          },
          orderBy: { createdAt: "desc" },
        });
      }
    } catch {
      findings = [];
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
          installationId,
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
        orderBy: { createdAt: "asc" },
      });
    } catch {
      incidentRows = [];
    }

    const incidents = incidentRows
      .map((row) => mapIncident(row, year, month))
      .filter((row): row is NonNullable<typeof row> => row != null)
      .filter((row) => visitMatchesShift(row.shift, shift));

    const findingsByVisit = new Map<string, typeof findings>();
    for (const f of findings) {
      const list = findingsByVisit.get(f.visitId) ?? [];
      list.push(f);
      findingsByVisit.set(f.visitId, list);
    }

    return NextResponse.json({
      success: true,
      data: {
        installation,
        year,
        month,
        day,
        visits: mappedVisits.map((v) => ({
          ...v,
          findingCount: findingsByVisit.get(v.id)?.length ?? 0,
          findings: findingsByVisit.get(v.id) ?? [],
        })),
        incidents,
        findings,
      },
    });
  } catch (error) {
    console.error("[API] supervision/grilla/day GET error:", error);
    return NextResponse.json(
      { success: false, error: "Error cargando el día" },
      { status: 500 },
    );
  }
}
