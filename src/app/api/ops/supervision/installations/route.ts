import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView, hasCapability } from "@/lib/permissions";

/**
 * GET /api/ops/supervision/installations
 * Lista instalaciones asignadas al supervisor (sin requerir lat/lng).
 * Usado para poblar el selector de instalación en "Nueva visita".
 */
export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canView(perms, "ops", "supervision")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para supervisión" },
        { status: 403 },
      );
    }

    const canViewAll = hasCapability(perms, "supervision_view_all");
    let installationIds: string[] | undefined;
    if (!canViewAll) {
      const assignments = await prisma.opsAsignacionSupervisor.findMany({
        where: {
          tenantId: ctx.tenantId,
          supervisorId: ctx.userId,
          isActive: true,
        },
        select: { installationId: true },
      });
      installationIds = assignments.map((a) => a.installationId);
      if (installationIds.length === 0) {
        return NextResponse.json({ success: true, data: [] });
      }
    }

    const installations = await prisma.crmInstallation.findMany({
      where: {
        tenantId: ctx.tenantId,
        isActive: true,
        ...(installationIds ? { id: { in: installationIds } } : {}),
      },
      select: {
        id: true,
        name: true,
        address: true,
        commune: true,
        city: true,
        lat: true,
        lng: true,
        geoRadiusM: true,
      },
      orderBy: { name: "asc" },
      take: 300,
    });

    const data = installations.map((inst) => ({
      id: inst.id,
      name: inst.name,
      address: inst.address,
      commune: inst.commune,
      city: inst.city,
      geoRadiusM: inst.geoRadiusM,
      distanceM: null as number | null,
      insideGeofence: null as boolean | null,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[OPS][SUPERVISION] Error listing assigned installations:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron obtener las instalaciones" },
      { status: 500 },
    );
  }
}
