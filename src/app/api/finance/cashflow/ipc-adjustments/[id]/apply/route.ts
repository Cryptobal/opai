/**
 * POST /api/finance/cashflow/ipc-adjustments/[id]/apply
 *
 * Aplica un ajuste IPC pendiente. Body:
 *   { pct: number, notes?: string, dueDate?: "YYYY-MM-DD" }.
 * Si se pasa `dueDate`, sobreescribe la fecha original del PENDING (la
 * fijada por el cron) y se usa como ancla para la regeneración de
 * ocurrencias y el próximo PENDING. Actualiza el item de cashflow al
 * nuevo monto y deja snapshot old/new en el adjustment.
 * Capability: cashflow_configure.
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
  /**
   * Fecha de vigencia del reajuste. Si se omite, se usa la `dueDate`
   * original del adjustment (la fijada por el cron). El usuario puede
   * adelantarla o postergarla; la regeneración de ocurrencias y el
   * próximo PENDING se anclan a esta fecha.
   */
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha YYYY-MM-DD")
    .optional(),
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
    const dueDate = parsed.data.dueDate
      ? new Date(`${parsed.data.dueDate}T00:00:00.000Z`)
      : undefined;
    const result = await applyAdjustment(
      ctx.tenantId,
      id,
      { pct: parsed.data.pct, notes: parsed.data.notes, dueDate },
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
