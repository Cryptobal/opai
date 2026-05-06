/**
 * API Route: /api/finance/billing/trend
 *
 * Tendencia ventas vs compras agregada por mes. Usa `FinanceDte.date`
 * (fecha tributaria). Excluye notas de crédito (61) de "ventas" para
 * que el área refleje el flujo neto de facturación.
 *
 * Query params (todos opcionales):
 *   - periodo=YYYY-MM   → mes específico → muestra ese mes solo (1 punto).
 *   - from=YYYY-MM&to=YYYY-MM → rango inclusivo de meses.
 *   - sin params        → últimos 6 meses (incluyendo el actual).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";

interface MonthSlot {
  year: number;
  month: number;
  key: string;
  label: string;
}

const PERIOD_REGEX = /^\d{4}-\d{2}$/;

function buildMonthSlot(year: number, month: number): MonthSlot {
  const d = new Date(year, month - 1, 1);
  const label = d
    .toLocaleDateString("es-CL", { month: "short" })
    .replace(".", "");
  return {
    year,
    month,
    key: `${year}-${String(month).padStart(2, "0")}`,
    label: label.charAt(0).toUpperCase() + label.slice(1),
  };
}

function buildRange(fromY: number, fromM: number, toY: number, toM: number): MonthSlot[] {
  const out: MonthSlot[] = [];
  let y = fromY;
  let m = fromM;
  // Hard cap a 36 meses para proteger el endpoint de rangos arbitrarios.
  for (let i = 0; i < 36; i++) {
    out.push(buildMonthSlot(y, m));
    if (y === toY && m === toM) break;
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

export async function GET(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const perms = await resolveApiPerms(ctx);
  if (!canView(perms, "finance", "facturacion")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const periodoParam = url.searchParams.get("periodo");
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  let months: MonthSlot[];

  if (periodoParam && PERIOD_REGEX.test(periodoParam)) {
    const [y, m] = periodoParam.split("-").map((s) => parseInt(s, 10));
    months = [buildMonthSlot(y, m)];
  } else if (
    fromParam && PERIOD_REGEX.test(fromParam) &&
    toParam && PERIOD_REGEX.test(toParam)
  ) {
    const [fy, fm] = fromParam.split("-").map((s) => parseInt(s, 10));
    const [ty, tm] = toParam.split("-").map((s) => parseInt(s, 10));
    // Si vienen invertidos, devolver array vacío para evitar payload absurdo.
    if (fy > ty || (fy === ty && fm > tm)) {
      months = [];
    } else {
      months = buildRange(fy, fm, ty, tm);
    }
  } else {
    const now = new Date();
    months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(buildMonthSlot(d.getFullYear(), d.getMonth() + 1));
    }
  }

  if (months.length === 0) {
    return NextResponse.json({ success: true, data: [] });
  }

  const start = new Date(Date.UTC(months[0].year, months[0].month - 1, 1));
  const last = months[months.length - 1];
  const end = new Date(Date.UTC(last.year, last.month, 1));

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
      mes: m.label,
      ventas,
      compras,
    };
  });

  return NextResponse.json({ success: true, data });
}
