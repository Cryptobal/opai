/**
 * GET /api/finance/billing/cobranzas-summary?periodo=YYYY-MM
 *
 * Devuelve el shape consumido por <SaludFinancieraHero>: facturado,
 * cobrado, por cobrar, aging, vencidas, margen, IVA neto. Mismo
 * statusInclude (ACCEPTED+PENDING+SENT) que el resto del módulo para
 * que los números coincidan con el KPIRow.
 *
 * - sin `?periodo` → mes actual (default).
 * - `?periodo=YYYY-MM` → ese mes.
 * - `?periodo=ALL` → últimos 12 meses (igual que kpis).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { buildMonthRange } from "@/modules/finance/billing/sales-aggregator";
import { computeCobranzasSummary } from "@/modules/finance/billing/cobranzas-aggregator";
import { getFolioStatus } from "@/modules/finance/billing/folio.service";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasFacturacionCapability(perms, "facturacion_view")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }

    const url = new URL(request.url);
    const periodo = url.searchParams.get("periodo");
    const range = buildMonthRange(periodo);

    // Estos KPIs operativos (Pendientes SII, Folios) NO dependen del
    // período: reflejan el estado actual del módulo. Los servimos en
    // el mismo endpoint para que el hero "Salud financiera" pueda
    // mostrarlos sin un round trip extra.
    const [summary, pendientesSii, folioStatuses] = await Promise.all([
      computeCobranzasSummary(ctx.tenantId, range),
      prisma.financeDte.count({
        where: {
          tenantId: ctx.tenantId,
          direction: "ISSUED",
          siiStatus: { in: ["PENDING", "SENT"] },
        },
      }),
      getFolioStatus(ctx.tenantId),
    ]);

    const foliosDisponibles = folioStatuses.reduce(
      (acc, f) => acc + f.disponibles,
      0,
    );
    const foliosLowCount = folioStatuses.filter((f) => f.lowStock).length;

    return NextResponse.json({
      success: true,
      data: {
        ...summary,
        periodLabel: range.label,
        operational: {
          pendientesSii,
          foliosDisponibles,
          foliosLowCount,
        },
      },
    });
  } catch (error) {
    console.error("[Finance/Cobranzas/Summary] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al calcular cobranzas" },
      { status: 500 },
    );
  }
}
