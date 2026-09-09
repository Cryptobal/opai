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
  applyReportedBalance,
  resolveAccountBalanceFromMovements,
  findLatestUnexplainedDiscrepancy,
  getBankBalanceDiscrepancyThresholdClp,
} from "@/modules/finance/banking/bank-balance.service";
import { notifyBankBalanceDiscrepancy } from "@/modules/finance/banking/bank-balance-notify";
import { prisma } from "@/lib/prisma";

const setBalanceSchema = z.object({
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha YYYY-MM-DD"),
  balance: z.number().finite(),
  note: z.string().trim().max(500).nullable().optional(),
});

function serializeSnapshot(s: {
  id: string;
  asOfDate: Date;
  balance: { toString(): string } | number;
  computedBalance?: { toString(): string } | number | null;
  deltaClp?: { toString(): string } | number | null;
  source: string;
  note: string | null;
  createdAt: Date;
  createdById: string | null;
}) {
  return {
    id: s.id,
    asOfDate: s.asOfDate,
    balance: s.balance,
    computedBalance: s.computedBalance ?? null,
    deltaClp: s.deltaClp ?? null,
    source: s.source,
    note: s.note,
    createdAt: s.createdAt,
    createdById: s.createdById,
  };
}

/**
 * GET /api/finance/banking/accounts/[id]/balance-history
 * Lista el historial de saldos de una cuenta + trazabilidad del ancla.
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
    const account = await prisma.financeBankAccount.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!account) {
      return NextResponse.json(
        { success: false, error: "Cuenta bancaria no encontrada" },
        { status: 404 },
      );
    }
    const [data, resolved, lastDiscrepancy, discrepancyThresholdClp] =
      await Promise.all([
        listBalanceHistory(ctx.tenantId, id),
        resolveAccountBalanceFromMovements(ctx.tenantId, id),
        findLatestUnexplainedDiscrepancy(ctx.tenantId, id),
        getBankBalanceDiscrepancyThresholdClp(ctx.tenantId),
      ]);
    return NextResponse.json({
      success: true,
      data: data.map(serializeSnapshot),
      resolved: {
        anchorSource: resolved.anchorSource ?? null,
        anchorSnapshotDate: resolved.anchorSnapshotDate
          ? resolved.anchorSnapshotDate.toISOString().slice(0, 10)
          : null,
        anchorBalanceClp: resolved.anchorBalanceClp,
        txDeltaClp: resolved.txDeltaClp,
        txCount: resolved.txCount,
        resolvedBalanceClp: resolved.resolvedBalanceClp,
      },
      lastDiscrepancy,
      discrepancyThresholdClp,
    });
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
 * Crea un snapshot manual de saldo (cuadratura + nota si supera umbral).
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

    const account = await prisma.financeBankAccount.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, bankName: true, accountNumber: true },
    });
    if (!account) {
      return NextResponse.json(
        { success: false, error: "Cuenta bancaria no encontrada" },
        { status: 404 },
      );
    }

    const applied = await applyReportedBalance({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      bankAccountId: id,
      asOf: parsed.data.asOfDate,
      balance: parsed.data.balance,
      source: "MANUAL",
      note: parsed.data.note ?? null,
      requireNoteIfExceeds: true,
    });

    if (!applied.ok) {
      return NextResponse.json(
        {
          success: false,
          error: "note_required",
          delta: applied.discrepancy.delta,
          reported: applied.discrepancy.reported,
          computed: applied.discrepancy.computed,
          thresholdClp: applied.discrepancy.thresholdClp,
        },
        { status: 400 },
      );
    }

    if (applied.discrepancy.exceeds) {
      try {
        await notifyBankBalanceDiscrepancy({
          tenantId: ctx.tenantId,
          accountLabel: `${account.bankName} ${account.accountNumber}`,
          discrepancy: applied.discrepancy,
        });
      } catch (err) {
        console.error("[Finance/Banking/Balance] notify:", err);
      }
    }

    return NextResponse.json(
      { success: true, data: serializeSnapshot(applied.snapshot) },
      { status: 201 },
    );
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
