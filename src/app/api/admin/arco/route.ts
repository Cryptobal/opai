import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";

/**
 * GET /api/admin/arco?estado=pendiente|resuelta|all
 * Lista las solicitudes ARCO (Ley 21.719) del tenant.
 * Solo owner/admin/rrhh.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });

  if (!["owner", "admin", "rrhh"].includes(auth.userRole)) {
    return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
  }

  const estadoFilter = new URL(request.url).searchParams.get("estado") ?? "pendiente";

  const rows = await prisma.auditLog.findMany({
    where: {
      tenantId: auth.tenantId,
      action: { startsWith: "ARCO_" },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const items = rows
    .map((r) => {
      const details = (r.details as Record<string, unknown> | null) ?? {};
      return {
        id: r.id,
        createdAt: r.createdAt,
        guardiaId: r.entityId,
        action: r.action,
        tipo: (details.tipo as string) ?? r.action.replace("ARCO_", "").toLowerCase(),
        detalle: (details.detalle as string) ?? "",
        campos: (details.campos as string[]) ?? [],
        estado: (details.estado as string) ?? "pendiente",
        fechaLimiteRespuesta: (details.fechaLimiteRespuesta as string) ?? null,
        resolvedAt: (details.resolvedAt as string) ?? null,
        resolvedBy: (details.resolvedBy as string) ?? null,
        resolucion: (details.resolucion as string) ?? null,
      };
    })
    .filter((item) => {
      if (estadoFilter === "all") return true;
      if (estadoFilter === "resuelta") return item.estado === "resuelta";
      return item.estado === "pendiente";
    });

  return NextResponse.json({ success: true, data: items });
}

/**
 * PATCH /api/admin/arco
 * Marca una solicitud como resuelta (o actualiza su resolución).
 */
export async function PATCH(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });

  if (!["owner", "admin", "rrhh"].includes(auth.userRole)) {
    return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
  }

  const body = (await request.json()) as { id?: string; resolucion?: string };
  if (!body.id || !body.resolucion) {
    return NextResponse.json({ success: false, error: "id y resolucion son requeridos" }, { status: 400 });
  }

  const existing = await prisma.auditLog.findFirst({
    where: { id: body.id, tenantId: auth.tenantId, action: { startsWith: "ARCO_" } },
  });
  if (!existing) {
    return NextResponse.json({ success: false, error: "No encontrado" }, { status: 404 });
  }

  const prevDetails = (existing.details as Record<string, unknown>) ?? {};
  const newDetails = {
    ...prevDetails,
    estado: "resuelta",
    resolvedAt: new Date().toISOString(),
    resolvedBy: auth.userEmail,
    resolucion: body.resolucion,
  };

  await prisma.auditLog.update({
    where: { id: existing.id },
    data: { details: newDetails as never },
  });

  await logAudit({
    userId: auth.userId,
    userEmail: auth.userEmail,
    action: "UPDATE",
    entity: "ArcoSolicitud",
    entityId: existing.id,
    details: { type: "ARCO_RESOLVED", tipo: prevDetails.tipo },
    tenantId: auth.tenantId,
    request,
  });

  return NextResponse.json({ success: true });
}
