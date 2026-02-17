import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { haversineDistance } from "@/lib/marcacion";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit, canView, hasCapability } from "@/lib/permissions";

const createVisitSchema = z.object({
  installationId: z.string().uuid(),
  lat: z.number(),
  lng: z.number(),
  startedVia: z.enum(["hub", "ops_supervision", "mobile"]).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canView(perms, "ops", "supervision")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para ver visitas de supervisión" },
        { status: 403 },
      );
    }

    const sp = request.nextUrl.searchParams;
    const status = sp.get("status") ?? undefined;
    const installationId = sp.get("installationId") ?? undefined;
    const supervisorId = sp.get("supervisorId") ?? undefined;
    const dateFrom = sp.get("dateFrom") ?? undefined;
    const dateTo = sp.get("dateTo") ?? undefined;
    const onlyMine = sp.get("mine") === "true";
    const canViewAll = hasCapability(perms, "supervision_view_all");

    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      ...(status ? { status } : {}),
      ...(installationId ? { installationId } : {}),
      ...(dateFrom || dateTo
        ? {
            checkInAt: {
              ...(dateFrom ? { gte: new Date(`${dateFrom}T00:00:00.000Z`) } : {}),
              ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
    };

    if (canViewAll && supervisorId) {
      where.supervisorId = supervisorId;
    } else if (onlyMine || !canViewAll) {
      where.supervisorId = ctx.userId;
    }

    const visitas = await prisma.opsVisitaSupervision.findMany({
      where,
      include: {
        installation: {
          select: { id: true, name: true, address: true, commune: true },
        },
        supervisor: {
          select: { id: true, name: true, email: true },
        },
        _count: {
          select: { images: true },
        },
      },
      orderBy: [{ checkInAt: "desc" }],
      take: 200,
    });

    return NextResponse.json({ success: true, data: visitas });
  } catch (error) {
    console.error("[OPS][SUPERVISION] Error listing visits:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron obtener las visitas de supervisión" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canEdit(perms, "ops", "supervision") || !hasCapability(perms, "supervision_checkin")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para iniciar visitas de supervisión" },
        { status: 403 },
      );
    }

    const bodyRaw = await request.json();
    const parsed = createVisitSchema.safeParse(bodyRaw);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const body = parsed.data;

    const installation = await prisma.crmInstallation.findFirst({
      where: {
        id: body.installationId,
        tenantId: ctx.tenantId,
      },
      select: {
        id: true,
        name: true,
        lat: true,
        lng: true,
        geoRadiusM: true,
      },
    });

    if (!installation) {
      return NextResponse.json(
        { success: false, error: "Instalación no encontrada" },
        { status: 404 },
      );
    }

    const canViewAll = hasCapability(perms, "supervision_view_all");
    if (!canViewAll) {
      const assignment = await prisma.opsAsignacionSupervisor.findFirst({
        where: {
          tenantId: ctx.tenantId,
          supervisorId: ctx.userId,
          installationId: body.installationId,
          isActive: true,
        },
      });
      if (!assignment) {
        return NextResponse.json(
          { success: false, error: "No tienes esta instalación asignada para supervisión" },
          { status: 403 },
        );
      }
    }

    let checkInGeoValidada = false;
    let checkInDistanciaM: number | null = null;

    if (installation.lat != null && installation.lng != null) {
      checkInDistanciaM = Math.round(
        haversineDistance(body.lat, body.lng, installation.lat, installation.lng),
      );
      checkInGeoValidada = checkInDistanciaM <= installation.geoRadiusM;
    }

    const visit = await prisma.opsVisitaSupervision.create({
      data: {
        tenantId: ctx.tenantId,
        supervisorId: ctx.userId,
        installationId: body.installationId,
        checkInAt: new Date(),
        checkInLat: body.lat,
        checkInLng: body.lng,
        checkInGeoValidada,
        checkInDistanciaM,
        status: "in_progress",
        startedVia: body.startedVia ?? "ops_supervision",
      },
      include: {
        installation: { select: { id: true, name: true, address: true } },
      },
    });

    return NextResponse.json({ success: true, data: visit }, { status: 201 });
  } catch (error) {
    console.error("[OPS][SUPERVISION] Error creating visit:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo iniciar la visita de supervisión" },
      { status: 500 },
    );
  }
}
