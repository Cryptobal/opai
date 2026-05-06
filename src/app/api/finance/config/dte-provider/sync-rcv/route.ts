/**
 * API Route: /api/finance/config/dte-provider/sync-rcv
 * POST - Manual trigger for RCV sync from the UI.
 * Requires `facturacion_view` (lectura — el sync inserta DTEs recibidos
 * desde el SII pero no emite nada). Si querés más restrictivo, cambiar
 * a `facturacion_configure`.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { syncTenantRcv } from "@/modules/finance/billing/rcv-sync.service";

// Permitir hasta 5 minutos para syncs largos (60 meses).
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasFacturacionCapability(perms, "facturacion_view")) {
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
    if (resetCursor) {
      await prisma.tenantDteConfig.update({
        where: { tenantId: ctx.tenantId },
        data: { lastRcvSyncAt: null },
      });
    }
    const result = await syncTenantRcv(ctx.tenantId, { monthsBack });
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
