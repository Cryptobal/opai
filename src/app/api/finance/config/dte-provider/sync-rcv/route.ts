/**
 * API Route: /api/finance/config/dte-provider/sync-rcv
 * POST - Manual trigger for RCV sync from the UI.
 * Requires `rendicion_configure` capability.
 */

import { NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { syncTenantRcv } from "@/modules/finance/billing/rcv-sync.service";

export const maxDuration = 60;

export async function POST() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasCapability(perms, "rendicion_configure")) {
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
