import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit, canView, hasCapability } from "@/lib/permissions";
import { checkpointSchema } from "@/lib/validations/rondas";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canEdit(perms, "ops", "rondas") || !hasCapability(perms, "rondas_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const parsed = await parseBody(request, checkpointSchema.partial().omit({ installationId: true }));
    if (parsed.error) return parsed.error;

    const updated = await prisma.opsCheckpoint.updateMany({
      where: { id, tenantId: ctx.tenantId },
      data: {
        name: parsed.data.name,
        description: parsed.data.description,
        lat: parsed.data.lat ?? undefined,
        lng: parsed.data.lng ?? undefined,
        geoRadiusM: parsed.data.geoRadiusM,
        isActive: parsed.data.isActive,
      },
    });
    if (updated.count === 0) {
      return NextResponse.json({ success: false, error: "Checkpoint no encontrado" }, { status: 404 });
    }

    const row = await prisma.opsCheckpoint.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    return NextResponse.json({ success: true, data: row });
  } catch (error) {
    console.error("[RONDAS] PATCH checkpoint", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canEdit(perms, "ops", "rondas") || !hasCapability(perms, "rondas_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const exists = await prisma.opsCheckpoint.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!exists) {
      return NextResponse.json({ success: false, error: "Checkpoint no encontrado" }, { status: 404 });
    }

    await prisma.opsCheckpoint.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[RONDAS] DELETE checkpoint", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops", "rondas")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const row = await prisma.opsCheckpoint.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { installation: { select: { id: true, name: true } } },
    });
    if (!row) return NextResponse.json({ success: false, error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ success: true, data: row });
  } catch (error) {
    console.error("[RONDAS] GET checkpoint", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
