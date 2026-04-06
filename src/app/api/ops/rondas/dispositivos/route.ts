import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit, canView, hasCapability } from "@/lib/permissions";
import { dispositivoSchema } from "@/lib/validations/rondas";
import { requireTenantModule } from '@/lib/require-module';

export async function GET(request: NextRequest) {
  const modCheck = await requireTenantModule('ops_rondas');
  if (!modCheck.authorized) return modCheck.response;

  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops", "rondas")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const installationId = request.nextUrl.searchParams.get("installationId") ?? undefined;
    const rows = await prisma.opsDispositivoInstalacion.findMany({
      where: { tenantId: ctx.tenantId, ...(installationId ? { installationId } : {}) },
      include: { installation: { select: { id: true, name: true } } },
      orderBy: { registeredAt: "desc" },
    });

    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    console.error("[RONDAS] GET dispositivos", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const modCheck = await requireTenantModule('ops_rondas');
  if (!modCheck.authorized) return modCheck.response;

  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canEdit(perms, "ops", "rondas") || !hasCapability(perms, "rondas_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const parsed = await parseBody(request, dispositivoSchema);
    if (parsed.error) return parsed.error;

    const installation = await prisma.crmInstallation.findFirst({
      where: { id: parsed.data.installationId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!installation) {
      return NextResponse.json({ success: false, error: "Instalación no encontrada" }, { status: 404 });
    }

    const created = await prisma.opsDispositivoInstalacion.upsert({
      where: {
        installationId_deviceId: {
          installationId: parsed.data.installationId,
          deviceId: parsed.data.deviceId,
        },
      },
      update: {
        deviceName: parsed.data.deviceName ?? undefined,
        isAuthorized: true,
        lastAccessAt: new Date(),
      },
      create: {
        tenantId: ctx.tenantId,
        installationId: parsed.data.installationId,
        deviceId: parsed.data.deviceId,
        deviceName: parsed.data.deviceName ?? null,
        isAuthorized: true,
        registeredBy: ctx.userId,
      },
    });

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) {
    console.error("[RONDAS] POST dispositivos", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
