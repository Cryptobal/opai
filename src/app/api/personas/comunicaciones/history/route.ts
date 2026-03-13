import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { formatPersonName } from "@/lib/personas";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const sp = request.nextUrl.searchParams;
    const tipo = sp.get("tipo") || undefined;
    const estado = sp.get("estado") || undefined;
    const trigger = sp.get("trigger") || undefined;
    const desde = sp.get("desde") || undefined;
    const hasta = sp.get("hasta") || undefined;
    const page = Math.max(1, Number(sp.get("page") || "1"));
    const pageSize = Math.min(100, Math.max(1, Number(sp.get("pageSize") || "20")));

    const where = {
      tenantId: ctx.tenantId,
      ...(tipo ? { tipo: tipo as never } : {}),
      ...(estado ? { estado: estado as never } : {}),
      ...(trigger ? { trigger: trigger as never } : {}),
      ...(desde || hasta
        ? {
            createdAt: {
              ...(desde ? { gte: new Date(`${desde}T00:00:00.000Z`) } : {}),
              ...(hasta ? { lte: new Date(`${hasta}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
    };

    const [logs, total] = await Promise.all([
      prisma.opsEmailLog.findMany({
        where,
        include: {
          guardia: { include: { persona: true } },
          template: { select: { nombre: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.opsEmailLog.count({ where }),
    ]);

    const data = logs.map((log) => ({
      id: log.id,
      asunto: log.asunto,
      tipo: log.tipo,
      trigger: log.trigger,
      destinatario: log.destinatario,
      guardiaNombre: formatPersonName(
        log.guardia?.persona?.firstName,
        log.guardia?.persona?.lastName,
      ),
      templateNombre: log.template?.nombre ?? null,
      estado: log.estado,
      abierto: log.abierto,
      fechaAbierto: log.fechaAbierto?.toISOString() ?? null,
      error: log.error,
      loteId: log.loteId,
      createdAt: log.createdAt.toISOString(),
    }));

    return NextResponse.json({ success: true, data, total, page, pageSize });
  } catch (error) {
    console.error("[API] comunicaciones/history GET error:", error);
    return NextResponse.json(
      { success: false, error: "Error al cargar historial" },
      { status: 500 },
    );
  }
}
