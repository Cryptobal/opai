/**
 * GET /api/admin/dt/incidents — Lista incidentes de servicio
 * POST /api/admin/dt/incidents — Crear incidente manual
 * PATCH /api/admin/dt/incidents — Resolver incidente
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

  const incidents = await prisma.systemIncident.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: { startedAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ incidents });
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
  const { type, description, startedAt, affectedModule, affectedUsers } = body as {
    type: string;
    description: string;
    startedAt: string;
    affectedModule: string;
    affectedUsers?: number;
  };

  if (!type || !description || !startedAt || !affectedModule) {
    return NextResponse.json({ error: "Campos requeridos: type, description, startedAt, affectedModule" }, { status: 400 });
  }

  const incident = await prisma.systemIncident.create({
    data: {
      tenantId: session.user.tenantId,
      type,
      description,
      startedAt: new Date(startedAt),
      affectedModule,
      affectedUsers: affectedUsers ?? null,
      createdBy: session.user.id,
    },
  });

  return NextResponse.json({ incident });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!["owner", "admin"].includes(session.user.role)) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  const body = await request.json();
  const { incidentId, resolution } = body as { incidentId: string; resolution: string };

  if (!incidentId || !resolution) {
    return NextResponse.json({ error: "incidentId y resolution requeridos" }, { status: 400 });
  }

  const incident = await prisma.systemIncident.findFirst({
    where: { id: incidentId, tenantId: session.user.tenantId },
  });

  if (!incident) {
    return NextResponse.json({ error: "Incidente no encontrado" }, { status: 404 });
  }

  const resolvedAt = new Date();
  const duration = Math.round(
    (resolvedAt.getTime() - incident.startedAt.getTime()) / 60000
  );

  const updated = await prisma.systemIncident.update({
    where: { id: incidentId },
    data: { resolvedAt, duration, resolution },
  });

  return NextResponse.json({ incident: updated });
}
