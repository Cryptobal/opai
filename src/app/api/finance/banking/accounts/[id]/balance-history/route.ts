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
  listBalanceHistory,
  setBalanceSnapshot,
} from "@/modules/finance/banking/bank-balance.service";

const setBalanceSchema = z.object({
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha YYYY-MM-DD"),
  balance: z.number().finite(),
  note: z.string().trim().max(500).nullable().optional(),
});

/**
 * GET /api/finance/banking/accounts/[id]/balance-history
 * Lista el historial de saldos de una cuenta.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "banking_view")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 }
      );
    }
    const { id } = await params;
    const data = await listBalanceHistory(ctx.tenantId, id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Finance/Banking/Balance] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener historial de saldo" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/finance/banking/accounts/[id]/balance-history
 * Crea un snapshot manual de saldo.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "banking_manage")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 }
      );
    }
    const { id } = await params;
    const parsed = await parseBody(request, setBalanceSchema);
    if (parsed.error) return parsed.error;
    const snap = await setBalanceSnapshot(ctx.tenantId, ctx.userId, {
      bankAccountId: id,
      asOfDate: parsed.data.asOfDate,
      balance: parsed.data.balance,
      source: "MANUAL",
      note: parsed.data.note ?? null,
    });
    return NextResponse.json({ success: true, data: snap }, { status: 201 });
  } catch (error) {
    console.error("[Finance/Banking/Balance] POST error:", error);
    const message =
      error instanceof Error ? error.message : "Error al fijar saldo";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
