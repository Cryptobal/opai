/**
 * API Route: /api/finance/billing/trend
 *
 * Tendencia ventas vs compras de los últimos 6 meses (incluyendo el actual).
 * Usa `FinanceDte.date` (fecha tributaria). Excluye notas de crédito (61) de
 * "ventas" para que el área refleje el flujo neto de facturación.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";

export async function GET() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const perms = await resolveApiPerms(ctx);
  if (!canView(perms, "finance", "facturacion")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 },
    );
  }

  const now = new Date();
  const months: Array<{ year: number; month: number; key: string; label: string }> = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d
        .toLocaleDateString("es-CL", { month: "short" })
        .replace(".", ""),
    });
  }

  const start = new Date(Date.UTC(months[0].year, months[0].month - 1, 1));
  const end = new Date(Date.UTC(months[5].year, months[5].month, 1));

  const dtes = await prisma.financeDte.findMany({
    where: {
      tenantId: ctx.tenantId,
      date: { gte: start, lt: end },
      siiStatus: { in: ["ACCEPTED", "PENDING", "SENT"] },
    },
    select: { direction: true, dteType: true, totalAmount: true, date: true },
  });

  const data = months.map((m) => {
    const monthDtes = dtes.filter(
      (d) =>
        d.date.getUTCFullYear() === m.year &&
        d.date.getUTCMonth() + 1 === m.month,
    );
    const ventas = monthDtes
      .filter((d) => d.direction === "ISSUED" && d.dteType !== 61)
      .reduce((acc, d) => acc + d.totalAmount.toNumber(), 0);
    const compras = monthDtes
      .filter((d) => d.direction === "RECEIVED")
      .reduce((acc, d) => acc + d.totalAmount.toNumber(), 0);
    return {
      mes: m.label.charAt(0).toUpperCase() + m.label.slice(1),
      ventas,
      compras,
    };
  });

  return NextResponse.json({ success: true, data });
}
