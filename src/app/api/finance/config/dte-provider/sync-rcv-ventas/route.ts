/**
 * API Route: /api/finance/config/dte-provider/sync-rcv-ventas
 * POST - Trigger manual del sync de RCV ventas (DTEs emitidos históricos)
 * desde la UI. Importa al sistema todas las facturas del tenant que el
 * SII tiene registradas (incluso las emitidas antes de OPAI).
 *
 * Requiere capability `rendicion_configure`.
 *
 * Query params opcionales:
 *   - monthsBack: número de meses hacia atrás a consultar (default 12,
 *     máx 60). Sólo aplica al primer sync; los syncs posteriores son
 *     incrementales (a menos que se pase resetCursor=true).
 *   - resetCursor: si "true", borra last_rcv_ventas_sync_at antes de
 *     correr el sync. Esto fuerza al provider a tratarlo como "primer
 *     sync" y barrer monthsBack meses hacia atrás (en vez de hacer
 *     incremental desde el último sync).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { syncTenantRcvVentas } from "@/modules/finance/billing/rcv-ventas-sync.service";

// Sync de ventas puede tomar mucho más que el de compras porque trae
// hasta 60 meses. El rate limit de SimpleAPI es 1/sec, 5/min, 100/hour.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasCapability(perms, "rendicion_configure")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  const monthsBackRaw = url.searchParams.get("monthsBack");
  const monthsBack = monthsBackRaw
    ? Math.min(60, Math.max(1, parseInt(monthsBackRaw, 10)))
    : undefined;
  const resetCursor = url.searchParams.get("resetCursor") === "true";

  try {
    // Si el cliente pidió reset (ej. "Todo el histórico"), borramos el
    // cursor para que el service trate este sync como "primer sync" y
    // vaya hacia atrás monthsBack meses.
    if (resetCursor) {
      await prisma.tenantDteConfig.update({
        where: { tenantId: ctx.tenantId },
        data: { lastRcvVentasSyncAt: null },
      });
    }
    const result = await syncTenantRcvVentas(ctx.tenantId, { monthsBack });
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
