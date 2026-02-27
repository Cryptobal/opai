import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit, hasCapability } from "@/lib/permissions";

type Params = { id: string };

const draftSchema = z.object({
  wizardStep: z.number().int().min(1).max(5).optional(),
  draftData: z.record(z.string(), z.unknown()),
});

export async function PATCH(
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
    });

    if (!visit) {
      return NextResponse.json(
        { success: false, error: "Visita no encontrada" },
        { status: 404 },
      );
    }

    const bodyRaw = await request.json();
    const parsed = draftSchema.safeParse(bodyRaw);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const updated = await prisma.opsVisitaSupervision.update({
      where: { id },
      data: {
        ...(parsed.data.wizardStep !== undefined ? { wizardStep: parsed.data.wizardStep } : {}),
        draftData: parsed.data.draftData as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({ success: true, data: { id: updated.id, wizardStep: updated.wizardStep } });
  } catch (error) {
    console.error("[OPS][SUPERVISION] Error saving draft:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo guardar el borrador" },
      { status: 500 },
    );
  }
}
