import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit, canView, hasCapability } from "@/lib/permissions";
import { rondaTemplateSchema } from "@/lib/validations/rondas";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops", "rondas")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const installationId = request.nextUrl.searchParams.get("installationId") ?? undefined;
    const rows = await prisma.opsRondaTemplate.findMany({
      where: { tenantId: ctx.tenantId, ...(installationId ? { installationId } : {}) },
      include: {
        installation: { select: { id: true, name: true } },
        checkpoints: {
          include: { checkpoint: { select: { id: true, name: true, qrCode: true } } },
          orderBy: { orderIndex: "asc" },
        },
      },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    });
    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    console.error("[RONDAS] GET templates", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canEdit(perms, "ops", "rondas") || !hasCapability(perms, "rondas_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const parsed = await parseBody(request, rondaTemplateSchema);
    if (parsed.error) return parsed.error;

    const installation = await prisma.crmInstallation.findFirst({
      where: { id: parsed.data.installationId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!installation) return NextResponse.json({ success: false, error: "Instalación no encontrada" }, { status: 404 });

    const checkpoints = await prisma.opsCheckpoint.findMany({
      where: {
        tenantId: ctx.tenantId,
        installationId: parsed.data.installationId,
        id: { in: parsed.data.checkpointIds },
      },
      select: { id: true },
    });
    if (checkpoints.length !== parsed.data.checkpointIds.length) {
      return NextResponse.json({ success: false, error: "Checkpoints inválidos para la instalación" }, { status: 400 });
    }

    const created = await prisma.$transaction(async (tx) => {
      const template = await tx.opsRondaTemplate.create({
        data: {
          tenantId: ctx.tenantId,
          installationId: parsed.data.installationId,
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          orderMode: parsed.data.orderMode,
          estimatedDurationMin: parsed.data.estimatedDurationMin ?? null,
          createdBy: ctx.userId,
        },
      });
      await tx.opsRondaCheckpoint.createMany({
        data: parsed.data.checkpointIds.map((checkpointId, index) => ({
          tenantId: ctx.tenantId,
          rondaTemplateId: template.id,
          checkpointId,
          orderIndex: index + 1,
          isRequired: true,
        })),
      });
      return template;
    });
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) {
    console.error("[RONDAS] POST templates", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
