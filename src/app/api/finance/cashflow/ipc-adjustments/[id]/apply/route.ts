/**
 * POST /api/finance/cashflow/ipc-adjustments/[id]/apply
 *
 * Aplica un ajuste IPC pendiente. Body: { pct: number, notes?: string }.
 * Actualiza el item de cashflow al nuevo monto, deja snapshot old/new
 * en el adjustment, y limpia ocurrencias proyectadas futuras para que
 * se regeneren al monto nuevo. Capability: cashflow_configure.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  parseBody,
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { applyAdjustment } from "@/modules/finance/cashflow/ipc-adjustment.service";

const applyIpcSchema = z.object({
  pct: z.number().gt(-100).lt(1000),
  notes: z.string().max(2000).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasCapability(perms, "cashflow_configure")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 },
    );
  }
  const { id } = await params;
  const parsed = await parseBody(request, applyIpcSchema);
  if (parsed.error) return parsed.error;

  try {
    const result = await applyAdjustment(
      ctx.tenantId,
      id,
      { pct: parsed.data.pct, notes: parsed.data.notes },
      { userId: ctx.userId },
    );
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Error aplicando ajuste",
      },
      { status: 400 },
    );
  }
}
