import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit, canView, hasCapability } from "@/lib/permissions";

type Params = { id: string };

const findingSchema = z.object({
  guardId: z.string().uuid().nullable().optional(),
  category: z.enum(["personal", "infrastructure", "documentation", "operational"]),
  severity: z.enum(["critical", "major", "minor"]),
  description: z.string().min(1).max(2000),
  photoUrl: z.string().url().nullable().optional(),
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
    });

    if (!visit) {
      return NextResponse.json(
        { success: false, error: "Visita no encontrada" },
        { status: 404 },
      );
    }

    const findings = await prisma.opsSupervisionFinding.findMany({
      where: { visitId: id, tenantId: ctx.tenantId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: findings });
  } catch (error) {
    console.error("[OPS][SUPERVISION] Error fetching findings:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron obtener los hallazgos" },
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
    });

    if (!visit) {
      return NextResponse.json(
        { success: false, error: "Visita no encontrada" },
        { status: 404 },
      );
    }

    const bodyRaw = await request.json();
    const parsed = findingSchema.safeParse(bodyRaw);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const finding = await prisma.opsSupervisionFinding.create({
      data: {
        tenantId: ctx.tenantId,
        visitId: id,
        installationId: visit.installationId,
        guardId: parsed.data.guardId ?? null,
        category: parsed.data.category,
        severity: parsed.data.severity,
        description: parsed.data.description,
        photoUrl: parsed.data.photoUrl ?? null,
        status: "open",
      },
    });

    return NextResponse.json({ success: true, data: finding }, { status: 201 });
  } catch (error) {
    console.error("[OPS][SUPERVISION] Error creating finding:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo crear el hallazgo" },
      { status: 500 },
    );
  }
}
