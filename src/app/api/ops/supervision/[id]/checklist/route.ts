import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit, canView, hasCapability } from "@/lib/permissions";

type Params = { id: string };

const saveChecklistSchema = z.object({
  results: z.array(
    z.object({
      checklistItemId: z.string().uuid(),
      isChecked: z.boolean(),
      findingId: z.string().uuid().nullable().optional(),
    }),
  ),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
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

    const { id } = await params;
    const canViewAll = hasCapability(perms, "supervision_view_all");

    const visit = await prisma.opsVisitaSupervision.findFirst({
      where: {
        id,
        tenantId: ctx.tenantId,
        ...(canViewAll ? {} : { supervisorId: ctx.userId }),
      },
      select: { id: true },
    });

    if (!visit) {
      return NextResponse.json(
        { success: false, error: "Visita no encontrada" },
        { status: 404 },
      );
    }

    const results = await prisma.opsSupervisionChecklistResult.findMany({
      where: { visitId: id, tenantId: ctx.tenantId },
      include: {
        checklistItem: true,
      },
      orderBy: { checklistItem: { sortOrder: "asc" } },
    });

    return NextResponse.json({ success: true, data: results });
  } catch (error) {
    console.error("[OPS][SUPERVISION] Error fetching checklist results:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron obtener los resultados del checklist" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canEdit(perms, "ops", "supervision")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
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
      select: { id: true },
    });

    if (!visit) {
      return NextResponse.json(
        { success: false, error: "Visita no encontrada" },
        { status: 404 },
      );
    }

    const bodyRaw = await request.json();
    const parsed = saveChecklistSchema.safeParse(bodyRaw);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // Delete and recreate (wizard upsert pattern)
    await prisma.opsSupervisionChecklistResult.deleteMany({
      where: { visitId: id, tenantId: ctx.tenantId },
    });

    const created = await prisma.opsSupervisionChecklistResult.createMany({
      data: parsed.data.results.map((r) => ({
        tenantId: ctx.tenantId,
        visitId: id,
        checklistItemId: r.checklistItemId,
        isChecked: r.isChecked,
        findingId: r.findingId ?? null,
      })),
    });

    return NextResponse.json({ success: true, data: { count: created.count } }, { status: 201 });
  } catch (error) {
    console.error("[OPS][SUPERVISION] Error saving checklist results:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron guardar los resultados del checklist" },
      { status: 500 },
    );
  }
}
