import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { resolveDuplicateSuspect } from "@/modules/finance/banking/bank-transaction.service";

const schema = z.object({
  action: z.enum(["hide", "keep"]),
});

/**
 * POST /api/finance/banking/transactions/[id]/resolve-duplicate
 *
 * Resuelve un posible duplicado detectado al importar:
 *   - hide: era una copia → se oculta (deja de sumar al ledger).
 *   - keep: es un movimiento real → se confirma y deja de aparecer en Cuadratura.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "banking_manage")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }
    const { id } = await params;
    const parsed = await parseBody(request, schema);
    if (parsed.error) return parsed.error;

    const tx = await prisma.financeBankTransaction.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!tx) {
      return NextResponse.json(
        { success: false, error: "Movimiento no encontrado" },
        { status: 404 },
      );
    }

    await resolveDuplicateSuspect(ctx.tenantId, id, ctx.userId, parsed.data.action);

    revalidatePath("/finanzas/bancos");
    revalidatePath("/finanzas/flujo-caja");

    return NextResponse.json({ success: true, data: { id, action: parsed.data.action } });
  } catch (error) {
    console.error("[Finance/Banking/ResolveDuplicate] POST error:", error);
    const message =
      error instanceof Error ? error.message : "Error al resolver duplicado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
