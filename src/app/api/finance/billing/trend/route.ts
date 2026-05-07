/**
 * API Route: /api/finance/billing/trend
 *
 * Tendencia ventas vs compras agregada por mes. Usa `FinanceDte.date`
 * (fecha tributaria). Aplica la fórmula F29 por mes:
 *   - Ventas netas = Σ(33+34+39+41) + Σ(56) − Σ(61) [ISSUED]
 *   - Compras netas = Σ(33+34+39+41) + Σ(56) − Σ(61) [RECEIVED]
 *
 * Esto garantiza que cada punto del gráfico coincide con el KPI del
 * período si el usuario filtra solo ese mes (no hay drift entre el
 * número del KPI y el área del chart).
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
import {
  POSITIVE_TYPES,
  ND_TYPES,
  NC_TYPES,
  DEFAULT_INCLUDED_STATUS,
} from "@/modules/finance/billing/sales-aggregator";

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

  // Una sola query trae todos los DTEs del rango (ventas + compras).
  // Para ventas filtramos por siiStatus (default included); para compras
  // no filtramos por siiStatus porque RECEIVED no usa ese campo.
  const dtes = await prisma.financeDte.findMany({
    where: {
      tenantId: ctx.tenantId,
      date: { gte: start, lt: end },
    },
    select: {
      direction: true,
      dteType: true,
      totalAmount: true,
      date: true,
      siiStatus: true,
    },
  });

  const POS = new Set<number>(POSITIVE_TYPES);
  const NDS = new Set<number>(ND_TYPES);
  const NCS = new Set<number>(NC_TYPES);

  const data = months.map((m) => {
    const monthDtes = dtes.filter(
      (d) =>
        d.date.getUTCFullYear() === m.year &&
        d.date.getUTCMonth() + 1 === m.month,
    );

    // Ventas: ISSUED con siiStatus incluido. Aplicamos fórmula F29
    // (positivos + ND − NC) para que coincida con el KPI del KPIRow.
    const ventasIssued = monthDtes.filter(
      (d) =>
        d.direction === "ISSUED" &&
        DEFAULT_INCLUDED_STATUS.includes(d.siiStatus),
    );
    const ventasPos = ventasIssued
      .filter((d) => POS.has(d.dteType))
      .reduce((a, d) => a + d.totalAmount.toNumber(), 0);
    const ventasNd = ventasIssued
      .filter((d) => NDS.has(d.dteType))
      .reduce((a, d) => a + d.totalAmount.toNumber(), 0);
    const ventasNc = ventasIssued
      .filter((d) => NCS.has(d.dteType))
      .reduce((a, d) => a + d.totalAmount.toNumber(), 0);
    const ventas = ventasPos + ventasNd - ventasNc;

    // Compras: RECEIVED — misma fórmula NC/ND.
    const comprasRecv = monthDtes.filter((d) => d.direction === "RECEIVED");
    const comprasPos = comprasRecv
      .filter((d) => POS.has(d.dteType))
      .reduce((a, d) => a + d.totalAmount.toNumber(), 0);
    const comprasNd = comprasRecv
      .filter((d) => NDS.has(d.dteType))
      .reduce((a, d) => a + d.totalAmount.toNumber(), 0);
    const comprasNc = comprasRecv
      .filter((d) => NCS.has(d.dteType))
      .reduce((a, d) => a + d.totalAmount.toNumber(), 0);
    const compras = comprasPos + comprasNd - comprasNc;

    return {
      mes: m.label,
      ventas,
      compras,
    };
  });

  return NextResponse.json({ success: true, data });
}
