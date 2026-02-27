import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { haversineDistance } from "@/lib/marcacion";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit, hasCapability } from "@/lib/permissions";

type Params = { id: string };

const EXPRESS_MIN_MINUTES = 15;

const checkoutSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  completedVia: z.enum(["hub", "ops_supervision", "mobile"]).optional(),
  // New wizard fields
  generalComments: z.string().max(4000).optional().nullable(),
  installationState: z.enum(["normal", "incidencia", "critico"]).optional().nullable(),
  guardsExpected: z.number().int().min(0).optional().nullable(),
  guardsFound: z.number().int().min(0).optional().nullable(),
  bookUpToDate: z.boolean().optional().nullable(),
  bookLastEntryDate: z.string().optional().nullable(),
  bookNotes: z.string().max(2000).optional().nullable(),
  clientContacted: z.boolean().optional(),
  clientContactName: z.string().max(200).optional().nullable(),
  clientSatisfaction: z.number().int().min(1).max(5).optional().nullable(),
  clientComment: z.string().max(2000).optional().nullable(),
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

    // Calculate duration
    const checkOutAt = new Date();
    const checkInAt = new Date(visit.checkInAt);
    const durationMinutes = Math.round((checkOutAt.getTime() - checkInAt.getTime()) / 60000);
    const isExpressFlagged = durationMinutes < EXPRESS_MIN_MINUTES;

    const updated = await prisma.opsVisitaSupervision.update({
      where: { id: visit.id },
      data: {
        checkOutAt,
        checkOutLat: body.lat,
        checkOutLng: body.lng,
        checkOutGeoValidada,
        checkOutDistanciaM,
        status: "completed",
        completedVia: body.completedVia ?? "ops_supervision",
        durationMinutes,
        isExpressFlagged,
        draftData: Prisma.DbNull, // Clear draft on completion
        wizardStep: 5,
        // Save additional wizard data if provided
        ...(body.generalComments !== undefined ? { generalComments: body.generalComments } : {}),
        ...(body.installationState !== undefined ? { installationState: body.installationState } : {}),
        ...(body.guardsExpected !== undefined ? { guardsExpected: body.guardsExpected } : {}),
        ...(body.guardsFound !== undefined ? { guardsFound: body.guardsFound } : {}),
        ...(body.bookUpToDate !== undefined ? { bookUpToDate: body.bookUpToDate } : {}),
        ...(body.bookLastEntryDate !== undefined
          ? { bookLastEntryDate: body.bookLastEntryDate ? new Date(body.bookLastEntryDate) : null }
          : {}),
        ...(body.bookNotes !== undefined ? { bookNotes: body.bookNotes } : {}),
        ...(body.clientContacted !== undefined ? { clientContacted: body.clientContacted } : {}),
        ...(body.clientContactName !== undefined ? { clientContactName: body.clientContactName } : {}),
        ...(body.clientSatisfaction !== undefined ? { clientSatisfaction: body.clientSatisfaction } : {}),
        ...(body.clientComment !== undefined ? { clientComment: body.clientComment } : {}),
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
