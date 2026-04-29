import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const reorderSchema = z.object({
  /// Array de { id, sortOrder } con el nuevo orden.
  /// El cliente envía SortOrder con saltos de 10 (10, 20, 30...) para permitir
  /// inserciones futuras sin renumeración masiva.
  order: z
    .array(
      z.object({
        id: z.string().uuid(),
        sortOrder: z.number().int().min(0).max(99999),
      }),
    )
    .min(1)
    .max(200),
});

/**
 * POST /api/vra/section-templates/reorder
 * Recibe el nuevo orden completo y lo persiste en una sola transacción.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const parsed = await parseBody(request, reorderSchema);
    if (parsed.error) return parsed.error;
    const { order } = parsed.data;

    const ids = order.map((o) => o.id);
    const existing = await prisma.vraSectionTemplate.findMany({
      where: { id: { in: ids }, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (existing.length !== ids.length) {
      return NextResponse.json(
        { success: false, error: "Hay secciones que no pertenecen a tu tenant" },
        { status: 403 },
      );
    }

    // Update en transacción para evitar violación temporal del unique compuesto
    // (tenant_id, sort_order) — usamos un offset alto para los nuevos valores
    await prisma.$transaction(async (tx) => {
      for (const item of order) {
        await tx.vraSectionTemplate.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder + 100000 },
        });
      }
      for (const item of order) {
        await tx.vraSectionTemplate.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        });
      }
    });

    return NextResponse.json({ success: true, count: order.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[VRA] reorder error:", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
