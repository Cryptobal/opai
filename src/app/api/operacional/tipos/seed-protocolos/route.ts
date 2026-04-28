import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { DEFAULT_PROTOCOLOS_GLOBAL } from "@/lib/docs-operacionales-categorias";

/**
 * POST /api/operacional/tipos/seed-protocolos
 *
 * Idempotente: crea los TipoDocOperacional default de la categoría
 * "Protocolos y Seguridad" (Plan de Evacuación, Protocolo de Emergencias,
 * etc.) sólo si no existen aún para el tenant. Devuelve cuántos creó.
 */
export async function POST() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    let created = 0;

    for (const seed of DEFAULT_PROTOCOLOS_GLOBAL) {
      const exists = await prisma.tipoDocOperacional.findFirst({
        where: { tenantId: ctx.tenantId, codigo: seed.codigo },
        select: { id: true },
      });
      if (exists) continue;

      await prisma.tipoDocOperacional.create({
        data: {
          tenantId: ctx.tenantId,
          codigo: seed.codigo,
          nombre: seed.nombre,
          capa: seed.capa,
          obligatorio: seed.obligatorio,
          tieneVencimiento: seed.tieneVencimiento,
          diasAlerta: seed.diasAlerta,
          obligatorioEnVisita: seed.obligatorioEnVisita,
          normativa: seed.normativa,
          order: seed.order,
        },
      });
      created += 1;
    }

    return NextResponse.json({ success: true, data: { created } });
  } catch (error) {
    console.error("[TIPOS-SEED-PROTOCOLOS] Error:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron sembrar tipos" },
      { status: 500 },
    );
  }
}
