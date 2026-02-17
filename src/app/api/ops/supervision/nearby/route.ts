import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { haversineDistance } from "@/lib/marcacion";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView, hasCapability } from "@/lib/permissions";

export async function GET(request: NextRequest) {
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

    const latRaw = request.nextUrl.searchParams.get("lat");
    const lngRaw = request.nextUrl.searchParams.get("lng");
    const maxDistanceRaw = request.nextUrl.searchParams.get("maxDistanceM");
    const maxDistanceM = maxDistanceRaw ? Number(maxDistanceRaw) : 10000;

    if (!latRaw || !lngRaw) {
      return NextResponse.json(
        { success: false, error: "Parámetros lat y lng son requeridos" },
        { status: 400 },
      );
    }

    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json(
        { success: false, error: "Coordenadas inválidas" },
        { status: 400 },
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
      take: 300,
    });

    const data = installations
      .filter((inst) => inst.lat != null && inst.lng != null)
      .map((inst) => {
        const distanceM = Math.round(haversineDistance(lat, lng, inst.lat!, inst.lng!));
        return {
          ...inst,
          distanceM,
          insideGeofence: distanceM <= inst.geoRadiusM,
        };
      })
      .filter((inst) => inst.distanceM <= maxDistanceM)
      .sort((a, b) => a.distanceM - b.distanceM);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[OPS][SUPERVISION] Error listing nearby installations:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron obtener instalaciones cercanas" },
      { status: 500 },
    );
  }
}
