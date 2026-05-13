import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/finance/cashflow/bank-balance/pull
 *
 * Devuelve el `currentBalance` consolidado por cuenta CLP activa del tenant.
 * Es solo lectura — el usuario decide si lo aplica con el endpoint de ajuste.
 */
export async function GET(_req: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasCapability(perms, "banking_manage")) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const accounts = await prisma.financeBankAccount.findMany({
    where: { tenantId: ctx.tenantId, isActive: true, currency: "CLP" },
    select: {
      id: true,
      bankName: true,
      accountNumber: true,
      currentBalance: true,
      balanceUpdatedAt: true,
      apiProvider: true,
      apiLastSync: true,
    },
  });

  return NextResponse.json({
    success: true,
    data: accounts.map((a) => ({
      bankAccountId: a.id,
      bankName: a.bankName,
      accountNumber: a.accountNumber,
      currentBalance: Number(a.currentBalance ?? 0),
      balanceUpdatedAt: a.balanceUpdatedAt?.toISOString() ?? null,
      source: a.apiProvider ? "api" : a.apiLastSync ? "api" : "manual",
      lastSync: a.apiLastSync?.toISOString() ?? null,
    })),
  });
}
