/**
 * GET /api/admin/dt/sessions — Lista sesiones de inspector DT
 * PATCH /api/admin/dt/sessions — Desactivar sesión
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!["owner", "admin"].includes(session.user.role)) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  const sessions = await prisma.dtInspectorSession.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      inspectorName: true,
      inspectorEmail: true,
      inspectorRut: true,
      tempUsername: true,
      isFromDtNetwork: true,
      validFrom: true,
      validUntil: true,
      isActive: true,
      lastAccessAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ sessions });
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
  const { sessionId, isActive } = body as { sessionId: string; isActive: boolean };

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId requerido" }, { status: 400 });
  }

  const updated = await prisma.dtInspectorSession.updateMany({
    where: { id: sessionId, tenantId: session.user.tenantId },
    data: { isActive },
  });

  if (updated.count === 0) {
    return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 });
  }

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      userEmail: session.user.email,
      action: isActive ? "dt_session_reactivated" : "dt_session_revoked",
      entity: "DtInspectorSession",
      entityId: sessionId,
      tenantId: session.user.tenantId,
    },
  });

  return NextResponse.json({ success: true });
}
