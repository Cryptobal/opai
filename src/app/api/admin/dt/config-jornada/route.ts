/**
 * GET /api/admin/dt/config-jornada — Lista configuraciones de jornada
 * POST /api/admin/dt/config-jornada — Crear nueva configuración
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const allowedRoles = ["owner", "admin", "inspector_dt"];
  if (!allowedRoles.includes(session.user.role)) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  const configs = await prisma.configJornada.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: { vigenciaDesde: "desc" },
  });

  return NextResponse.json({ configs });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!["owner", "admin"].includes(session.user.role)) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  const body = await request.json();
  const {
    maxHorasSemanales,
    maxHorasDiarias,
    maxHorasExtras,
    vigenciaDesde,
    vigenciaHasta,
    leyReferencia,
  } = body as {
    maxHorasSemanales: number;
    maxHorasDiarias?: number;
    maxHorasExtras?: number;
    vigenciaDesde: string;
    vigenciaHasta?: string | null;
    leyReferencia?: string;
  };

  if (!maxHorasSemanales || !vigenciaDesde) {
    return NextResponse.json(
      { error: "maxHorasSemanales y vigenciaDesde son requeridos" },
      { status: 400 }
    );
  }

  const config = await prisma.configJornada.create({
    data: {
      tenantId: session.user.tenantId,
      maxHorasSemanales,
      maxHorasDiarias: maxHorasDiarias ?? 12,
      maxHorasExtras: maxHorasExtras ?? 2,
      vigenciaDesde: new Date(vigenciaDesde),
      vigenciaHasta: vigenciaHasta ? new Date(vigenciaHasta) : null,
      leyReferencia: leyReferencia ?? null,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      userEmail: session.user.email,
      action: "config_jornada_created",
      entity: "ConfigJornada",
      entityId: config.id,
      details: {
        maxHorasSemanales,
        vigenciaDesde,
        vigenciaHasta,
        leyReferencia,
      },
      tenantId: session.user.tenantId,
    },
  });

  return NextResponse.json({ config });
}
