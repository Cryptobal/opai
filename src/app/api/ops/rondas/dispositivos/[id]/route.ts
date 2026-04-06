import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit, hasCapability } from "@/lib/permissions";
import { requireTenantModule } from '@/lib/require-module';

export async function PUT(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const modCheck = await requireTenantModule('ops_rondas');
  if (!modCheck.authorized) return modCheck.response;

  try {
    const { id } = await params;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canEdit(perms, "ops", "rondas") || !hasCapability(perms, "rondas_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const device = await prisma.opsDispositivoInstalacion.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!device) {
      return NextResponse.json({ success: false, error: "Dispositivo no encontrado" }, { status: 404 });
    }

    const result = await prisma.opsDispositivoInstalacion.updateMany({
      where: { id, tenantId: ctx.tenantId },
      data: { isAuthorized: !device.isAuthorized },
    });
    if (result.count === 0) {
      return NextResponse.json({ success: false, error: "Dispositivo no encontrado" }, { status: 404 });
    }
    const updated = await prisma.opsDispositivoInstalacion.findFirst({
      where: { id, tenantId: ctx.tenantId },
    })!;

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[RONDAS] PUT dispositivo toggle", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const modCheck = await requireTenantModule('ops_rondas');
  if (!modCheck.authorized) return modCheck.response;

  try {
    const { id } = await params;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canEdit(perms, "ops", "rondas") || !hasCapability(perms, "rondas_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const found = await prisma.opsDispositivoInstalacion.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!found) {
      return NextResponse.json({ success: false, error: "Dispositivo no encontrado" }, { status: 404 });
    }

    await prisma.opsDispositivoInstalacion.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[RONDAS] DELETE dispositivo", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
