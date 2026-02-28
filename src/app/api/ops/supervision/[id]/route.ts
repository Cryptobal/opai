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
  // New wizard fields
  guardsExpected: z.number().int().min(0).optional().nullable(),
  guardsFound: z.number().int().min(0).optional().nullable(),
  bookUpToDate: z.boolean().optional().nullable(),
  bookLastEntryDate: z.string().optional().nullable(),
  bookPhotoUrl: z.string().url().optional().nullable(),
  bookNotes: z.string().max(2000).optional().nullable(),
  clientContacted: z.boolean().optional(),
  clientContactName: z.string().max(200).optional().nullable(),
  clientSatisfaction: z.number().int().min(1).max(5).optional().nullable(),
  clientComment: z.string().max(2000).optional().nullable(),
  clientValidationUrl: z.string().url().optional().nullable(),
  wizardStep: z.number().int().min(1).max(5).optional(),
  draftData: z.record(z.string(), z.unknown()).optional().nullable(),
});

type Params = { id: string };

// Safe select: only pre-migration columns to avoid P2022 errors
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
  checkOutLat: true,
  checkOutLng: true,
  checkOutGeoValidada: true,
  checkOutDistanciaM: true,
  status: true,
  generalComments: true,
  guardsCounted: true,
  installationState: true,
  ratings: true,
  documentChecklist: true,
  startedVia: true,
  completedVia: true,
  createdAt: true,
  updatedAt: true,
} as const;

async function canAccessVisit(userId: string, tenantId: string, visitId: string, canViewAll: boolean) {
  return prisma.opsVisitaSupervision.findFirst({
    where: {
      id: visitId,
      tenantId,
      ...(canViewAll ? {} : { supervisorId: userId }),
    },
    select: { id: true },
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
    const where = {
      id,
      tenantId: ctx.tenantId,
      ...(canViewAll ? {} : { supervisorId: ctx.userId }),
    };

    let visit;
    try {
      visit = await prisma.opsVisitaSupervision.findFirst({
        where,
        include: {
          supervisor: { select: { id: true, name: true, email: true } },
          installation: {
            select: {
              id: true, name: true, address: true, commune: true,
              city: true, lat: true, lng: true, geoRadiusM: true,
            },
          },
          images: { orderBy: { createdAt: "desc" } },
          guardEvaluations: { orderBy: { createdAt: "asc" } },
          findings: { orderBy: { createdAt: "desc" } },
          checklistResults: {
            include: { checklistItem: true },
            orderBy: { checklistItem: { sortOrder: "asc" } },
          },
          photos: { orderBy: { takenAt: "asc" } },
        },
      });
    } catch {
      // Fallback: new columns/tables may not exist yet
      const safe = await prisma.opsVisitaSupervision.findFirst({
        where,
        select: {
          ...safeVisitSelect,
          supervisor: { select: { id: true, name: true, email: true } },
          installation: {
            select: {
              id: true, name: true, address: true, commune: true,
              city: true, lat: true, lng: true, geoRadiusM: true,
            },
          },
          images: { orderBy: { createdAt: "desc" } },
        },
      });
      if (safe) {
        visit = {
          ...safe,
          durationMinutes: null,
          guardsExpected: null,
          guardsFound: null,
          bookUpToDate: null,
          bookLastEntryDate: null,
          bookPhotoUrl: null,
          bookNotes: null,
          clientContacted: false,
          clientContactName: null,
          clientSatisfaction: null,
          clientComment: null,
          clientValidationUrl: null,
          healthScore: null,
          isExpressFlagged: false,
          draftData: null,
          wizardStep: 1,
          guardEvaluations: [],
          findings: [],
          checklistResults: [],
          photos: [],
        };
      }
    }

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

    // Build data with all fields (old + new)
    const fullData = {
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.generalComments !== undefined ? { generalComments: body.generalComments } : {}),
      ...(body.guardsCounted !== undefined ? { guardsCounted: body.guardsCounted } : {}),
      ...(body.installationState !== undefined ? { installationState: body.installationState } : {}),
      ...(ratingsJson !== undefined ? { ratings: ratingsJson } : {}),
      ...(documentChecklistJson !== undefined ? { documentChecklist: documentChecklistJson } : {}),
      // New wizard fields
      ...(body.guardsExpected !== undefined ? { guardsExpected: body.guardsExpected } : {}),
      ...(body.guardsFound !== undefined ? { guardsFound: body.guardsFound } : {}),
      ...(body.bookUpToDate !== undefined ? { bookUpToDate: body.bookUpToDate } : {}),
      ...(body.bookLastEntryDate !== undefined
        ? { bookLastEntryDate: body.bookLastEntryDate ? new Date(body.bookLastEntryDate) : null }
        : {}),
      ...(body.bookPhotoUrl !== undefined ? { bookPhotoUrl: body.bookPhotoUrl } : {}),
      ...(body.bookNotes !== undefined ? { bookNotes: body.bookNotes } : {}),
      ...(body.clientContacted !== undefined ? { clientContacted: body.clientContacted } : {}),
      ...(body.clientContactName !== undefined ? { clientContactName: body.clientContactName } : {}),
      ...(body.clientSatisfaction !== undefined ? { clientSatisfaction: body.clientSatisfaction } : {}),
      ...(body.clientComment !== undefined ? { clientComment: body.clientComment } : {}),
      ...(body.clientValidationUrl !== undefined ? { clientValidationUrl: body.clientValidationUrl } : {}),
      ...(body.wizardStep !== undefined ? { wizardStep: body.wizardStep } : {}),
      ...(body.draftData !== undefined
        ? { draftData: body.draftData === null ? Prisma.DbNull : (body.draftData as Prisma.InputJsonValue) }
        : {}),
    };

    // Pre-migration-safe data (only old columns)
    const safeData = {
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.generalComments !== undefined ? { generalComments: body.generalComments } : {}),
      ...(body.guardsCounted !== undefined ? { guardsCounted: body.guardsCounted } : {}),
      ...(body.installationState !== undefined ? { installationState: body.installationState } : {}),
      ...(ratingsJson !== undefined ? { ratings: ratingsJson } : {}),
      ...(documentChecklistJson !== undefined ? { documentChecklist: documentChecklistJson } : {}),
    };

    let updated;
    try {
      updated = await prisma.opsVisitaSupervision.update({
        where: { id },
        data: fullData,
      });
    } catch {
      // Fallback: new columns may not exist yet — update only safe fields
      if (Object.keys(safeData).length > 0) {
        updated = await prisma.opsVisitaSupervision.update({
          where: { id },
          data: safeData,
          select: safeVisitSelect,
        });
      } else {
        // Only new fields were sent and they can't be saved yet
        const current = await prisma.opsVisitaSupervision.findFirst({
          where: { id },
          select: safeVisitSelect,
        });
        updated = current;
      }
    }

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
      select: { id: true },
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
