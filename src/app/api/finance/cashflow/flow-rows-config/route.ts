import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import {
  getFlowRowsConfig,
  patchFlowRowConfig,
} from "@/modules/finance/cashflow/flow-rows-config.service";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  rowId: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  section: z
    .enum([
      "INGRESOS",
      "REMUNERACIONES",
      "IMPUESTOS",
      "GAV",
      "FINANCIAMIENTO",
      "OTROS",
    ])
    .optional(),
  accountPlanIds: z.array(z.string().uuid()).max(50).optional(),
  defaultTargetAccountPlanId: z.string().uuid().nullable().optional(),
  canonicalKey: z.string().nullable().optional(),
});

/**
 * GET /api/finance/cashflow/flow-rows-config
 * Lista renglones del flujo + diagnóstico de salud (cashflow_configure).
 */
export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "cashflow_configure")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }
    const data = await getFlowRowsConfig(ctx.tenantId);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Finance/Cashflow] GET flow-rows-config:", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/finance/cashflow/flow-rows-config
 * Actualiza nombre, sección, cuentas o llave canónica de un renglón.
 */
export async function PATCH(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "cashflow_configure")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }
    const parsed = await parseBody(request, patchSchema);
    if (parsed.error) return parsed.error;
    const { rowId, ...patch } = parsed.data;
    const row = await patchFlowRowConfig(ctx.tenantId, rowId, patch);
    return NextResponse.json({ success: true, data: row });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Error interno";
    console.error("[Finance/Cashflow] PATCH flow-rows-config:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
