import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit, canView, hasCapability } from "@/lib/permissions";

type Params = { id: string };

const evaluationSchema = z.object({
  guardId: z.string().uuid().nullable().optional(),
  guardName: z.string().min(1),
  presentationScore: z.number().int().min(1).max(5).nullable().optional(),
  orderScore: z.number().int().min(1).max(5).nullable().optional(),
  protocolScore: z.number().int().min(1).max(5).nullable().optional(),
  observation: z.string().max(1000).nullable().optional(),
  isReinforcement: z.boolean().optional(),
});

const bulkEvaluationSchema = z.object({
  evaluations: z.array(evaluationSchema),
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

    let evaluations: unknown[] = [];
    try {
      evaluations = await prisma.opsSupervisionGuardEvaluation.findMany({
        where: { visitId: id, tenantId: ctx.tenantId },
        orderBy: { createdAt: "asc" },
      });
    } catch (tableErr: unknown) {
      // P2021: table does not exist — migration not applied yet
      const code = tableErr && typeof tableErr === "object" && "code" in tableErr ? (tableErr as { code: string }).code : "";
      if (code !== "P2021") throw tableErr;
    }

    return NextResponse.json({ success: true, data: evaluations });
  } catch (error) {
    console.error("[OPS][SUPERVISION] Error fetching evaluations:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron obtener las evaluaciones" },
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
    const parsed = bulkEvaluationSchema.safeParse(bodyRaw);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // Try to save per-guard evaluations (table may not exist before migration)
    let savedCount = 0;
    try {
      // Delete existing evaluations and recreate (upsert pattern for wizard)
      await prisma.opsSupervisionGuardEvaluation.deleteMany({
        where: { visitId: id, tenantId: ctx.tenantId },
      });

      const created = await prisma.opsSupervisionGuardEvaluation.createMany({
        data: parsed.data.evaluations.map((e) => ({
          tenantId: ctx.tenantId,
          visitId: id,
          guardId: e.guardId ?? null,
          guardName: e.guardName,
          presentationScore: e.presentationScore ?? null,
          orderScore: e.orderScore ?? null,
          protocolScore: e.protocolScore ?? null,
          observation: e.observation ?? null,
          isReinforcement: e.isReinforcement ?? false,
        })),
      });
      savedCount = created.count;
    } catch (tableErr: unknown) {
      // P2021: table does not exist — migration not applied yet, skip per-guard save
      const code = tableErr && typeof tableErr === "object" && "code" in tableErr ? (tableErr as { code: string }).code : "";
      if (code !== "P2021") throw tableErr;
      console.warn("[OPS][SUPERVISION] supervision_guard_evaluations table not found, saving ratings only");
    }

    // Always compute and update the visit-level ratings as average of all evaluations
    // (this writes to the existing opsVisitaSupervision table which always exists)
    const evals = parsed.data.evaluations.filter(
      (e) => e.presentationScore && e.orderScore && e.protocolScore,
    );
    if (evals.length > 0) {
      const avgPresentation =
        evals.reduce((s, e) => s + (e.presentationScore ?? 0), 0) / evals.length;
      const avgOrder =
        evals.reduce((s, e) => s + (e.orderScore ?? 0), 0) / evals.length;
      const avgProtocol =
        evals.reduce((s, e) => s + (e.protocolScore ?? 0), 0) / evals.length;

      await prisma.opsVisitaSupervision.update({
        where: { id },
        data: {
          ratings: {
            presentacion: Math.round(avgPresentation * 10) / 10,
            orden: Math.round(avgOrder * 10) / 10,
            protocolo: Math.round(avgProtocol * 10) / 10,
          },
        },
        select: { id: true },
      });
    }

    return NextResponse.json({ success: true, data: { count: savedCount } }, { status: 201 });
  } catch (error) {
    console.error("[OPS][SUPERVISION] Error saving evaluations:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron guardar las evaluaciones" },
      { status: 500 },
    );
  }
}
