/**
 * API Route: POST /api/finance/billing/dte/[id]/manual-write-off
 *
 * Override manual del write-off automático: el usuario decide cerrar un DTE
 * PARTIAL imputando la diferencia a una cuenta contable explícita, aunque
 * la varianza exceda el umbral configurado.
 *
 * Body: { accountPlanId: string (uuid), reason: string }
 * Auth: requiere `banking_manage`.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { applyManualWriteOff } from "@/modules/finance/banking/write-off.service";

const bodySchema = z.object({
  accountPlanId: z.string().uuid(),
  reason: z.string().min(3).max(500),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasCapability(perms, "banking_manage")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 },
    );
  }

  const { id } = await params;
  const parsed = await parseBody(request, bodySchema);
  if (parsed.error) return parsed.error;

  try {
    const journalEntryId = await applyManualWriteOff({
      tenantId: ctx.tenantId,
      dteId: id,
      accountPlanId: parsed.data.accountPlanId,
      reason: parsed.data.reason,
      userId: ctx.userId,
    });
    return NextResponse.json({ success: true, data: { journalEntryId } });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Error desconocido",
      },
      { status: 400 },
    );
  }
}
