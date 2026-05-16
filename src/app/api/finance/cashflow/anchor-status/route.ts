import { NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { resolveOpeningBalance } from "@/modules/finance/cashflow/opening-balance.service";

/**
 * GET /api/finance/cashflow/anchor-status
 *
 * Indica si el tenant tiene un anchor activo en weekly close. Lo usa
 * OpeningAnchorCard para decidir si mostrarse (cuando hasAnchor=false).
 * También retorna el saldo banco consolidado de hoy como sugerencia
 * para sellarlo como apertura.
 */
export async function GET() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasCapability(perms, "cashflow_view")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 },
    );
  }

  const anyAnchor = await prisma.financeCashflowWeeklyClose.findFirst({
    where: { tenantId: ctx.tenantId, isAnchor: true },
    select: { id: true, weekEndDate: true, bankBalanceClp: true },
    orderBy: { weekEndDate: "desc" },
  });

  const opening = await resolveOpeningBalance(ctx.tenantId);

  return NextResponse.json({
    success: true,
    data: {
      hasAnchor: anyAnchor !== null,
      currentAnchor: anyAnchor
        ? {
            weekEndDate: anyAnchor.weekEndDate.toISOString(),
            bankBalanceClp: Number(anyAnchor.bankBalanceClp),
          }
        : null,
      suggestedOpeningBalanceClp: opening.totalClp,
      perAccount: opening.perAccount,
    },
  });
}
