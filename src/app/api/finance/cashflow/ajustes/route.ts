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
  createAjusteConciliacion,
  listAjustes,
} from "@/modules/finance/cashflow/ajuste.service";

const createSchema = z.object({
  amountClp: z.number().finite().refine((n) => n !== 0, "Monto no puede ser 0"),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha YYYY-MM-DD"),
  notes: z.string().trim().min(5).max(500),
  bankTransactionId: z.string().uuid().nullable().optional(),
});

export async function GET() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasCapability(perms, "cashflow_view")) {
    return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
  }
  const data = await listAjustes(ctx.tenantId);
  return NextResponse.json({ success: true, data });
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "cashflow_manage")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const parsed = await parseBody(request, createSchema);
    if (parsed.error) return parsed.error;
    const result = await createAjusteConciliacion(ctx.tenantId, ctx.userId, {
      amountClp: parsed.data.amountClp,
      effectiveDate: new Date(parsed.data.effectiveDate),
      notes: parsed.data.notes,
      bankTransactionId: parsed.data.bankTransactionId ?? null,
    });
    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    console.error("[Finance/Cashflow/Ajustes] POST error:", error);
    const message = error instanceof Error ? error.message : "Error";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
