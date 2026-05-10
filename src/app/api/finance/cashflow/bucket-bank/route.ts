import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { bucketBoundsFor, bucketKeyFor } from "@/modules/finance/cashflow/recurrence-engine";

/**
 * GET /api/finance/cashflow/bucket-bank?key=<bucketKey>&granularity=weekly|monthly
 *
 * Devuelve los FinanceBankTransaction visibles dentro del bucket pedido para
 * el tenant del usuario. Útil para el drawer "Ver movimientos del bucket".
 */
export async function GET(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasCapability(perms, "cashflow_view")) {
    return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  const granularityParam = searchParams.get("granularity") ?? "weekly";
  if (!key) {
    return NextResponse.json({ success: false, error: "Falta key" }, { status: 400 });
  }
  if (granularityParam !== "weekly" && granularityParam !== "monthly") {
    return NextResponse.json(
      { success: false, error: "granularity inválido" },
      { status: 400 },
    );
  }
  const granularity = granularityParam as "weekly" | "monthly";

  // Reconstruir el rango del bucket. Para weekly esperamos formato "YYYY-Www",
  // para monthly "YYYY-MM". Resolvemos un día central y dejamos que
  // bucketBoundsFor calcule start/end consistentemente con el resto del módulo.
  let probe: Date;
  if (granularity === "weekly") {
    const m = key.match(/^(\d{4})-W(\d{1,2})$/);
    if (!m) {
      return NextResponse.json({ success: false, error: "key inválida" }, { status: 400 });
    }
    const year = Number(m[1]);
    const week = Number(m[2]);
    // Lunes ISO de la semana N: usamos un offset desde 4 ene (siempre semana 1).
    const jan4 = new Date(year, 0, 4);
    const jan4Dow = jan4.getDay() || 7;
    const week1Monday = new Date(year, 0, 4 - (jan4Dow - 1));
    probe = new Date(week1Monday);
    probe.setDate(probe.getDate() + (week - 1) * 7);
  } else {
    const m = key.match(/^(\d{4})-(\d{2})$/);
    if (!m) {
      return NextResponse.json({ success: false, error: "key inválida" }, { status: 400 });
    }
    probe = new Date(Number(m[1]), Number(m[2]) - 1, 15);
  }

  // Verificación de consistencia: el key derivado del probe debe coincidir.
  const computedKey = bucketKeyFor(probe, granularity);
  if (computedKey !== key) {
    return NextResponse.json(
      { success: false, error: `key no resuelve a un bucket válido (${computedKey})` },
      { status: 400 },
    );
  }

  const { start, end } = bucketBoundsFor(probe, granularity);

  const txs = await prisma.financeBankTransaction.findMany({
    where: {
      tenantId: ctx.tenantId,
      transactionDate: { gte: start, lte: end },
      hiddenAt: null,
    },
    select: {
      id: true,
      transactionDate: true,
      description: true,
      amount: true,
      reconciliationStatus: true,
      bankAccount: { select: { bankName: true, accountNumber: true } },
    },
    orderBy: { transactionDate: "asc" },
  });

  return NextResponse.json({
    success: true,
    data: {
      bucketKey: key,
      start,
      end,
      transactions: txs.map((t) => ({
        id: t.id,
        date: t.transactionDate,
        description: t.description,
        amount: Number(t.amount),
        reconciliationStatus: t.reconciliationStatus,
        bankAccountName: t.bankAccount
          ? `${t.bankAccount.bankName} · ${t.bankAccount.accountNumber}`
          : null,
      })),
    },
  });
}
