/**
 * GET /api/fiscalizacion/auditlog
 * Log de auditoría para fiscalización DT (Resolución N°38)
 * Muestra todas las modificaciones de marcaciones con detalle
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const allowedRoles = ["owner", "admin", "inspector_dt"];
  if (!allowedRoles.includes(session.user.role)) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const entity = searchParams.get("entity");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {
    tenantId: session.user.tenantId,
  };

  if (entity) {
    where.entity = entity;
  } else {
    where.entity = {
      in: [
        "OpsMarcacion",
        "OpsAsistenciaDiaria",
        "DtInspectorSession",
      ],
    };
  }

  if (from || to) {
    const dateFilter: Record<string, unknown> = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);
    where.createdAt = dateFilter;
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return NextResponse.json({
    logs,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}
