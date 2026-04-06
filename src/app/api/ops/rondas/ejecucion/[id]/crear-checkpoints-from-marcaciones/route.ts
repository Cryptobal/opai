import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit, hasCapability } from "@/lib/permissions";
import { generateMarcacionCode } from "@/lib/marcacion";
import { requireTenantModule } from '@/lib/require-module';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const modCheck = await requireTenantModule('ops_rondas');
  if (!modCheck.authorized) return modCheck.response;

  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canEdit(perms, "ops", "rondas") || !hasCapability(perms, "rondas_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const { id: ejecucionId } = await params;

    const ejecucion = await prisma.opsRondaEjecucion.findFirst({
      where: { id: ejecucionId, tenantId: ctx.tenantId },
      include: {
        rondaTemplate: { select: { installationId: true } },
        marcaciones: {
          where: { lat: { not: null }, lng: { not: null } },
          orderBy: { timestamp: "asc" },
          select: {
            id: true,
            lat: true,
            lng: true,
            checkpoint: { select: { name: true } },
          },
        },
      },
    });

    if (!ejecucion) {
      return NextResponse.json({ success: false, error: "Ejecución no encontrada" }, { status: 404 });
    }

    const installationId =
      ejecucion.installationId ?? ejecucion.rondaTemplate?.installationId ?? null;

    if (!installationId) {
      return NextResponse.json(
        { success: false, error: "No se puede determinar la instalación de esta ronda" },
        { status: 400 },
      );
    }

    const installation = await prisma.crmInstallation.findFirst({
      where: { id: installationId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!installation) {
      return NextResponse.json({ success: false, error: "Instalación no encontrada" }, { status: 404 });
    }

    const marcacionesConCoords = ejecucion.marcaciones.filter(
      (m): m is typeof m & { lat: number; lng: number } =>
        m.lat != null && m.lng != null,
    );

    if (marcacionesConCoords.length === 0) {
      return NextResponse.json(
        { success: false, error: "Esta ronda no tiene puntos con coordenadas para crear checkpoints" },
        { status: 400 },
      );
    }

    const created = await prisma.$transaction(
      marcacionesConCoords.map((m, idx) =>
        prisma.opsCheckpoint.create({
          data: {
            tenantId: ctx.tenantId,
            installationId,
            name: m.checkpoint?.name ?? `Punto ${idx + 1}`,
            qrCode: generateMarcacionCode(),
            lat: m.lat,
            lng: m.lng,
            geoRadiusM: 30,
            isActive: true,
            createdBy: ctx.userId,
            sortOrder: idx,
          },
        }),
      ),
    );

    return NextResponse.json({
      success: true,
      data: {
        installationId,
        created: created.map((c) => ({ id: c.id, name: c.name, lat: c.lat, lng: c.lng })),
      },
    });
  } catch (error) {
    console.error("[RONDAS] crear-checkpoints-from-marcaciones", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
