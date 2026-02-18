import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canDelete, canEdit, canView, hasCapability } from "@/lib/permissions";

const updateVisitSchema = z.object({
  status: z.enum(["in_progress", "completed", "cancelled"]).optional(),
  generalComments: z.string().max(4000).optional().nullable(),
  guardsCounted: z.number().int().min(0).optional().nullable(),
  installationState: z.enum(["normal", "incidencia", "critico"]).optional().nullable(),
  ratings: z
    .object({
      presentacion: z.number().min(1).max(5).optional(),
      orden: z.number().min(1).max(5).optional(),
      protocolo: z.number().min(1).max(5).optional(),
    })
    .optional()
    .nullable(),
  documentChecklist: z.record(z.string(), z.boolean()).optional().nullable(),
});

type Params = { id: string };

async function canAccessVisit(userId: string, tenantId: string, visitId: string, canViewAll: boolean) {
  return prisma.opsVisitaSupervision.findFirst({
    where: {
      id: visitId,
      tenantId,
      ...(canViewAll ? {} : { supervisorId: userId }),
    },
  });
}

export async function GET(_request: NextRequest, { params }: { params: Promise<Params> }) {
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

    const { id } = await params;
    const canViewAll = hasCapability(perms, "supervision_view_all");

    const visit = await prisma.opsVisitaSupervision.findFirst({
      where: {
        id,
        tenantId: ctx.tenantId,
        ...(canViewAll ? {} : { supervisorId: ctx.userId }),
      },
      include: {
        supervisor: {
          select: { id: true, name: true, email: true },
        },
        installation: {
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
        },
        images: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!visit) {
      return NextResponse.json(
        { success: false, error: "Visita no encontrada" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: visit });
  } catch (error) {
    console.error("[OPS][SUPERVISION] Error fetching visit detail:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener el detalle de la visita" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<Params> }) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canEdit(perms, "ops", "supervision")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para editar visitas de supervisión" },
        { status: 403 },
      );
    }

    const { id } = await params;
    const canViewAll = hasCapability(perms, "supervision_view_all");
    const existing = await canAccessVisit(ctx.userId, ctx.tenantId, id, canViewAll);

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Visita no encontrada" },
        { status: 404 },
      );
    }

    const raw = await request.json();
    const parsed = updateVisitSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const body = parsed.data;
    const ratingsJson =
      body.ratings === undefined
        ? undefined
        : body.ratings === null
          ? Prisma.JsonNull
          : (body.ratings as Prisma.InputJsonValue);

    const documentChecklistJson =
      body.documentChecklist === undefined
        ? undefined
        : body.documentChecklist === null
          ? Prisma.JsonNull
          : (body.documentChecklist as Prisma.InputJsonValue);

    const updated = await prisma.opsVisitaSupervision.update({
      where: { id },
      data: {
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.generalComments !== undefined
          ? { generalComments: body.generalComments }
          : {}),
        ...(body.guardsCounted !== undefined ? { guardsCounted: body.guardsCounted } : {}),
        ...(body.installationState !== undefined
          ? { installationState: body.installationState }
          : {}),
        ...(ratingsJson !== undefined ? { ratings: ratingsJson } : {}),
        ...(documentChecklistJson !== undefined
          ? { documentChecklist: documentChecklistJson }
          : {}),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[OPS][SUPERVISION] Error updating visit:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo actualizar la visita" },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<Params> }) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canDelete(perms, "ops", "supervision") && !hasCapability(perms, "supervision_view_all")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para eliminar visitas de supervisión" },
        { status: 403 },
      );
    }

    const { id } = await params;
    const canViewAll = hasCapability(perms, "supervision_view_all");
    const existing = await canAccessVisit(ctx.userId, ctx.tenantId, id, canViewAll);

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Visita no encontrada" },
        { status: 404 },
      );
    }

    await prisma.opsVisitaSupervision.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[OPS][SUPERVISION] Error deleting visit:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo eliminar la visita" },
      { status: 500 },
    );
  }
}
