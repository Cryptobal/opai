import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView, hasCapability } from "@/lib/permissions";
import { requireTenantModule } from '@/lib/require-module';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const modCheck = await requireTenantModule('ops_rondas');
  if (!modCheck.authorized) return modCheck.response;

  try {
    const { id } = await params;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops", "rondas")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const incidente = await prisma.opsRondaIncidente.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        ejecucion: {
          select: { id: true, status: true, createdAt: true },
        },
        installation: {
          select: { id: true, name: true },
        },
        guardia: {
          select: {
            id: true,
            persona: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!incidente) {
      return NextResponse.json({ success: false, error: "No encontrado" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: incidente });
  } catch (error) {
    console.error("[RONDAS] GET incidente", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

const VALID_STATUSES = ["abierto", "asignado", "en_proceso", "resuelto", "descartado"];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const modCheck = await requireTenantModule('ops_rondas');
  if (!modCheck.authorized) return modCheck.response;

  try {
    const { id } = await params;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "rondas_resolve_alerts")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const { status, asignadoA, notas } = body;

    if (status && !VALID_STATUSES.includes(status)) {
      return NextResponse.json({ success: false, error: "Estado no válido" }, { status: 400 });
    }

    // Build update data
    const data: Record<string, unknown> = {};
    if (status) data.status = status;
    if (asignadoA !== undefined) data.asignadoA = asignadoA;
    if (notas) data.notas = notas;

    // If resolving, set resolvedAt/resolvedBy
    if (status === "resuelto") {
      data.resolvedAt = new Date();
      data.resolvedBy = ctx.userId;
    }

    const updated = await prisma.opsRondaIncidente.updateMany({
      where: { id, tenantId: ctx.tenantId },
      data,
    });

    if (!updated.count) {
      return NextResponse.json({ success: false, error: "No encontrado" }, { status: 404 });
    }

    const result = await prisma.opsRondaIncidente.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[RONDAS] PATCH incidente", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
