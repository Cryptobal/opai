/**
 * API Route: /api/finance/config/dte-provider/sync-rcv
 * POST - Manual trigger for RCV sync from the UI.
 * Requires `facturacion_view` (lectura — el sync inserta DTEs recibidos
 * desde el SII pero no emite nada). Si querés más restrictivo, cambiar
 * a `facturacion_configure`.
 */

import { NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { syncTenantRcv } from "@/modules/finance/billing/rcv-sync.service";

export const maxDuration = 60;

export async function POST() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasFacturacionCapability(perms, "facturacion_view")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 }
    );
  }

  try {
    const result = await syncTenantRcv(ctx.tenantId);
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
