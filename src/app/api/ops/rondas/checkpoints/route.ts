import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit, canView, hasCapability } from "@/lib/permissions";
import { checkpointSchema } from "@/lib/validations/rondas";
import { generateMarcacionCode } from "@/lib/marcacion";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops", "rondas")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const installationId = request.nextUrl.searchParams.get("installationId") ?? undefined;
    const checkpoints = await prisma.opsCheckpoint.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(installationId ? { installationId } : {}),
      },
      include: {
        installation: { select: { id: true, name: true } },
      },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ success: true, data: checkpoints });
  } catch (error) {
    console.error("[RONDAS] GET checkpoints", error);
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

    const parsed = await parseBody(request, checkpointSchema);
    if (parsed.error) return parsed.error;

    const installation = await prisma.crmInstallation.findFirst({
      where: { id: parsed.data.installationId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!installation) {
      return NextResponse.json({ success: false, error: "Instalación no encontrada" }, { status: 404 });
    }

    const qrCode = parsed.data.qrCode ?? generateMarcacionCode();
    const created = await prisma.opsCheckpoint.create({
      data: {
        tenantId: ctx.tenantId,
        installationId: parsed.data.installationId,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        qrCode,
        lat: parsed.data.lat ?? null,
        lng: parsed.data.lng ?? null,
        geoRadiusM: parsed.data.geoRadiusM,
        isActive: parsed.data.isActive ?? true,
        createdBy: ctx.userId,
      },
    });

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) {
    console.error("[RONDAS] POST checkpoints", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
