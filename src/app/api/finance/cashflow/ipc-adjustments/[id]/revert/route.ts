/**
 * POST /api/finance/cashflow/ipc-adjustments/[id]/revert
 *
 * Revierte un reajuste IPC APPLIED: restaura el monto del item al valor
 * previo, borra el registro del historial y limpia las ocurrencias
 * proyectadas desde su dueDate. Capability: cashflow_configure.
 *
 * Falla si existe un reajuste posterior aplicado sobre éste (hay que
 * revertir el más reciente primero para no romper la cadena).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { revertAdjustment } from "@/modules/finance/cashflow/ipc-adjustment.service";

export async function POST(
  _request: NextRequest,
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

  try {
    const result = await revertAdjustment(ctx.tenantId, id, {
      userId: ctx.userId,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Error revirtiendo ajuste",
      },
      { status: 400 },
    );
  }
}
