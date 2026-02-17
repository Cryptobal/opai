import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { haversineDistance } from "@/lib/marcacion";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit, hasCapability } from "@/lib/permissions";

type Params = { id: string };

const checkoutSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  completedVia: z.enum(["hub", "ops_supervision", "mobile"]).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canEdit(perms, "ops", "supervision") || !hasCapability(perms, "supervision_checkin")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para cerrar visitas de supervisión" },
        { status: 403 },
      );
    }

    const { id } = await params;
    const canViewAll = hasCapability(perms, "supervision_view_all");
    const visit = await prisma.opsVisitaSupervision.findFirst({
      where: {
        id,
        tenantId: ctx.tenantId,
        ...(canViewAll ? {} : { supervisorId: ctx.userId }),
      },
      include: {
        installation: {
          select: { lat: true, lng: true, geoRadiusM: true },
        },
      },
    });

    if (!visit) {
      return NextResponse.json(
        { success: false, error: "Visita no encontrada" },
        { status: 404 },
      );
    }

    if (visit.status === "completed") {
      return NextResponse.json(
        { success: false, error: "La visita ya está cerrada" },
        { status: 409 },
      );
    }

    const bodyRaw = await request.json();
    const parsed = checkoutSchema.safeParse(bodyRaw);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const body = parsed.data;

    let checkOutGeoValidada: boolean | null = null;
    let checkOutDistanciaM: number | null = null;

    if (visit.installation.lat != null && visit.installation.lng != null) {
      checkOutDistanciaM = Math.round(
        haversineDistance(body.lat, body.lng, visit.installation.lat, visit.installation.lng),
      );
      checkOutGeoValidada = checkOutDistanciaM <= visit.installation.geoRadiusM;
    }

    const updated = await prisma.opsVisitaSupervision.update({
      where: { id: visit.id },
      data: {
        checkOutAt: new Date(),
        checkOutLat: body.lat,
        checkOutLng: body.lng,
        checkOutGeoValidada,
        checkOutDistanciaM,
        status: "completed",
        completedVia: body.completedVia ?? "ops_supervision",
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[OPS][SUPERVISION] Error checkout visit:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo cerrar la visita de supervisión" },
      { status: 500 },
    );
  }
}
