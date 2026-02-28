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

    // Use explicit select to avoid referencing columns that may not exist
    // before migration 20260401000000_supervision_module_refactor is applied.
    const safeVisitSelect = {
      id: true,
      tenantId: true,
      supervisorId: true,
      installationId: true,
      checkInAt: true,
      checkInLat: true,
      checkInLng: true,
      checkInGeoValidada: true,
      checkInDistanciaM: true,
      checkOutAt: true,
      status: true,
      generalComments: true,
      guardsCounted: true,
      installationState: true,
      ratings: true,
      startedVia: true,
      createdAt: true,
      updatedAt: true,
    } as const;

    let visitas;
    try {
      visitas = await prisma.opsVisitaSupervision.findMany({
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
    } catch {
      // Fallback: use select with only pre-migration columns
      const safe = await prisma.opsVisitaSupervision.findMany({
        where,
        select: {
          ...safeVisitSelect,
          installation: {
            select: { id: true, name: true, address: true, commune: true },
          },
          supervisor: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: [{ checkInAt: "desc" }],
        take: 200,
      });
      visitas = safe.map((v) => ({ ...v, _count: { images: 0 } }));
    }

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

    // Use select (not include) to avoid RETURNING new columns that may
    // not exist before the supervision_module_refactor migration is applied.
    let visit;
    const now = new Date();
    try {
      visit = await prisma.opsVisitaSupervision.create({
        data: {
          tenantId: ctx.tenantId,
          supervisorId: ctx.userId,
          installationId: body.installationId,
          checkInAt: now,
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
    } catch {
      // Prisma's INSERT references new columns with @default (client_contacted,
      // wizard_step, etc.) even when not in data. Use raw SQL as fallback.
      const rows = await prisma.$queryRaw<{ id: string }[]>`
        INSERT INTO "ops"."visitas_supervision"
          ("id", "tenant_id", "supervisor_id", "installation_id",
           "check_in_at", "check_in_lat", "check_in_lng",
           "check_in_geo_validada", "check_in_distancia_m",
           "status", "started_via", "created_at", "updated_at")
        VALUES
          (uuid_generate_v4(), ${ctx.tenantId}, ${ctx.userId}, ${body.installationId},
           ${now}, ${body.lat}, ${body.lng},
           ${checkInGeoValidada}, ${checkInDistanciaM},
           'in_progress', ${body.startedVia ?? "ops_supervision"}, ${now}, ${now})
        RETURNING "id"
      `;
      const newId = rows[0].id;
      visit = {
        id: newId,
        tenantId: ctx.tenantId,
        supervisorId: ctx.userId,
        installationId: body.installationId,
        checkInAt: now,
        checkInGeoValidada,
        checkInDistanciaM,
        status: "in_progress",
        startedVia: body.startedVia ?? "ops_supervision",
        createdAt: now,
        installation: { id: installation.id, name: installation.name, address: null },
      };
    }

    return NextResponse.json({ success: true, data: visit }, { status: 201 });
  } catch (error) {
    console.error("[OPS][SUPERVISION] Error creating visit:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo iniciar la visita de supervisión" },
      { status: 500 },
    );
  }
}
