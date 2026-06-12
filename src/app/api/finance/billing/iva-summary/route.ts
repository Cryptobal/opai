/**
 * API Route: /api/finance/billing/iva-summary?periodo=YYYY-MM
 *
 * Resumen mensual del Libro IVA (Ventas + Compras + F29 calculado con
 * remanente UTM-ajustado y PPM). El cálculo vive en
 * `@/modules/finance/billing/f29.service` (única fuente de verdad,
 * compartida con la proyección de cashflow).
 *
 * Usa `FinanceDte.date` (fecha tributaria), NO `createdAt`.
 * Auth: requiere `canView(perms, "finance", "facturacion")`.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { computeF29Period } from "@/modules/finance/billing/f29.service";

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

  const periodo = request.nextUrl.searchParams.get("periodo");
  if (!periodo || !/^\d{4}-\d{2}$/.test(periodo)) {
    return NextResponse.json(
      {
        success: false,
        error: "Parámetro 'periodo' requerido (formato YYYY-MM)",
      },
      { status: 400 },
    );
  }

  const data = await computeF29Period(ctx.tenantId, periodo);
  return NextResponse.json({ success: true, data });
}
