/**
 * GET /api/finance/factoring/kpis?periodo=YYYY-MM
 * Devuelve KPIs del módulo de cesiones.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  resolveApiPerms,
  unauthorized,
} from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { getFactoringKpis } from "@/modules/finance/factoring/operations.service";

export async function GET(request: NextRequest) {
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
  const periodo = url.searchParams.get("periodo") ?? undefined;
  const kpis = await getFactoringKpis(ctx.tenantId, periodo);
  return NextResponse.json({ success: true, kpis });
}
