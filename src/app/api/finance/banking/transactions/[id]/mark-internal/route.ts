import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";

/**
 * POST /api/finance/banking/transactions/[id]/mark-internal
 *
 * Override manual: marca una bank tx como excluida del cómputo de cuadratura
 * con motivo "manual_override". Multi-tenant: valida pertenencia.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasCapability(perms, "cashflow_manage")) {
    return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
  }
  const { id } = await params;
  const tx = await prisma.financeBankTransaction.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: { id: true },
  });
  if (!tx) {
    return NextResponse.json({ success: false, error: "No encontrado" }, { status: 404 });
  }
  await prisma.financeBankTransaction.update({
    where: { id },
    data: {
      excludedReason: "manual_override",
      excludedAt: new Date(),
      excludedBy: ctx.userId,
    },
  });
  return NextResponse.json({ success: true });
}
