import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";
import { requireTenantModule } from '@/lib/require-module';

export async function POST(request: NextRequest) {
  const modCheck = await requireTenantModule('ops_rondas');
  if (!modCheck.authorized) return modCheck.response;

  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canEdit(perms, "ops", "rondas")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const body = await request.json();
    const { ejecucionId, guardiaId, installationId, descripcion } = body;

    if (!ejecucionId || !guardiaId || !descripcion?.trim()) {
      return NextResponse.json({ success: false, error: "Faltan campos requeridos" }, { status: 400 });
    }

    const incidente = await prisma.opsRondaIncidente.create({
      data: {
        tenantId: ctx.tenantId,
        ejecucionId,
        guardiaId,
        installationId: installationId || undefined,
        tipo: "observacion_operador",
        descripcion: descripcion.trim(),
        status: "cerrado",
      },
    });

    return NextResponse.json({ success: true, data: incidente });
  } catch (error) {
    console.error("[RONDAS] monitoreo/nota POST", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
